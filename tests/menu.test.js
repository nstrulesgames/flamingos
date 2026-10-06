import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createStore} from '../lib/store.js';
import {clientMenu} from '../lib/menu.js';
import {menuGroups,maximumQuantity} from '../public/catalog.js';

function fixture(t){const store=createStore(':memory:',{demo:true});t.after(()=>store.close());const owner=store.login({username:'admin',password:'Flamingo2026!'}).user;return {store,owner};}
function open(store,owner){const s=store.snapshot(owner);store.openShift(owner,{openingCash:10000,confirmed:true,openingStock:s.inventory.map(i=>({id:i.id,quantity:i.stock}))});}
function sell(store,owner,items,extra={}){const products=store.snapshot(owner).products,total=items.reduce((n,line)=>n+products.find(p=>p.id===line.id).price*line.quantity,0);return store.sale(owner,{requestId:randomUUID(),items,cash:total,qr:0,card:0,tendered:total,service:'local',...extra});}

test('client menu transcribes 60 variants and groups them into 33 phone cards',t=>{
  const {store,owner}=fixture(t),s=store.snapshot(owner);
  assert.equal(clientMenu.length,60);assert.equal(new Set(clientMenu.map(p=>p.key)).size,60);
  assert.deepEqual(Object.fromEntries(s.categories.map(c=>[c,s.products.filter(p=>p.category===c).length])),{'Comida':10,'Bebidas frías':14,'Cafés':6,'Batidos':2,'Escarchas':18,'Bolos':10});
  assert.equal(menuGroups(s.products).length,33);
  for(const [name,price] of [['Coca-Cola 500 ml',700],['Sante 1 L',1400],['Powerade 1 L',1300],['Hamburguesa express',1500],['Latte frío',1600],['Bolo de agua · Menta',250],['Bolo de fruta · Copoazú',350]])assert.equal(s.products.find(p=>p.name===name).price,price);
  assert.equal(menuGroups(s.products,{search:'copOAZU',category:'Bolos'})[0].products[0].flavor,'Copoazú');
  assert.equal(s.inventory.length,37);assert.equal(s.products.filter(p=>!p.recipe.length).length,11);
});

test('escarcha sizes share one stock per flavor; reservation and sale aggregate ml',t=>{
  const {store,owner}=fixture(t),s=store.snapshot(owner),small=s.products.find(p=>p.size==='Chica'&&p.flavor==='Menta'),large=s.products.find(p=>p.size==='Grande'&&p.flavor==='Menta');
  assert.equal(small.recipe[0].quantity,250);assert.equal(large.recipe[0].quantity,500);assert.equal(small.recipe[0].item_id,large.recipe[0].item_id);
  const stockId=small.recipe[0].item_id;
  store.db.prepare('UPDATE inventory SET stock=750 WHERE id=?').run(stockId);
  const inventory=store.snapshot(owner).inventory;
  assert.equal(maximumQuantity(small,[{...large,quantity:1}],inventory),1);
  assert.equal(maximumQuantity(large,[{...small,quantity:2}],inventory),0);
  open(store,owner);
  assert.throws(()=>sell(store,owner,[{id:small.id,quantity:2},{id:large.id,quantity:1}]),/Stock insuficiente/);
  assert.equal(store.snapshot(owner).sales.length,0);
  const items=[{id:small.id,quantity:1},{id:large.id,quantity:1}],requestId=randomUUID();
  const first=sell(store,owner,items,{requestId}),retry=sell(store,owner,items,{requestId});
  assert.equal(first.id,retry.id);assert.equal(first.total,1500);assert.equal(store.snapshot(owner).inventory.find(i=>i.id===stockId).stock,0);
  assert.equal(store.snapshot(owner).products.find(p=>p.id===small.id).available,0);
});

