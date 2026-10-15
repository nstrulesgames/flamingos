import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PGlite} from '@electric-sql/pglite';
import {createStore} from '../lib/store.js';
import {createPostgresStore} from '../lib/postgres-store.js';
import {servingPrice} from '../public/pricing.js';
import {uiHarness,snapshot} from './helpers/ui-harness.js';
import {createApp} from '../server.js';

async function fixture(t,backend){
  let store;
  if(backend==='SQLite'){
    store=createStore(':memory:',{demo:true});t.after(()=>store.close());
    return {store,owner:store.login({username:'admin',password:'Flamingo2026!'}).user,worker:store.login({username:'camila',password:'Flamingo2026!'}).user};
  }
  const db=new PGlite();
  const folder=new URL('../supabase/migrations/',import.meta.url);
  for(const name of (await readdir(folder)).filter(n=>n.endsWith('.sql')).sort())await db.exec(await readFile(new URL(name,folder),'utf8'));
  await db.exec('SET ROLE flamingo_app');
  const pool={connect:async()=>({query:async(sql,args)=>{const r=await db.query(sql,args);return {...r,rowCount:r.affectedRows};},release:()=>{}}),end:()=>db.close()};
  store=await createPostgresStore(undefined,{pool});t.after(()=>store.close());
  const owner=await store.setup({name:'Dueña',username:'owner',password:'PruebaPeso2026!'});
  const worker=await store.createUser(owner,{name:'Cajera',username:'cashier',password:'PruebaPeso2026!',role:'cashier'});
  return {store,owner,worker,db};
}

for(const backend of ['SQLite','PostgreSQL'])test(`${backend}: Açaí defaults to Bs 1 sales only; weighted totals, history, credit and count are consistent`,async t=>{
  const {store,owner,worker}=await fixture(t,backend);
  let state=await store.snapshot(owner),acai=state.products.find(p=>p.menu_key==='helado-de-acai');
  assert.equal(acai.price,100);assert.equal(acai.inventory_mode,'untracked');assert.equal(acai.pricing_mode,'unit');assert.equal(acai.active,1);assert.equal(acai.recipe.length,0);
  const inventory=state.inventory;
  await store.saveProduct(owner,{...acai,inventoryMode:'untracked',pricingMode:'unit',recipe:[]});
  await store.openShift(worker,{openingCash:10000,confirmed:true,openingStock:inventory.map(i=>({id:i.id,quantity:i.stock}))});
  const sell=(items,pay={})=>store.sale(worker,{requestId:randomUUID(),items,service:'local',...pay});
  const unit=await sell([{id:acai.id,quantity:2}],{cash:200,tendered:200});
  assert.equal(unit.total,200);assert.equal(unit.lines[0].weight_grams,null);
  const config={...acai,inventoryMode:'untracked',recipe:[],pricingMode:'weight',weightBasisGrams:100,price:750};
  await assert.rejects(async()=>store.saveProduct(worker,config),/Solo el propietario/);
  await store.saveProduct(owner,config);
  for(const weight of [undefined,0,-1,1.5,'250',100001])await assert.rejects(async()=>sell([{id:acai.id,quantity:1,weightGrams:weight}],{cash:1875,tendered:1875}),/Peso|peso|cobro/);
  await assert.rejects(async()=>sell([{id:acai.id,quantity:1,weightGrams:250,price:1}],{cash:1,tendered:1}),/pagos/);
  const requestId=randomUUID(),items=[{id:acai.id,quantity:1,weightGrams:250},{id:acai.id,quantity:1,weightGrams:125},{id:acai.id,quantity:1,weightGrams:250}];
  const weighted=await store.sale(worker,{requestId,items,service:'local',cash:4688,tendered:5000});
  assert.equal(weighted.total,4688);assert.equal(weighted.change_due,312);assert.equal(weighted.lines.length,2);
  assert.deepEqual(weighted.lines.map(l=>[l.weight_grams,l.quantity,l.price,l.weight_price,l.weight_basis_grams]),[[250,2,1875,750,100],[125,1,938,750,100]]);
  const retry=await store.sale(worker,{requestId,items:[],service:'local'});assert.equal(retry.id,weighted.id);
  assert.deepEqual((await store.snapshot(owner)).inventory,inventory);
  const customer=await store.createCustomer(worker,{name:'Cliente Açaí'});
  await store.creditOperation(worker,customer.id,{requestId:randomUUID(),kind:'deposit',method:'qr',amount:1000,confirmed:true,note:'Recarga de prueba'});
  const withCredit=await sell([{id:acai.id,quantity:1,weightGrams:100}],{credit:750,customerId:customer.id});
  assert.equal(withCredit.total,750);assert.equal(withCredit.customer_balance,250);
  await store.saveProduct(owner,{...config,price:1234,weightBasisGrams:1000});
  const receipt=await store.receipt(owner,weighted.id);assert.equal(receipt.lines[0].weight_price,750);assert.equal(receipt.lines[0].weight_basis_grams,100);assert.equal(receipt.lines[0].price,1875);
  const report=await store.report(owner,'2026-01-01','2030-01-01');assert.equal(report.top.find(p=>p.name==='Helado de Açaí').total,5638);
  await store.voidSale(owner,withCredit.id,{reason:'Anulación de prueba'});assert.equal((await store.snapshot(owner)).customers.find(c=>c.id===customer.id).balance,1000);
  await store.voidSale(owner,weighted.id,{reason:'Anulación de prueba'});
  state=await store.snapshot(owner);await store.startCount(owner,{shiftId:state.shift.id});
  assert.equal((await store.shiftDetail(owner,state.shift.id)).baseline.expected_cash,10200);
  await assert.rejects(async()=>sell([{id:acai.id,quantity:1,weightGrams:100}],{cash:123,tendered:123}),/arqueo/);
});

