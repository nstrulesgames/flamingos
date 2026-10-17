import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {createStore} from '../lib/store.js';
import {createPostgresStore} from '../lib/postgres-store.js';
import {uiHarness,snapshot,product} from './helpers/ui-harness.js';

async function fixture(t,backend){
  let store;
  if(backend==='SQLite')store=createStore(':memory:',{demo:true});
  else{
    const db=new PGlite(),folder=new URL('../supabase/migrations/',import.meta.url);
    for(const name of (await readdir(folder)).filter(n=>n.endsWith('.sql')).sort())await db.exec(await readFile(new URL(name,folder),'utf8'));
    await db.exec('SET ROLE flamingo_app');
    let tail=Promise.resolve();
    const pool={connect:async()=>{const prior=tail;let release;tail=new Promise(r=>release=r);await prior;return {query:async(sql,args)=>{const r=await db.query(sql,args);return {...r,rowCount:r.affectedRows};},release};},end:()=>db.close()};
    store=await createPostgresStore(undefined,{pool});await store.setup({name:'Dueña',username:'admin',password:'Flamingo2026!'});await store.createUser((await store.login({username:'admin',password:'Flamingo2026!'})).user,{name:'Cajera',username:'camila',password:'Flamingo2026!',role:'cashier'});
  }
  t.after(()=>store.close());const owner=(await store.login({username:'admin',password:'Flamingo2026!'})).user,worker=(await store.login({username:'camila',password:'Flamingo2026!'})).user;
  const snap=()=>store.snapshot(owner),customer=await store.createCustomer(owner,{name:'Rosa'});
  const acai=(await snap()).products.find(p=>p.menu_key==='helado-de-acai');
  const open=async who=>store.openShift(who,{openingCash:10000,confirmed:true,openingStock:(await snap()).inventory.map(i=>({id:i.id,quantity:i.stock}))});
  const sell=(pay={},who=worker)=>store.sale(who,{requestId:randomUUID(),service:'local',items:[{id:acai.id,quantity:1,unitPrice:4000}],customerId:customer.id,...pay});
  const move=(kind,amount,method='none',who=owner,more={})=>store.creditOperation(who,customer.id,{requestId:randomUUID(),kind,amount,method,note:'Prueba documentada',...more});
  const detail=()=>store.customerDetail(owner,customer.id);
  const close=async()=>{let s=await snap();await store.startCount(owner,{shiftId:s.shift.id});const d=await store.shiftDetail(owner,s.shift.id),expected=d.baseline.expected_cash;const declaration=await store.submitCount(worker,{shiftId:s.shift.id,version:1,requestId:randomUUID(),countedCash:expected,counts:s.inventory.map(i=>({id:i.id,quantity:i.stock})),notes:''});await store.approveCount(owner,{shiftId:s.shift.id,declarationId:declaration.id});return expected;};
  const enable=async()=>{await store.updateCustomer(owner,customer.id,{allowFiado:true,creditLimit:10000});await store.updateUser(owner,worker.id,{canFiado:true});};
  return {store,owner,worker,snap,customer,open,sell,move,detail,close,enable};
}
for(const backend of ['SQLite','PostgreSQL']){
  test(`${backend}: fiado permissions, partial sales, later cash/QR payments and independent arqueos`,async t=>{
    const f=await fixture(t,backend),{store,owner,worker,customer}=f;await f.open(worker);
    await assert.rejects(async()=>f.sell({cash:1000,debt:3000}),/permiso/);
    await store.updateUser(owner,worker.id,{canFiado:true});
    await assert.rejects(async()=>f.sell({cash:1000,debt:3000}),/habilitar/);
    await f.enable();
    await assert.rejects(async()=>f.sell({cash:500,debt:3000}),/pagos/);
    await assert.rejects(async()=>f.sell({debt:4000}, {...worker,can_fiado:1,id:999}),/permiso|turno|sesión/);
    const id=randomUUID(),sale=await f.sell({requestId:id,cash:1000,debt:3000});
    assert.equal(sale.customer_balance,-3000);assert.equal(sale.debt,3000);assert((await f.detail()).debt_since);
    assert.equal((await store.sale(worker,{requestId:id})).id,sale.id);
    await assert.rejects(async()=>store.updateCustomer(owner,customer.id,{active:false}),/deuda/);
    assert.equal(await f.close(),11000);
    // Abono is posted in a later shift, never backdated or added to sales.
    await f.open(worker);
    const requestId=randomUUID();await f.move('payment',2000,'qr',worker,{requestId});await f.move('payment',2000,'qr',worker,{requestId});
    assert.equal((await f.detail()).balance,-1000);
    await f.move('payment',1000,'cash',worker);assert.equal((await f.detail()).balance,0);assert.equal((await f.detail()).debt_since,null);
    const report=await store.report(owner,'2020-01-01','2030-01-01');assert.equal(report.totals.total,4000);assert.equal(report.credit.receivable,0);assert.equal(report.totals.debt,3000);
    assert.equal(report.collections.qr,2000);assert.equal(report.collections.cash,1000);
    assert.equal(await f.close(),11000);
    const before=(await f.detail()).movements.length;
    await assert.rejects(async()=>f.move('payment',100,'qr',owner),/no tiene una deuda/);assert.equal((await f.detail()).movements.length,before);
  });
  test(`${backend}: competing fiado sales cannot exceed a customer's limit`,async t=>{
    const f=await fixture(t,backend);await f.open(f.worker);await f.enable();await f.store.updateCustomer(f.owner,f.customer.id,{creditLimit:6000});
    const results=await Promise.allSettled([Promise.resolve().then(()=>f.sell({debt:4000})),Promise.resolve().then(()=>f.sell({debt:4000}))]);
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.match(results.find(r=>r.status==='rejected').reason.message,/límite/);
    assert.equal((await f.detail()).balance,-4000);assert.equal((await f.snap()).sales.length,1);
  });
  test(`${backend}: limits, old debts, excess payments and corrections preserve balance ledger`,async t=>{
    const f=await fixture(t,backend);await f.open(f.worker);await f.enable();
    await f.store.updateCustomer(f.owner,f.customer.id,{creditLimit:3000});
    await assert.rejects(async()=>f.sell({debt:4000}),/límite/);
    assert.equal((await f.snap()).sales.length,0);assert.equal((await f.detail()).balance,0);
    await assert.rejects(async()=>f.move('opening_debt',1000,'none',f.worker),/Solo el propietario/);
    await f.move('opening_debt',1000);assert.equal((await f.detail()).balance,-1000);
    await assert.rejects(async()=>f.move('payment',1500,'cash',f.worker),/excedente/);
    const requestId=randomUUID();await f.move('payment',1500,'cash',f.worker,{requestId,allowExcess:true});assert.equal((await f.detail()).balance,500);
    const payment=(await f.detail()).movements.find(m=>m.kind==='payment');
    await f.move('reversal',0,'none',f.owner,{movementId:payment.id});assert.equal((await f.detail()).balance,-1000);
    await assert.rejects(async()=>f.move('reversal',0,'none',f.owner,{movementId:payment.id}),/ya fue anulado/);
    await f.move('payment',1000,'qr',f.worker);assert.equal((await f.detail()).balance,0);
    await f.move('deposit',500,'qr',f.worker);
    const deposit=(await f.detail()).movements.find(m=>m.kind==='deposit');
    await f.sell({credit:500,cash:500,debt:3000});
    await assert.rejects(async()=>f.move('reversal',0,'none',f.owner,{movementId:deposit.id}),/ya usó/);
    const d=await f.detail();assert.equal(d.balance,d.movements.reduce((sum,m)=>sum+m.amount,0));
    const r=await f.store.report(f.owner,'2020-01-01','2030-01-01');assert.equal(r.credit.receivable,3000);assert.equal(r.credit.owed,0);
    assert.equal(await f.close(),10500);
  });
  test(`${backend}: voiding repaid fiado preserves the customer's money as credit; count blocks ledger operations`,async t=>{
    const f=await fixture(t,backend);await f.open(f.worker);await f.enable();
    const sale=await f.sell({debt:4000});await f.move('payment',2000,'cash',f.worker);
    await f.store.voidSale(f.owner,sale.id,{reason:'Cancelación acordada'});assert.equal((await f.detail()).balance,2000);
    await f.move('refund',2000,'cash');assert.equal((await f.detail()).balance,0);
    await f.sell({debt:4000});const s=await f.snap();await f.store.startCount(f.owner,{shiftId:s.shift.id});
    await assert.rejects(async()=>f.move('payment',1000,'cash',f.worker),/arqueo/);
    await assert.rejects(async()=>f.store.updateCustomer(f.owner,f.customer.id,{allowFiado:false}),/arqueo/);
    await assert.rejects(async()=>f.sell({debt:4000}),/arqueo/);
    assert.equal((await f.store.shiftDetail(f.owner,s.shift.id)).baseline.expected_cash,10000);
  });
  test(`${backend}: owner edits, archives and restores without deleting receipts or stock history`,async t=>{
    const f=await fixture(t,backend),item=await f.store.addInventory(f.owner,{name:'Mal escrito',unit:'ud',minimum:0,packSize:1});
    await assert.rejects(async()=>f.store.updateInventory(f.worker,item.id,{active:false}),/Solo el propietario/);
    await f.store.updateInventory(f.owner,item.id,{name:'Corregido',minimum:4,packSize:10});
    await f.store.updateInventory(f.owner,item.id,{active:false});assert((await f.snap()).archivedInventory.some(i=>i.id===item.id));
    await f.store.updateInventory(f.owner,item.id,{active:true});assert((await f.snap()).inventory.some(i=>i.name==='Corregido'));
    const s=await f.snap(),p=s.products.find(p=>p.menu_key==='helado-de-acai');
    await f.store.setProductActive(f.owner,p.id,{active:false});assert.equal((await f.snap()).products.find(x=>x.id===p.id).active,0);
    await f.store.setProductActive(f.owner,p.id,{active:true});
    await f.store.stockMovement(f.owner,{itemId:item.id,quantity:10,kind:'restock',note:'Entrada'});
    await assert.rejects(async()=>f.store.updateInventory(f.owner,item.id,{active:false}),/existencias/);
    await assert.rejects(async()=>f.store.updateInventory(f.owner,item.id,{unit:'g'}),/historial/);
    await f.open(f.worker);await assert.rejects(async()=>f.store.updateInventory(f.owner,item.id,{active:false}),/entre turnos/);
    await f.store.updateInventory(f.owner,item.id,{name:'Nombre corregido'});
    await f.enable();const sale=await f.sell({cash:4000});await f.store.setProductActive(f.owner,p.id,{active:false});assert.equal((await f.store.receipt(f.owner,sale.id)).lines[0].name,p.name);
    assert.equal(await f.close(),14000);
    const fresh=await f.store.addInventory(f.owner,{name:'Ingrediente',unit:'ud',minimum:0});
    await f.store.saveProduct(f.owner,{name:'Receta',category:'Comida',price:100,inventoryMode:'recipe',recipe:[{item_id:fresh.id,quantity:1}]});
    await assert.rejects(async()=>f.store.updateInventory(f.owner,fresh.id,{active:false}),/receta/);
  });
}

