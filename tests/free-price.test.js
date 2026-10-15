import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {createStore} from '../lib/store.js';
import {createPostgresStore} from '../lib/postgres-store.js';
import {uiHarness,snapshot,product} from './helpers/ui-harness.js';

async function fixture(t,backend){
  if(backend==='SQLite'){
    const store=createStore(':memory:',{demo:true});t.after(()=>store.close());
    return {store,owner:store.login({username:'admin',password:'Flamingo2026!'}).user,worker:store.login({username:'camila',password:'Flamingo2026!'}).user};
  }
  const db=new PGlite(),folder=new URL('../supabase/migrations/',import.meta.url);
  for(const name of (await readdir(folder)).filter(n=>n.endsWith('.sql')).sort())await db.exec(await readFile(new URL(name,folder),'utf8'));
  await db.exec('SET ROLE flamingo_app');
  const pool={connect:async()=>({query:async(sql,args)=>{const result=await db.query(sql,args);return {...result,rowCount:result.affectedRows};},release:()=>{}}),end:()=>db.close()};
  const store=await createPostgresStore(undefined,{pool});t.after(()=>store.close());
  const owner=await store.setup({name:'Dueña',username:'owner',password:'LibrePrecio2026!'});
  const worker=await store.createUser(owner,{name:'Cajera',username:'cashier',password:'LibrePrecio2026!',role:'cashier'});
  return {store,owner,worker};
}

for(const backend of ['SQLite','PostgreSQL'])test(`${backend}: cashier enters Açaí prices; receipts, saldo, void and count preserve actual amounts`,async t=>{
  const {store,owner,worker}=await fixture(t,backend);
  const state=await store.snapshot(owner),acai=state.products.find(p=>p.menu_key==='helado-de-acai'),fixed=state.products.find(p=>p.name==='Brownie');
  assert.equal(acai.allow_manual_price,1);assert.equal(acai.inventory_mode,'untracked');assert.equal(fixed.allow_manual_price,0);
  await store.openShift(worker,{openingCash:10000,confirmed:true,openingStock:state.inventory.map(i=>({id:i.id,quantity:i.stock}))});
  const sell=(items,pay={})=>store.sale(worker,{requestId:randomUUID(),service:'local',items,...pay});
  const config={...acai,inventoryMode:'untracked',pricingMode:'free',recipe:[]};
  await assert.rejects(async()=>store.saveProduct(worker,config),/Solo el propietario/);
  for(const price of [undefined,0,-1,1.5,'1850',10000001])await assert.rejects(async()=>sell([{id:acai.id,quantity:1,unitPrice:price}],{cash:1850,tendered:1850}),/importe|Importe/);
  await assert.rejects(async()=>sell([{id:fixed.id,quantity:1,unitPrice:1850}],{cash:1850,tendered:1850}),/no permite precio libre/);
  await assert.rejects(async()=>sell([{id:acai.id,quantity:1,unitPrice:1850,weightGrams:250}],{cash:1850,tendered:1850}),/cobro|peso/);
  await assert.rejects(async()=>sell([{id:acai.id,quantity:1,unitPrice:1850}],{cash:100,tendered:100}),/pagos/);
  const requestId=randomUUID(),items=[{id:acai.id,quantity:1,unitPrice:1850},{id:acai.id,quantity:1,unitPrice:2300},{id:acai.id,quantity:1,unitPrice:1850}];
  const sale=await store.sale(worker,{requestId,service:'local',items,cash:6000,tendered:10000});
  assert.equal(sale.total,6000);assert.equal(sale.change_due,4000);assert.equal(sale.user_id,worker.id);
  assert.deepEqual(sale.lines.map(l=>[l.quantity,l.price,l.manual_price,l.weight_grams]),[[2,1850,1,null],[1,2300,1,null]]);
  assert.equal((await store.sale(worker,{requestId,items:[]})).id,sale.id);
  assert.deepEqual((await store.snapshot(owner)).inventory,state.inventory);
  const customer=await store.createCustomer(worker,{name:'Cliente libre'});
  await store.creditOperation(worker,customer.id,{requestId:randomUUID(),kind:'deposit',method:'qr',confirmed:true,amount:2000,note:'Recarga'});
  const creditSale=await sell([{id:acai.id,quantity:1,unitPrice:1750}],{customerId:customer.id,credit:1750});
  assert.equal(creditSale.total,1750);assert.equal(creditSale.customer_balance,250);
  await store.saveProduct(owner,{...config,pricingMode:'unit',price:9900});
  const history=await store.receipt(owner,sale.id);assert.equal(history.lines[0].price,1850);assert.equal(history.lines[0].manual_price,1);
  assert.equal((await store.report(owner,'2026-01-01','2030-01-01')).top.find(p=>p.name==='Helado de Açaí').total,7750);
  await store.voidSale(owner,creditSale.id,{reason:'Devolución de prueba'});assert.equal((await store.snapshot(owner)).customers.find(c=>c.id===customer.id).balance,2000);
  const current=await store.snapshot(owner);await store.startCount(owner,{shiftId:current.shift.id});
  assert.equal((await store.shiftDetail(owner,current.shift.id)).baseline.expected_cash,16000);
});

