import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore } from '../lib/store.js';
import { createApp } from '../server.js';

function fixture(t){
  const store=createStore(':memory:',{demo:true,catalog:'legacy'});t.after(()=>store.close());
  const owner=store.login({username:'admin',password:'Flamingo2026!'}).user;
  const worker=store.login({username:'camila',password:'Flamingo2026!'}).user;
  const stock=store.snapshot(owner).inventory;
  const openingStock=stock.map(i=>({id:i.id,quantity:i.stock}));
  const shift=store.openShift(worker,{openingCash:10000,openingStock,confirmed:true});
  const body=(overrides={})=>({shiftId:shift.id,version:store.snapshot(owner).shift?.count_version??1,requestId:randomUUID(),countedCash:10000,counts:openingStock.map(i=>({...i})),notes:'',...overrides});
  return {store,owner,worker,shift,body,openingStock};
}
test('only the shift worker declares; only owners review; unrelated workers cannot read',t=>{
  const {store,owner,worker,shift,body}=fixture(t);
  const other=store.createUser(owner,{name:'Otra',username:'otra',password:'UnaClaveSegura!',role:'cashier'});
  assert.throws(()=>store.startCount(other,{shiftId:shift.id}),/responsable/);
  assert.throws(()=>store.shiftDetail(other,shift.id),/No puedes consultar/);
  store.startCount(owner,{shiftId:shift.id});
  // The owner may count for an absent worker, but must say why.
  assert.throws(()=>store.submitCount(owner,{...body(),notes:''}),/Motivo/);
  assert.throws(()=>store.submitCount(other,body()),/trabajador responsable/);
  const d=store.submitCount(worker,body());
  assert.throws(()=>store.approveCount(worker,{shiftId:shift.id,declarationId:d.id}),/Solo el propietario/);
  assert.throws(()=>store.requestRecount(worker,{shiftId:shift.id,declarationId:d.id,reason:'otro'}),/Solo el propietario/);
  assert.equal(store.shiftDetail(owner,shift.id).declarations[0].author,'Camila');
});
test('freezing blocks every inventory and cash mutation while allowing a committed sale retry',t=>{
  const {store,owner,worker,shift,body}=fixture(t);
  const sale={requestId:randomUUID(),items:[{id:5,quantity:1}],cash:800,tendered:1000,service:'local'};
  const receipt=store.sale(worker,sale);store.startCount(worker,{shiftId:shift.id});
  const checkFrozen=()=>{
    assert.throws(()=>store.sale(worker,{...sale,requestId:randomUUID()}),/pausadas/);
    assert.throws(()=>store.stockMovement(owner,{itemId:5,quantity:3,kind:'restock',note:'Entrega'}),/pausadas/);
    assert.throws(()=>store.stockMovement(owner,{itemId:5,quantity:1,kind:'waste',note:'Daño'}),/pausadas/);
    assert.throws(()=>store.voidSale(owner,receipt.id,{reason:'Reembolso'}),/pausadas/);
    assert.throws(()=>store.addInventory(owner,{name:'Extra',unit:'ud',minimum:1}),/arqueo/);
    assert.throws(()=>store.saveProduct(owner,{}),/pausadas/);
    assert.equal(store.sale(worker,sale).id,receipt.id);
  };
  checkFrozen();const d=store.submitCount(worker,body());checkFrozen();
  store.requestRecount(owner,{shiftId:shift.id,declarationId:d.id,reason:'Revisar nevera'});checkFrozen();
});
test('blind API hides balances, availability, cash expectation and opening stock',t=>{
  const {store,owner,worker,shift}=fixture(t);store.startCount(worker,{shiftId:shift.id});
  const s=store.snapshot(worker),detail=store.shiftDetail(worker,shift.id);
  assert.equal(s.blind,true);assert(s.inventory.every(i=>!('stock' in i)));
  assert(s.products.every(i=>i.available===null));assert(!('opening_cash' in s.shift));assert(!('expected_cash' in s.shift));assert(!('cash' in s.shifts[0]));
  assert(detail.items.every(i=>!('expected' in i)&&!('opening' in i)));
  assert(!('baseline' in detail));assert(!('counts' in detail));
  assert.equal(store.shiftDetail(owner,shift.id).baseline.expected_cash,10000);
});
test('submitting is immutable and idempotent; it does not change stock or close the shift',t=>{
  const {store,owner,worker,shift,body}=fixture(t);store.startCount(worker,{shiftId:shift.id});
  const b=body();b.counts[0].quantity-=1;
  const d=store.submitCount(worker,b);assert.equal(store.submitCount(worker,b).id,d.id);
  assert.equal(store.snapshot(owner).shift.stage,'review');assert.equal(store.snapshot(owner).shift.closed_at,null);
  const before=store.shiftDetail(owner,shift.id).items[0];assert.equal(store.snapshot(owner).inventory.find(i=>i.id===before.item_id).stock,before.expected);
  assert.throws(()=>store.submitCount(worker,{...b,requestId:randomUUID()}),/ya fue enviada/);
  assert.equal(store.shiftDetail(owner,shift.id).declarations.length,1);
});
test('recounts preserve all declarations, author, time and reason against the original baseline',t=>{
  const {store,owner,worker,shift,body}=fixture(t);store.startCount(worker,{shiftId:shift.id});
  const first=body();first.counts.find(i=>i.id===5).quantity=30;
  const d1=store.submitCount(worker,first);
  assert.throws(()=>store.requestRecount(owner,{shiftId:shift.id,declarationId:d1.id,reason:''}),/Motivo/);
  const requested=store.requestRecount(owner,{shiftId:shift.id,declarationId:d1.id,reason:'Revisar la nevera lateral'});assert.equal(requested.version,2);
  assert.throws(()=>store.approveCount(owner,{shiftId:shift.id,declarationId:d1.id,notes:'x'}),/Primero debe enviarse/);
  assert.throws(()=>store.submitCount(worker,body({version:1})),/versión del conteo/);
  assert.throws(()=>store.submitCount(worker,body()),/Explicación del reconteo/);
  const d2=store.submitCount(worker,body({notes:'Las cinco botellas estaban en la nevera lateral.'}));
  assert.throws(()=>store.approveCount(owner,{shiftId:shift.id,declarationId:d1.id}),/última declaración/);
  const detail=store.shiftDetail(owner,shift.id);
  assert.equal(detail.declarations.length,2);assert.equal(detail.declarations[1].items.find(i=>i.item_id===5).quantity,30);
  assert.equal(detail.declarations[0].items.find(i=>i.item_id===5).quantity,35);
  assert.equal(detail.items.find(i=>i.item_id===5).expected,35);
  assert.equal(detail.requests[0].requester,'Valentina');assert(detail.requests[0].created_at);
  store.approveCount(owner,{shiftId:shift.id,declarationId:d2.id});
  assert.equal(store.shiftDetail(owner,shift.id).baseline.approver,'Valentina');
});
test('approval uses latest declaration, requires explanation, adjusts once and seeds next shift',t=>{
  const {store,owner,worker,shift,body}=fixture(t);store.startCount(worker,{shiftId:shift.id});
  const b=body({countedCash:9500});b.counts.find(i=>i.id===5).quantity=33;
  const d=store.submitCount(worker,b);
  assert.throws(()=>store.approveCount(owner,{shiftId:shift.id,declarationId:d.id}),/Explica las diferencias/);
  const approval={shiftId:shift.id,declarationId:d.id,notes:'Revisado: faltan dos botellas y Bs 5.'};
  const result=store.approveCount(owner,approval);
  assert.equal(result.difference,-500);assert.equal(store.approveCount(owner,approval).difference,-500);
  assert.equal(store.db.prepare("SELECT COUNT(*) n FROM movements WHERE kind='count'").get().n,1);
  assert.equal(store.snapshot(owner).inventory.find(i=>i.id===5).stock,33);
  const openingStock=store.snapshot(owner).inventory.map(i=>({id:i.id,quantity:i.stock}));
  store.openShift(worker,{openingCash:5000,openingStock,confirmed:true});
  assert.equal(store.db.prepare('SELECT opening FROM shift_stock WHERE shift_id=2 AND item_id=5').get().opening,33);
  const original=store.shiftDetail(owner,shift.id);assert.equal(original.items.find(i=>i.item_id===5).expected,35);
  assert.equal(original.declarations.length,1);assert(original.baseline.approved_at);
});
test('approval cannot silently accept unexpected database changes after freezing',t=>{
  const {store,owner,worker,shift,body}=fixture(t);store.startCount(worker,{shiftId:shift.id});const d=store.submitCount(worker,body());
  store.db.prepare('UPDATE inventory SET stock=stock+1 WHERE id=5').run();
  assert.throws(()=>store.approveCount(owner,{shiftId:shift.id,declarationId:d.id}),/inventario cambió/);
  assert.equal(store.snapshot(owner).shift.stage,'review');
  assert.equal(store.db.prepare('SELECT COUNT(*) n FROM counts').get().n,0);
});
test('opening receipt must be explicit, complete and current',t=>{
  const store=createStore(':memory:',{demo:true,catalog:'legacy'});t.after(()=>store.close());const user=store.login({username:'camila',password:'Flamingo2026!'}).user;
  const openingStock=store.snapshot(user).inventory.map(i=>({id:i.id,quantity:i.stock}));
  assert.throws(()=>store.openShift(user,{openingCash:0,openingStock}),/Confirma/);
  assert.throws(()=>store.openShift(user,{openingCash:0,confirmed:true,openingStock:openingStock.slice(1)}),/todos los productos/);
  openingStock[0].quantity++;
  assert.throws(()=>store.openShift(user,{openingCash:0,confirmed:true,openingStock}),/inventario inicial cambió/);
  assert.equal(store.snapshot(user).shift,null);
});
test('migration preserves legacy closed counts and resumes review after restart',()=>{
  const directory=mkdtempSync(join(tmpdir(),'flamingo-migration-')),path=join(directory,'data.sqlite');let store;
  try{
    const old=new DatabaseSync(path);
    old.exec("CREATE TABLE shifts(id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL,opened_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),closed_at TEXT,opening_cash INTEGER NOT NULL,expected_cash INTEGER,counted_cash INTEGER,cash_difference INTEGER,notes TEXT); INSERT INTO shifts VALUES(7,1,'2026-10-01','2026-10-01',100,100,100,0,'Histórico');");old.close();
    store=createStore(path,{demo:true,catalog:'legacy'});const owner=store.login({username:'admin',password:'Flamingo2026!'}).user;
    assert.equal(store.shiftDetail(owner,7).stage,'closed');assert.equal(store.shiftDetail(owner,7).notes,'Histórico');
    const stock=store.snapshot(owner).inventory.map(i=>({id:i.id,quantity:i.stock}));
    const s=store.openShift(owner,{openingCash:100,confirmed:true,openingStock:stock});store.startCount(owner,{shiftId:s.id});
    store.submitCount(owner,{shiftId:s.id,version:1,requestId:randomUUID(),countedCash:100,counts:stock});store.close();store=createStore(path,{catalog:'legacy'});
    assert.equal(store.snapshot(owner).shift.stage,'review');assert.equal(store.shiftDetail(owner,s.id).declarations.length,1);
    assert.equal(store.shiftDetail(owner,7).notes,'Histórico');
  }finally{store?.close();rmSync(directory,{recursive:true,force:true});}
});
test('HTTP worker-to-owner workflow preserves role boundaries and rejects stale approvals',async t=>{
  const {server,store}=createApp({database:':memory:',demo:true,catalog:'legacy'});await new Promise(r=>server.listen(0,'127.0.0.1',r));
  t.after(()=>{server.closeAllConnections();server.close();store.close();});const base=`http://127.0.0.1:${server.address().port}`;
  async function call(path,body,cookie){const r=await fetch(base+'/api'+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json','X-Flamingo-Request':'1',...(cookie?{Cookie:cookie}:{})},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
  const w=(await call('/login',{username:'camila',password:'Flamingo2026!'})).cookie,a=(await call('/login',{username:'admin',password:'Flamingo2026!'})).cookie;
  const state=(await call('/state',undefined,w)).data;
  const stock=state.inventory.map(i=>({id:i.id,quantity:i.stock}));
  const s=(await call('/shifts/open',{openingCash:0,confirmed:true,openingStock:stock},w)).data;
  assert.equal((await call('/shifts/count/start',{shiftId:s.id},w)).status,200);
  const blind=(await call('/shifts/'+s.id,undefined,w)).data;assert(!('baseline' in blind));
  const d=(await call('/shifts/count/submit',{shiftId:s.id,version:1,requestId:randomUUID(),counts:stock,countedCash:0},w)).data;
  assert.equal((await call('/shifts/count/approve',{shiftId:s.id,declarationId:d.id},w)).status,403);
  assert.equal((await call('/shifts/count/approve',{shiftId:s.id,declarationId:d.id+1},a)).status,409);
  assert.equal((await call('/shifts/count/approve',{shiftId:s.id,declarationId:d.id},a)).status,200);
  assert.equal((await call('/state',undefined,a)).data.shift,null);
});
