import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir,mkdtemp,rm} from 'node:fs/promises';
import {join,resolve,basename} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {createStore} from '../lib/store.js';
import {createPostgresStore} from '../lib/postgres-store.js';
import {productsOnlyPlan} from '../lib/product-stock.js';
import {uiHarness} from './helpers/ui-harness.js';

async function fixture(t,backend){
  let store,reopen,query;
  if(backend==='SQLite'){
    const folder=await mkdtemp(join(tmpdir(),'flamingo-products-')),path=join(folder,'demo.sqlite'),opened=[];
    t.after(async()=>{for(const s of opened)s.close();assert(resolve(folder).startsWith(resolve(tmpdir())+'\\')&&basename(folder).startsWith('flamingo-products-'));await rm(folder,{recursive:true,force:true});});
    store=createStore(path,{demo:true});opened.push(store);const original=store;
    reopen=async()=>{store=createStore(path);opened.push(store);return store;};
    query=(sql,args=[])=>original.db.prepare(sql).run(...args);
  }else{
    const db=new PGlite(),folder=new URL('../supabase/migrations/',import.meta.url);
    for(const name of (await readdir(folder)).filter(n=>n.endsWith('.sql')).sort())await db.exec(await readFile(new URL(name,folder),'utf8'));
    await db.exec('SET ROLE flamingo_app');let tail=Promise.resolve();
    const pool={connect:async()=>{const previous=tail;let release;tail=new Promise(r=>release=r);await previous;return {query:async(sql,args)=>{const r=await db.query(sql,args);return {...r,rowCount:r.affectedRows};},release};},end:()=>db.close()};
    store=await createPostgresStore(undefined,{pool});t.after(()=>db.close());
    await store.setup({name:'Dueña',username:'admin',password:'Flamingo2026!'});
    const owner=(await store.login({username:'admin',password:'Flamingo2026!'})).user;await store.createUser(owner,{name:'Camila',username:'camila',password:'Flamingo2026!',role:'cashier'});
    reopen=()=>createPostgresStore(undefined,{pool});query=(sql,args=[])=>db.query(sql,args);
  }
  const owner=(await store.login({username:'admin',password:'Flamingo2026!'})).user,worker=(await store.login({username:'camila',password:'Flamingo2026!'})).user;
  const open=async s=>s.openShift(worker,{openingCash:10000,confirmed:true,openingStock:(await s.snapshot(owner)).inventory.map(i=>({id:i.id,quantity:i.stock}))});
  const close=async s=>{const state=await s.snapshot(owner);await s.startCount(owner,{shiftId:state.shift.id});const d=await s.shiftDetail(owner,state.shift.id),r=await s.submitCount(worker,{shiftId:state.shift.id,version:1,requestId:randomUUID(),countedCash:d.baseline.expected_cash,counts:state.inventory.map(i=>({id:i.id,quantity:i.stock})),notes:''});await s.approveCount(owner,{shiftId:state.shift.id,declarationId:r.id});};
  return {store,owner,worker,reopen,query,open,close};
}