const acai={...product,id:39,name:'Helado de Açaí',price:100,allow_manual_price:1,pricing_mode:'unit'};
test('cart separates free amounts and keeps them when the catalog price changes',()=>{
  const h=uiHarness({state:snapshot({products:[{...acai}]})});h.run('renderCart=()=>{};');
  assert.equal(h.run('addProduct(39,1,null,1850)'),true);assert.equal(h.run('addProduct(39,1,null,2300)'),true);assert.equal(h.run('addProduct(39,1,null,1850)'),true);
  assert.equal(h.run('cart.length'),2);assert.equal(h.run('cartTotal()'),6000);
  h.run('state.products[0].price=9999;syncCartWithCatalog();');assert.equal(h.run('cartTotal()'),6000);
  assert.equal(h.run('addProduct(39,-1,null,2300)'),true);assert.equal(h.run('cart.length'),1);assert.equal(h.run('cartTotal()'),3700);
  h.run('state.products[0].allow_manual_price=0;syncCartWithCatalog();');assert.equal(h.run('cart.length'),0);
});
test('free price can be edited and an invalid amount cannot enter the order',async()=>{
  const h=uiHarness({state:snapshot({products:[{...acai}]})});h.run('renderCart=()=>{};addProduct(39,1,null,1850);addProduct(39,1,null,2300);');
  const invalid=h.form('free-price-form',[['id','39'],['unitPrice','0']]);await h.listeners.submit(invalid.event);
  assert.equal(h.run('cartTotal()'),4150);assert.match(h.error.textContent,/importe válido/);
  const edit=h.form('free-price-form',[['id','39'],['oldPrice','1850'],['unitPrice','20.50']]);await h.listeners.submit(edit.event);
  assert.equal(h.run('cartTotal()'),4350);assert.equal(h.run('cart.length'),2);assert.equal(h.closed,1);
});
test('payment retries preserve the exact free amount and the price cannot be supplied for a fixed item',async()=>{
  const h=uiHarness({state:snapshot({products:[{...acai}]})});h.run('renderCart=()=>{};addProduct(39,1,null,1850);');
  h.context.testApi=async(path,body)=>{h.requests.push({path,body});if(h.requests.length===1)throw new Error('No connection');return {id:1};};
  const form=h.form('payment-form',[['tendered','20']]);await h.listeners.submit(form.event);
  assert.equal(h.requests[0].body.items[0].unitPrice,1850);
  h.run('cart=[]');await h.listeners.submit(form.event);assert.deepEqual(h.requests[0].body,h.requests[1].body);
  const fixed=uiHarness();fixed.run('renderCart=()=>{};');assert.equal(fixed.run('addProduct(25,1,null,1850)'),false);assert.equal(fixed.run('cart.length'),0);
});
test('editing a free product does not require or replace its hidden catalog price',async()=>{
  const h=uiHarness({state:snapshot({products:[acai]})});
  const form=h.form('product-form',[['id','39'],['name','Helado de Açaí'],['category','Helados'],['pricingMode','free'],['inventoryMode','untracked'],['active','on']]);
  await h.listeners.submit(form.event);assert.equal(h.requests.length,1);assert.equal(h.requests[0].body.pricingMode,'free');assert.equal('price' in h.requests[0].body,false);
});