test('SQLite schema 5 customer CHECK migration preserves IDs, related movements and foreign keys on reopen',async t=>{
  const folder=await mkdtemp(join(tmpdir(),'flamingo-ledger-')),path=join(folder,'old.sqlite');t.after(()=>rm(folder,{recursive:true,force:true}));
  let store=createStore(path,{demo:true});const owner=store.login({username:'admin',password:'Flamingo2026!'}).user,c=store.createCustomer(owner,{name:'Con historial'});
  store.creditOperation(owner,c.id,{requestId:'old-credit',kind:'deposit',amount:1000,method:'qr'});store.close();
  const db=new DatabaseSync(path);db.exec('PRAGMA foreign_keys=OFF; BEGIN; CREATE TABLE customers_old(id INTEGER PRIMARY KEY,name TEXT NOT NULL,phone TEXT NOT NULL DEFAULT \'\',balance INTEGER NOT NULL DEFAULT 0 CHECK(balance>=0),active INTEGER NOT NULL DEFAULT 1,created_by INTEGER NOT NULL REFERENCES users(id),created_at TEXT NOT NULL); INSERT INTO customers_old SELECT id,name,phone,balance,active,created_by,created_at FROM customers; DROP TABLE customers; ALTER TABLE customers_old RENAME TO customers; CREATE UNIQUE INDEX customers_name_idx ON customers(lower(name)); COMMIT;');db.close();
  store=createStore(path);store.creditOperation(owner,c.id,{requestId:'old-debt',kind:'opening_debt',amount:1500,note:'Registro anterior'});assert.equal(store.customerDetail(owner,c.id).balance,-500);store.close();
  const verify=new DatabaseSync(path);assert.deepEqual(verify.prepare('PRAGMA foreign_key_check').all(),[]);assert.equal(verify.prepare('SELECT count(*) n FROM credit_movements').get().n,2);verify.close();
  store=createStore(path);assert.equal(store.customerDetail(owner,c.id).balance,-500);store.close();
});

test('fiado payment UI sends the paid amount, remaining debt and selected customer; retry freezes them',async()=>{
  const h=uiHarness({state:snapshot({user:{id:2,role:'cashier',can_fiado:1},customers:[{id:9,name:'Rosa',balance:0,active:1,allow_fiado:1,credit_limit:10000}]})});
  h.run('cart=[{...initialState.products[0],quantity:1}];payment="fiado";customers.selected=()=>state.customers[0];');
  const f=h.form('payment-form',[['customerId','9'],['paidNow','2'],['paidMethod','qr']]);await h.listeners.submit(f.event);
  assert.equal(h.requests[0].body.qr,200);assert.equal(h.requests[0].body.debt,product.price-200);assert.equal(h.requests[0].body.cash,0);assert.equal(h.requests[0].body.customerId,9);
});