for(const backend of ['SQLite','PostgreSQL']){
 test(`${backend}: product creation controls its own units without a separate ingredient setup`,async t=>{
  const f=await fixture(t,backend),{store,owner,worker}=f;
  const body={name:'Producto nuevo',category:'Comida',price:700,inventoryMode:'unit',minimum:2,packSize:5,active:true};
  await assert.rejects(async()=>store.saveProduct(worker,body),/Solo el propietario/);
  const result=await store.saveProduct(owner,body);let state=await store.snapshot(owner),p=state.products.find(p=>p.id===result.id),item=state.inventory.find(i=>i.id===p.stock_item_id);
  assert.equal(p.stock_mode,'unit');assert.equal(p.recipe.length,1);assert.equal(p.recipe[0].quantity,1);assert.equal(item.stock,0);assert.equal(item.pack_size,5);
  const stockId=item.id,length=state.inventory.length;
  await store.saveProduct(owner,{...body,id:p.id,name:'Producto corregido'});state=await store.snapshot(owner);p=state.products.find(p=>p.name==='Producto corregido');assert.equal(p.stock_item_id,stockId);assert.equal(state.inventory.length,length);
  await store.stockMovement(owner,{itemId:stockId,kind:'restock',quantity:10,note:'Entrega'});await f.open(store);
  await store.sale(worker,{requestId:randomUUID(),items:[{id:p.id,quantity:2}],cash:1400,tendered:1400,service:'local'});
  assert.equal((await store.snapshot(owner)).inventory.find(i=>i.id===stockId).stock,8);
  await assert.rejects(async()=>store.saveProduct(owner,{...body,id:p.id,inventoryMode:'untracked',recipe:[]}),/entre turnos/);
  await assert.rejects(async()=>store.setProductActive(owner,p.id,{active:false}),/entre turnos/);
  await assert.rejects(async()=>store.saveProduct(owner,{...body,id:p.id,active:false}),/entre turnos/);
  await f.close(store);
  // Switching off counting preserves the previous stock instead of inventing a waste movement.
  await store.saveProduct(owner,{...body,id:p.id,name:'Producto corregido',inventoryMode:'untracked',recipe:[]});state=await store.snapshot(owner);assert.equal(state.products.find(v=>v.id===p.id).stock_mode,'untracked');assert.equal(state.archivedInventory.find(i=>i.id===stockId).stock,8);
  await store.saveProduct(owner,{...body,id:p.id,name:'Producto corregido'});state=await store.snapshot(owner);assert.equal(state.products.find(v=>v.id===p.id).stock_item_id,stockId);assert.equal(state.inventory.find(i=>i.id===stockId).stock,8);
  await store.setProductActive(owner,p.id,{active:false});assert.equal((await store.snapshot(owner)).archivedInventory.find(i=>i.id===stockId).stock,8);
  await store.setProductActive(owner,p.id,{active:true});assert.equal((await store.snapshot(owner)).inventory.find(i=>i.id===stockId).stock,8);
 });
 test(`${backend}: existing shift keeps its old count; afterwards only finished products remain active`,async t=>{
  const f=await fixture(t,backend),{store,owner,worker}=f;
  const raw=await store.addInventory(owner,{name:'Mezcla anterior',unit:'g',minimum:0});await store.stockMovement(owner,{itemId:raw.id,kind:'restock',quantity:100,note:'Existencias anteriores'});
  const state=await store.snapshot(owner),coffee=state.products.find(p=>p.name==='Café americano'),beforeStocks=state.inventory.map(i=>[i.id,i.stock]);
  await store.saveProduct(owner,{...coffee,inventoryMode:'recipe',recipe:[{item_id:raw.id,quantity:15}]});
  await f.query("UPDATE flamingo.settings SET value='0' WHERE key='products_only_version'".replace(backend==='SQLite'?'flamingo.':'',''));
  await f.open(store);const updated=await f.reopen(),pending=await updated.snapshot(owner);assert.equal(pending.productsOnlyPending,true);assert.deepEqual(pending.inventory.map(i=>[i.id,i.stock]),beforeStocks);
  // The existing declaration is still complete and can close, without changing its expected quantities.
  await f.close(updated);const simplified=await updated.snapshot(owner);assert.equal(simplified.productsOnlyPending,false);assert.equal(simplified.products.find(p=>p.id===coffee.id).stock_mode,'untracked');
  assert(!simplified.inventory.some(i=>i.id===raw.id));assert.equal(simplified.archivedInventory.find(i=>i.id===raw.id).stock,100);
  const all=[...simplified.inventory,...simplified.archivedInventory];for(const [id,stock] of beforeStocks)assert.equal(all.find(i=>i.id===id).stock,stock);
  await f.open(updated);const next=await updated.snapshot(owner);assert(!next.inventory.some(i=>i.id===raw.id));
  await updated.sale(worker,{requestId:randomUUID(),items:[{id:coffee.id,quantity:1}],cash:coffee.price,tendered:coffee.price,service:'local'});
  assert.equal((await updated.snapshot(owner)).archivedInventory.find(i=>i.id===raw.id).stock,100);
 });
 test(`${backend}: a new unit product during an open shift enters its count at zero`,async t=>{
  const f=await fixture(t,backend);await f.open(f.store);const p=await f.store.saveProduct(f.owner,{name:'Nuevo durante el turno',category:'Comida',price:100,inventoryMode:'unit'});
  const state=await f.store.snapshot(f.owner),stock=state.products.find(x=>x.id===p.id).stock_item_id;assert.equal(state.inventory.find(i=>i.id===stock).stock,0);await f.close(f.store);
  const detail=await f.store.shiftDetail(f.owner,state.shift.id);assert.equal(detail.items.find(i=>i.item_id===stock).expected,0);
 });
}

test('shared or measured ingredients never become duplicated finished-product units',()=>{
 const products=[{id:1,name:'Bebida',active:1,inventory_mode:'recipe'},{id:2,name:'Preparado A',active:1,inventory_mode:'recipe'},{id:3,name:'Preparado B',active:1,inventory_mode:'recipe'}],recipes=[{product_id:1,item_id:10,quantity:1},{product_id:2,item_id:20,quantity:1},{product_id:3,item_id:20,quantity:1}],inventory=[{id:10,unit:'ud',active:1,stock:12},{id:20,unit:'ud',active:1,stock:100},{id:30,unit:'g',active:1,stock:500}];
 const plan=productsOnlyPlan(products,recipes,inventory);assert.deepEqual(plan.tracked.map(v=>v.item.id),[10]);assert.deepEqual(plan.salesOnly.map(v=>v.product.id),[2,3]);assert.deepEqual(plan.retire.map(v=>v.id),[20,30]);
});

test('the product form sends units and package configuration without recipe inputs',async()=>{
 const h=uiHarness();const f=h.form('product-form',[['name','Nuevo'],['category','Comida'],['price','7'],['inventoryMode','unit'],['minimum','2'],['packSize','5'],['active','on']]);
 f.element.querySelectorAll=()=>{throw Error('No ingredient controls should be read');};await h.listeners.submit(f.event);assert.equal(h.requests[0].body.inventoryMode,'unit');assert.equal(h.requests[0].body.minimum,2);assert.equal(h.requests[0].body.packSize,5);assert.equal(h.requests[0].body.recipe.length,0);
});