test('pricing uses whole grams and rounds each serving to centavos, including kg rates',()=>{
  assert.equal(servingPrice({pricing_mode:'weight',price:1234,weight_basis_grams:1000},333),411);
  assert.equal(servingPrice({pricing_mode:'weight',price:750,weight_basis_grams:100},125),938);
  for(const value of [null,0,-1,1.1,NaN,Infinity,100001])assert.equal(servingPrice({pricing_mode:'weight',price:100},value),null);
});

test('weighted cart keeps different serving weights separate, changes rates and removes stale pricing modes',()=>{
  const acai={id:39,name:'Helado de Açaí',price:750,active:1,inventory_mode:'untracked',pricing_mode:'weight',weight_basis_grams:100,recipe:[]};
  const h=uiHarness({state:snapshot({products:[acai]})});h.run('renderCart=()=>{};');
  assert.equal(h.run('addProduct(39,1,250)'),true);assert.equal(h.run('addProduct(39,1,125)'),true);assert.equal(h.run('addProduct(39,1,250)'),true);
  assert.equal(h.run('cart.length'),2);assert.equal(h.run('cartTotal()'),4688);
  h.run('state.products[0].price=800;syncCartWithCatalog();');assert.equal(h.run('cartTotal()'),5000);assert.equal(h.run('cart[0].weight_grams'),250);
  assert.equal(h.run('addProduct(39,-1,125)'),true);assert.equal(h.run('cart.length'),1);assert.equal(h.run('cart[0].quantity'),2);
  h.run("state.products[0].pricing_mode='unit';syncCartWithCatalog();");assert.equal(h.run('cart.length'),0);
});

test('payment sends grams and retains them across an uncertain retry',async()=>{
  const h=uiHarness();
  h.run("cart=[{id:39,name:'Açaí',price:1875,quantity:1,weight_grams:250}];");
  h.context.testApi=async(path,body)=>{h.requests.push({path,body});if(h.requests.length===1)throw new Error('Connection lost');return {id:1};};
  const form=h.form('payment-form',[['tendered','20']]);
  await h.listeners.submit(form.event);assert.equal(h.requests[0].body.items[0].weightGrams,250);
  h.run('cart=[]');await h.listeners.submit(form.event);
  assert.deepEqual(h.requests[1].body,h.requests[0].body);assert.equal(h.receipts.length,1);
});

test('HTTP serves the pricing module needed to load the new mobile app',async t=>{
  const {server,store}=createApp({database:':memory:',demo:true});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));store.close();});
  const response=await fetch(`http://127.0.0.1:${server.address().port}/pricing.js`);
  assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/javascript/);
  assert.match(await response.text(),/export function servingPrice/);
});

test('an existing open shift gains sales-only Açaí once without changing stock or subsequent owner settings',t=>{
  const dir=mkdtempSync(join(tmpdir(),'flamingo-weight-')),file=join(dir,'store.sqlite');
  t.after(()=>rmSync(dir,{recursive:true,force:true}));
  let store=createStore(file,{demo:true}),owner=store.login({username:'admin',password:'Flamingo2026!'}).user;
  let state=store.snapshot(owner),acai=state.products.find(p=>p.menu_key==='helado-de-acai');
  store.openShift(owner,{openingCash:10000,confirmed:true,openingStock:state.inventory.map(i=>({id:i.id,quantity:i.stock}))});
  store.db.prepare('DELETE FROM products WHERE id=?').run(acai.id);store.close();
  store=createStore(file,{demo:true});
  state=store.snapshot(owner);acai=state.products.find(p=>p.menu_key==='helado-de-acai');
  assert.equal(state.products.filter(p=>p.menu_key==='helado-de-acai').length,1);assert.equal(state.shift.stage,'open');assert.equal(acai.price,100);
  const inventory=state.inventory;
  store.saveProduct(owner,{...acai,price:350,inventoryMode:'untracked',recipe:[],pricingMode:'weight',weightBasisGrams:1000});store.close();
  store=createStore(file,{demo:true});state=store.snapshot(owner);
  assert.deepEqual(state.inventory,inventory);assert.equal(state.products.filter(p=>p.menu_key==='helado-de-acai').length,1);
  acai=state.products.find(p=>p.menu_key==='helado-de-acai');assert.equal(acai.price,350);assert.equal(acai.pricing_mode,'weight');assert.equal(acai.weight_basis_grams,1000);
  store.close();
});
