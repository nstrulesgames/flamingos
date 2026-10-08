import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../lib/store.js';
import { createApp } from '../server.js';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function fixture(t) {
  const store=createStore(':memory:',{demo:true,catalog:'legacy'});t.after(()=>store.close());
  const owner=store.login({username:'admin',password:'Flamingo2026!'}).user;
  const cashier=store.login({username:'camila',password:'Flamingo2026!'}).user;
  const sale=(user=owner,overrides={})=>store.sale(user,{requestId:randomUUID(),items:[{id:5,quantity:2}],cash:1600,tendered:2000,qr:0,card:0,service:'local',...overrides});
  return {store,owner,cashier,sale};
}
function open(store,user,openingCash) {
  return store.openShift(user,{openingCash,confirmed:true,openingStock:store.snapshot(user).inventory.map(i=>({id:i.id,quantity:i.stock}))});
}
function declaration(store,owner,overrides={}) {
  const s=store.snapshot(owner);
  store.startCount(owner,{shiftId:s.shift.id});
  return {shiftId:s.shift.id,version:1,requestId:randomUUID(),countedCash:s.shift.opening_cash+(s.shift.cash||0),counts:s.inventory.map(i=>({id:i.id,quantity:i.stock})),notes:'',...overrides};
}
function closure(store,owner) {
  const body=declaration(store,owner);
  const d=store.submitCount(owner,body);
  return {shiftId:body.shiftId,declarationId:d.id};
}
test('bootstrap creates a real owner and a catalog with no invented stock',t=>{
  const store=createStore(':memory:',{catalog:'legacy'});t.after(()=>store.close());
  assert.equal(store.isSetup(),false);
  const owner=store.setup({name:'Propietario',username:'owner',password:'suficientementelarga'});
  assert.equal(store.isSetup(),true);
  assert.equal(store.snapshot(owner).products.length,12);
  assert(store.snapshot(owner).inventory.every(i=>i.stock===0));
  assert.throws(()=>store.setup({}),/ya está configurado/);
  assert.throws(()=>store.login({username:'owner',password:'incorrecta'}),/incorrectos/);
  const login=store.login({username:'owner',password:'suficientementelarga'});
  assert.equal(store.authenticate(login.token).id,owner.id);store.logout(login.token);assert.equal(store.authenticate(login.token),undefined);
});
test('email identifiers support owner setup, cashier creation and case-insensitive login',t=>{
  const store=createStore(':memory:');t.after(()=>store.close());
  const email='Owner.Name+POS@flamingos-establecimiento.example';
  const password='ClaveDePrueba2026!';
  const owner=store.setup({name:'Propietaria',username:email,password});
  assert.equal(owner.username,email.toLowerCase());
  assert.equal(store.login({username:` ${email.toUpperCase()} `,password}).user.id,owner.id);
  const worker=store.createUser(owner,{name:'Cajera',username:'Caja@flamingos.example',password,role:'cashier'});
  assert.equal(store.login({username:'CAJA@FLAMINGOS.EXAMPLE',password}).user.id,worker.id);
  assert.throws(()=>store.createUser(owner,{name:'Duplicada',username:email.toUpperCase(),password,role:'cashier'}),/ya existe/);
  for(const username of ['persona@','persona@@correo.com','persona@correo..com','.persona@correo.com','persona..dos@correo.com'])
    assert.throws(()=>store.createUser(owner,{name:'Inválida',username,password,role:'cashier'}),/correo electrónico válido/);
});