test('prepared products cannot invent stock; configured portions enable ingredient deductions',t=>{
  const {store,owner}=fixture(t),burger=store.snapshot(owner).products.find(p=>p.name==='Hamburguesa express');
  open(store,owner);
  assert.throws(()=>sell(store,owner,[{id:burger.id,quantity:1}],{inventoryMode:'untracked'}),/receta|insumos/i);
  // A simple recipe can use pre-portioned meat instead of requiring a scale for every count.
  const current=store.snapshot(owner);store.startCount(owner,{shiftId:current.shift.id});const declared=store.submitCount(owner,{shiftId:current.shift.id,version:1,requestId:randomUUID(),countedCash:10000,counts:current.inventory.map(i=>({id:i.id,quantity:i.stock})),notes:''});store.closeShift(owner,{shiftId:current.shift.id,declarationId:declared.id});
  const bread=store.addInventory(owner,{name:'Pan',unit:'ud',minimum:5}).id;
  const meat=store.addInventory(owner,{name:'Porción de carne',unit:'ud',minimum:5}).id;
  store.saveProduct(owner,{...burger,inventoryMode:'recipe',recipe:[{item_id:bread,quantity:1},{item_id:meat,quantity:1}]});
  for(const itemId of [bread,meat])store.stockMovement(owner,{kind:'restock',itemId,quantity:4,note:'Existencias de prueba'});
  open(store,owner);sell(store,owner,[{id:burger.id,quantity:2}]);
  const s=store.snapshot(owner);assert.equal(s.inventory.find(i=>i.id===bread).stock,2);assert.equal(s.inventory.find(i=>i.id===meat).stock,2);
});

test('owner can explicitly record sales without stock; server controls the mode',t=>{
  const {store,owner}=fixture(t),coffee=store.snapshot(owner).products.find(p=>p.name==='Café americano');
  store.saveProduct(owner,{...coffee,inventoryMode:'untracked',recipe:[]});
  assert.equal(store.snapshot(owner).products.find(p=>p.id===coffee.id).available,null);
  const before=store.snapshot(owner).inventory;open(store,owner);
  sell(store,owner,[{id:coffee.id,quantity:1}]);assert.deepEqual(store.snapshot(owner).inventory,before);
  const cashier=store.login({username:'camila',password:'Flamingo2026!'}).user;
  assert.throws(()=>store.saveProduct(cashier,{...coffee,inventoryMode:'untracked',recipe:[]}),/Solo el propietario/);
});

test('real setup starts with zero stock and no invented recipes',t=>{
  const store=createStore(':memory:');t.after(()=>store.close());const owner=store.setup({name:'Dueña',username:'owner',password:'suficientementelarga'}),s=store.snapshot(owner);
  assert.equal(s.products.length,60);assert(s.inventory.every(i=>i.stock===0));assert.equal(s.products.filter(p=>!p.recipe.length).length,11);
});

test('menu migration preserves sales and old closures, defers active shifts, and runs once',t=>{
  const dir=mkdtempSync(join(tmpdir(),'flamingo-menu-')),file=join(dir,'store.sqlite');t.after(()=>rmSync(dir,{recursive:true,force:true}));
  let store=createStore(file,{demo:true,catalog:'legacy'}),owner=store.login({username:'admin',password:'Flamingo2026!'}).user;
  open(store,owner);const sale=sell(store,owner,[{id:5,quantity:1}]);store.close();
  store=createStore(file,{demo:true});assert.equal(store.snapshot(owner).products.length,12);
  const s=store.snapshot(owner);store.startCount(owner,{shiftId:s.shift.id});const d=store.submitCount(owner,{shiftId:s.shift.id,version:1,requestId:randomUUID(),countedCash:10800,counts:s.inventory.map(i=>({id:i.id,quantity:i.stock})),notes:''});store.closeShift(owner,{shiftId:s.shift.id,declarationId:d.id});store.close();
  store=createStore(file,{demo:true});let snapshot=store.snapshot(owner);
  assert.equal(snapshot.products.filter(p=>p.active).length,60);assert.equal(snapshot.inventory.length,37);
  assert.equal(store.receipt(owner,sale.id).lines[0].price,800);assert.equal(snapshot.shifts[0].stage,'closed');
  const cola=snapshot.products.find(p=>p.name==='Coca-Cola 500 ml');assert.equal(cola.price,700);assert.equal(snapshot.inventory.find(i=>i.name===cola.name).stock,34);
  store.saveProduct(owner,{...cola,price:750,inventoryMode:'recipe'});store.close();
  store=createStore(file,{demo:true});assert.equal(store.snapshot(owner).products.find(p=>p.id===cola.id).price,750);store.close();
});