test('cash sale is atomic, authoritative, updates stock and computes change',t=>{
  const {store,owner,sale}=fixture(t);open(store,owner,10000);
  const before=store.snapshot(owner).inventory.find(i=>i.id===5).stock;
  const s=sale();assert.equal(s.total,1600);assert.equal(s.change_due,400);assert.equal(s.lines[0].quantity,2);
  assert.equal(store.snapshot(owner).inventory.find(i=>i.id===5).stock,before-2);
  assert.equal(store.snapshot(owner).shift.cash,1600);
});
test('retry with the same key records and deducts exactly once',t=>{
  const {store,owner,sale}=fixture(t);open(store,owner,0);
  const requestId=randomUUID(),first=sale(owner,{requestId}),second=sale(owner,{requestId});
  assert.equal(first.id,second.id);assert.equal(store.snapshot(owner).sales.length,1);
  assert.equal(store.snapshot(owner).inventory.find(i=>i.id===5).stock,33);
});
test('shared ingredients are aggregated; oversell rolls back all sale records',t=>{
  const {store,owner,sale}=fixture(t);open(store,owner,0);
  store.db.prepare('UPDATE inventory SET stock=2 WHERE id=14').run();
  assert.throws(()=>sale(owner,{items:[{id:1,quantity:1},{id:2,quantity:1}],cash:5400,tendered:5400}),/Stock insuficiente/);
  assert.equal(store.snapshot(owner).sales.length,0);
  assert.equal(store.snapshot(owner).inventory.find(i=>i.id===13).stock,105);
  const s=sale(owner,{items:[{id:2,quantity:1}],cash:3200,tendered:3200});assert.equal(s.total,3200);
  assert.equal(store.snapshot(owner).inventory.find(i=>i.id===14).stock,0);
  assert.equal(store.snapshot(owner).products.find(p=>p.id===1).available,0);
});
test('reject invalid payments, fractional or negative quantities and forged prices',t=>{
  const {store,owner,sale}=fixture(t);open(store,owner,0);
  for(const body of [{cash:1},{tendered:100},{cash:-1},{items:[{id:5,quantity:1.5}]},{items:[{id:5,quantity:-1}]},{items:[{id:5,quantity:1,price:1}],cash:1},{items:[]}]) assert.throws(()=>sale(owner,body));
  assert.equal(store.snapshot(owner).sales.length,0);
  assert.equal(store.snapshot(owner).inventory.find(i=>i.id===5).stock,35);
});
test('mixed payments affect the physical cash drawer only by the cash part',t=>{
  const {store,owner,sale}=fixture(t);open(store,owner,10000);
  const s=sale(owner,{cash:600,qr:500,card:500,tendered:1000});assert.equal(s.change_due,400);
  const close=store.closeShift(owner,closure(store,owner));assert.equal(close.expectedCash,10600);assert.equal(close.difference,0);
});
test('cashier cannot perform owner actions or use another person’s shift',t=>{
  const {store,owner,cashier,sale}=fixture(t);open(store,owner,0);
  assert.throws(()=>sale(cashier),/otro cajero/);
  assert.throws(()=>store.stockMovement(cashier,{kind:'restock',itemId:5,quantity:1,note:'test'}),/otro cajero/);
  assert.throws(()=>open(store,cashier,0),/Ya hay un turno/);
  for(const action of [()=>store.closeShift(cashier,{}),()=>store.createUser(cashier,{}),()=>store.saveProduct(cashier,{}),()=>store.report(cashier,'2026-01-01','2026-01-01')])assert.throws(action,/Solo el propietario/);
  const s=sale();assert.throws(()=>store.receipt(cashier,s.id),/No puedes ver/);
  assert.equal(store.snapshot(cashier).sales.length,0);assert.equal(store.snapshot(cashier).users.length,0);
});
test('cashier restocks belong to their open shift and authenticated user, including the reconciliation baseline',t=>{
  const {store,owner,cashier}=fixture(t);
  const movement={kind:'restock',itemId:5,quantity:12,note:'Entrega del proveedor'};
  assert.throws(()=>store.stockMovement(cashier,movement),/Abre un turno/);
  store.stockMovement(owner,{...movement,quantity:1});
  assert.equal(store.snapshot(owner).movements[0].shift_id,null);
  const shift=open(store,cashier,0),before=store.snapshot(owner).inventory.find(i=>i.id===5).stock;
  store.stockMovement(cashier,{...movement,userId:owner.id,user_id:owner.id,shiftId:999,shift_id:999});
  const snapshot=store.snapshot(owner),entry=snapshot.movements[0];
  assert.equal(snapshot.inventory.find(i=>i.id===5).stock,before+12);
  assert.equal(entry.user_id,cashier.id);assert.equal(entry.actor,cashier.name);
  assert.equal(entry.shift_id,shift.id);assert.equal(entry.kind,'restock');assert.equal(entry.note,movement.note);
  for(const body of [{quantity:0},{quantity:1.5},{quantity:-1},{note:''}])assert.throws(()=>store.stockMovement(cashier,{...movement,...body}));
  const stranger=store.createUser(owner,{name:'Otro cajero',username:'otro',password:'ClaveSegura2026!',role:'cashier'});
  assert.throws(()=>store.stockMovement(stranger,movement),/otro cajero/);
  store.startCount(cashier,{shiftId:shift.id});
  assert.equal(store.shiftDetail(owner,shift.id).items.find(i=>i.item_id===5).expected,before+12);
  for(const user of [cashier,owner])assert.throws(()=>store.stockMovement(user,movement),/pausadas/);
  assert.equal(store.snapshot(owner).inventory.find(i=>i.id===5).stock,before+12);
});

test('restocks, waste and approved declaration reconcile stock with explained discrepancies',t=>{
  const {store,owner,sale}=fixture(t);open(store,owner,10000);sale();
  store.stockMovement(owner,{kind:'restock',itemId:5,quantity:10,note:'Entrega del proveedor'});
  store.stockMovement(owner,{kind:'waste',itemId:5,quantity:1,note:'Botella dañada'});
  const body=declaration(store,owner,{countedCash:11500});body.counts.find(i=>i.id===5).quantity=40;
  const d=store.submitCount(owner,body);
  assert.equal(store.snapshot(owner).inventory.find(i=>i.id===5).stock,42);
  assert.throws(()=>store.closeShift(owner,{shiftId:body.shiftId,declarationId:d.id}),/Explica las diferencias/);
  const result=store.closeShift(owner,{shiftId:body.shiftId,declarationId:d.id,notes:'Dos botellas faltantes y Bs 1 de diferencia'});
  assert.equal(result.difference,-100);assert.equal(store.snapshot(owner).shift,null);
  const detail=store.shiftDetail(owner,result.id);const counted=detail.counts.find(i=>i.item_id===5);
  assert.equal(counted.opening,35);assert.equal(counted.expected,42);assert.equal(counted.counted,40);assert.equal(counted.difference,-2);
  open(store,owner,5000);assert.equal(store.snapshot(owner).inventory.find(i=>i.id===5).stock,40);
});
test('declaration rejects incomplete or duplicate counts and the old close cannot bypass review',t=>{
  const {store,owner}=fixture(t);open(store,owner,0);
  assert.throws(()=>store.closeShift(owner,{shiftId:1,countedCash:0,counts:[]}),/última declaración/);
  const c=declaration(store,owner);
  assert.throws(()=>store.submitCount(owner,{...c,counts:c.counts.slice(1)}),/todos los productos/);
  assert.throws(()=>store.submitCount(owner,{...c,counts:c.counts.map(()=>c.counts[0])}),/todos los productos/);
  assert.equal(store.snapshot(owner).shift.stage,'counting');
});
test('void uses historical recipe movements, restores stock and reverses paid totals',t=>{
  const {store,owner,sale}=fixture(t);open(store,owner,0);const s=sale();
  store.db.prepare('UPDATE recipes SET quantity=3 WHERE product_id=5').run();
  store.voidSale(owner,s.id,{reason:'Cliente canceló; devolución confirmada'});
  assert.equal(store.snapshot(owner).inventory.find(i=>i.id===5).stock,35);
  assert.equal(store.snapshot(owner).shift.total,undefined);
  assert.throws(()=>store.voidSale(owner,s.id,{reason:'Otra anulación'}),/ya anulada/);
});
test('cannot void a closed shift; can switch cashier after owner closes',t=>{
  const {store,owner,cashier,sale}=fixture(t);open(store,owner,0);const s=sale();
  store.closeShift(owner,closure(store,owner));open(store,cashier,1000);
  assert.throws(()=>store.voidSale(owner,s.id,{reason:'test'}),/turno abierto/);sale(cashier);
  assert.equal(store.snapshot(cashier).sales.length,1);assert.equal(store.snapshot(owner).sales.length,2);
  assert.throws(()=>store.updateUser(owner,cashier.id,{active:false}),/Cierra el turno/);
});
test('owner reports use Bolivia business dates and exclude voided sales',t=>{
  const {store,owner,sale}=fixture(t);open(store,owner,0);
  const a=sale(),b=sale(),c=sale();
  store.db.prepare('UPDATE sales SET created_at=? WHERE id=?').run('2026-10-03T03:59:59.000Z',a.id);
  store.db.prepare('UPDATE sales SET created_at=? WHERE id=?').run('2026-10-03T04:00:00.000Z',b.id);
  store.db.prepare('UPDATE sales SET created_at=? WHERE id=?').run('2026-10-04T03:59:59.000Z',c.id);
  const r=store.report(owner,'2026-10-03','2026-10-03');assert.equal(r.totals.tickets,2);assert.equal(r.totals.total,3200);assert.equal(r.top[0].quantity,4);
  store.voidSale(owner,c.id,{reason:'test'});assert.equal(store.report(owner,'2026-10-03','2026-10-03').totals.tickets,1);
});
test('catalog recipes, new ingredients and user revocation are persisted',t=>{
  const {store,owner,cashier}=fixture(t);
  const item=store.addInventory(owner,{name:'Pulpa',unit:'ml',minimum:100});store.stockMovement(owner,{itemId:item.id,quantity:1000,kind:'restock',note:'Ingreso inicial'});
  const p=store.saveProduct(owner,{name:'Jugo',category:'Bebidas',price:1000,recipe:[{item_id:item.id,quantity:100}]});
  assert.equal(store.snapshot(owner).products.find(v=>v.id===p.id).available,10);
  const login=store.login({username:'camila',password:'Flamingo2026!'});store.updateUser(owner,cashier.id,{active:false});
  assert.equal(store.authenticate(login.token),undefined);assert.throws(()=>store.login({username:'camila',password:'Flamingo2026!'}),/incorrectos/);
});
test('SQLite survives a server restart',()=>{
  const directory=mkdtempSync(join(tmpdir(),'flamingo-test-')),path=join(directory,'test.sqlite');
  let store;
  try {store=createStore(path,{demo:true,catalog:'legacy'});const owner=store.login({username:'admin',password:'Flamingo2026!'}).user;open(store,owner,25000);store.close();store=createStore(path,{catalog:'legacy'});assert.equal(store.snapshot(owner).shift.opening_cash,25000);}
  finally {store?.close();rmSync(directory,{recursive:true,force:true});}
});
test('HTTP enforces sessions, same-origin writes, local bootstrap and security headers',async t=>{
  const {server,store}=createApp({database:':memory:',demo:true,catalog:'legacy'});await new Promise(r=>server.listen(0,'127.0.0.1',r));
  t.after(()=>{server.closeAllConnections();server.close();store.close();});const base=`http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(`${base}/api/state`)).status,401);
  const headers={'Content-Type':'application/json','X-Flamingo-Request':'1'};
  assert.equal((await fetch(`${base}/api/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,403);
  assert.equal((await fetch(`${base}/api/login`,{method:'POST',headers:{...headers,Origin:'https://untrusted.test'},body:'{}'})).status,403);
  const login=await fetch(`${base}/api/login`,{method:'POST',headers,body:JSON.stringify({username:'admin',password:'Flamingo2026!'})});assert.equal(login.status,200);
  const cookie=login.headers.get('set-cookie').split(';')[0];assert.match(login.headers.get('set-cookie'),/HttpOnly/);
  const state=await fetch(`${base}/api/state`,{headers:{Cookie:cookie}});assert.equal(state.status,200);assert.equal((await state.json()).user.role,'admin');assert.equal(state.headers.get('cache-control'),'no-store');
  const home=await fetch(base);assert.equal(home.status,200);assert.match(home.headers.get('content-security-policy'),/frame-ancestors 'none'/);
  assert.equal((await fetch(`${base}/api/setup`,{method:'POST',headers,body:'{}'})).status,409);
  await fetch(`${base}/api/logout`,{method:'POST',headers:{...headers,Cookie:cookie},body:'{}'});
  assert.equal((await fetch(`${base}/api/state`,{headers:{Cookie:cookie}})).status,401);
});
