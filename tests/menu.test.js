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

test('menu v2: 38 products in 33 cards, all counted in whole units without recipes to configure',t=>{
  const {store,owner}=fixture(t),s=store.snapshot(owner);
  assert.equal(clientMenu.length,38);assert.equal(new Set(clientMenu.map(p=>p.key)).size,38);
  assert.deepEqual(Object.fromEntries(s.categories.map(c=>[c,s.products.filter(p=>p.active&&p.category===c).length])),{'Comida':10,'Bebidas frías':14,'Cafés':6,'Batidos':2,'Escarchas':3,'Bolos':3});
  assert.equal(menuGroups(s.products).length,33);
  for(const [name,price] of [['Coca-Cola 500 ml',700],['Hamburguesa express',1500],['Latte frío',1600],['Bolo de agua',250],['Bolo de leche',400],['Bolo de fruta',350],['Escarcha 250 ml',500],['Escarcha 300 ml',700],['Escarcha 500 ml',1000]])assert.equal(s.products.find(p=>p.name===name).price,price);
  assert.equal(s.inventory.length,29);assert(s.inventory.every(i=>i.unit==='ud'));
  // Nothing is left "pending": made-to-order items only record the sale.
  const active=s.products.filter(p=>p.active);
  assert.deepEqual(active.filter(p=>p.inventory_mode==='untracked').map(p=>p.name).sort(),['Batido de proteína con agua','Batido de proteína con leche','Café americano','Café con leche','Café frío','Capuchino','Frapuchino','Hamburguesa express','Latte frío']);
  assert(active.filter(p=>p.inventory_mode==='recipe').every(p=>p.recipe.length===1&&p.recipe[0].quantity===1));
  assert.deepEqual(s.inventory.filter(i=>i.name.startsWith('Vaso')).map(i=>[i.name,i.pack_size]),[['Vaso de escarcha 250 ml',100],['Vaso de escarcha 300 ml',100],['Vaso de escarcha 500 ml',50]]);
  assert.equal(s.inventory.find(i=>i.name==='Sandwich mixto').pack_size,1);
});

test('escarcha cups: one sale takes one cup; restock only by full package',t=>{
  const {store,owner}=fixture(t),s=store.snapshot(owner),large=s.products.find(p=>p.name==='Escarcha 500 ml'),cup=s.inventory.find(i=>i.id===large.recipe[0].item_id);
  assert.equal(cup.name,'Vaso de escarcha 500 ml');
  assert.throws(()=>store.stockMovement(owner,{kind:'restock',itemId:cup.id,quantity:20,note:'Proveedor'}),/paquete completo de 50/);
  store.stockMovement(owner,{kind:'restock',itemId:cup.id,quantity:100,note:'Dos paquetes'});
  open(store,owner);sell(store,owner,[{id:large.id,quantity:3}]);
  assert.equal(store.snapshot(owner).inventory.find(i=>i.id===cup.id).stock,35+100-3);
  // Waste is not bound to packages.
  store.stockMovement(owner,{kind:'waste',itemId:cup.id,quantity:1,note:'Vaso roto'});
  assert.equal(store.snapshot(owner).inventory.find(i=>i.id===cup.id).stock,131);
});

test('cashiers restock during their shift but only the owner writes stock off',t=>{
  const {store,owner}=fixture(t),cashier=store.login({username:'camila',password:'Flamingo2026!'}).user;
  const s=store.snapshot(owner),bolo=s.inventory.find(i=>i.name==='Bolo de fruta');
  store.openShift(cashier,{openingCash:0,confirmed:true,openingStock:s.inventory.map(i=>({id:i.id,quantity:i.stock}))});
  store.stockMovement(cashier,{kind:'restock',itemId:bolo.id,quantity:5,note:'Entrega'});
  assert.throws(()=>store.stockMovement(cashier,{kind:'waste',itemId:bolo.id,quantity:1,note:'Derretido'}),/Solo el propietario/);
  store.stockMovement(owner,{kind:'waste',itemId:bolo.id,quantity:1,note:'Derretido'});
  assert.equal(store.snapshot(owner).inventory.find(i=>i.id===bolo.id).stock,39);
});

test('owner can still switch any product to sales only; server controls the mode',t=>{
  const {store,owner}=fixture(t),brownie=store.snapshot(owner).products.find(p=>p.name==='Brownie');
  store.saveProduct(owner,{...brownie,inventoryMode:'untracked',recipe:[]});
  assert.equal(store.snapshot(owner).products.find(p=>p.id===brownie.id).available,null);
  const before=store.snapshot(owner).inventory;open(store,owner);
  sell(store,owner,[{id:brownie.id,quantity:1}]);assert.deepEqual(store.snapshot(owner).inventory,before);
  const cashier=store.login({username:'camila',password:'Flamingo2026!'}).user;
  assert.throws(()=>store.saveProduct(cashier,{...brownie,inventoryMode:'untracked',recipe:[]}),/Solo el propietario/);
});

test('owner can add loose ingredients by package that no sale deducts',t=>{
  const {store,owner}=fixture(t);
  const ham=store.addInventory(owner,{name:'Jamón',unit:'paquete',minimum:1}).id,bread=store.addInventory(owner,{name:'Pan de molde',unit:'ud',minimum:2,packSize:20}).id;
  assert.throws(()=>store.addInventory(owner,{name:'Jamón',unit:'ud',minimum:1}),/Ya existe/);
  store.stockMovement(owner,{kind:'restock',itemId:bread,quantity:40,note:'Panadería'});
  const sandwich=store.snapshot(owner).products.find(p=>p.name==='Sandwich mixto');open(store,owner);sell(store,owner,[{id:sandwich.id,quantity:2}]);
  const inv=store.snapshot(owner).inventory;assert.equal(inv.find(i=>i.id===bread).stock,40);assert.equal(inv.find(i=>i.id===ham).stock,0);assert.equal(inv.find(i=>i.name==='Sandwich mixto').stock,33);
});

test('real setup starts with zero stock and nothing pending',t=>{
  const store=createStore(':memory:');t.after(()=>store.close());const owner=store.setup({name:'Dueña',username:'owner',password:'suficientementelarga'}),s=store.snapshot(owner);
  assert.equal(s.products.length,38);assert(s.inventory.every(i=>i.stock===0));assert(s.products.every(p=>p.inventory_mode==='untracked'||p.recipe.length===1));
});

// Builds a database exactly as menu v1 left it: flavor bolos, escarchas in ml, pending recipes.
function menuV1(file){
  const store=createStore(file,{demo:true,catalog:'legacy'});
  store.db.exec('DELETE FROM recipes;DELETE FROM products;DELETE FROM inventory');
  const v1=[['sandwich-mixto','Sandwich mixto','Comida',1200,null],['hamburguesa-express','Hamburguesa express','Comida',1500,null],['cafe-americano','Café americano','Cafés',1200,null],
    ['coca-cola-500-ml','Coca-Cola 500 ml','Bebidas frías',700,['Coca-Cola 500 ml','ud',1,20]],
    ['bolo-agua-menta','Bolo de agua · Menta','Bolos',250,['Bolo de agua · Menta','ud',1,0]],['bolo-agua-grosella','Bolo de agua · Grosella','Bolos',250,['Bolo de agua · Grosella','ud',1,12]],
    ['bolo-fruta-copoazu','Bolo de fruta · Copoazú','Bolos',350,['Bolo de fruta · Copoazú','ud',1,8]],['bolo-leche-chocolate','Bolo de leche · Chocolate','Bolos',400,['Bolo de leche · Chocolate','ud',1,6]],
    ['escarcha-chica-menta','Escarcha chica · Menta','Escarchas',500,['Mezcla de escarcha · Menta','ml',250,3000]],['escarcha-grande-menta','Escarcha grande · Menta','Escarchas',1000,['Mezcla de escarcha · Menta','ml',500,3000]]];
  for(const [key,name,category,price,stock] of v1){
    const id=Number(store.db.prepare("INSERT INTO products(name,category,price,art,description,menu_key) VALUES(?,?,?,'burger','',?)").run(name,category,price,key).lastInsertRowid);
    if(!stock)continue;
    let item=store.db.prepare('SELECT id FROM inventory WHERE name=?').get(stock[0])?.id;
    item??=Number(store.db.prepare('INSERT INTO inventory(name,unit,stock) VALUES(?,?,?)').run(stock[0],stock[1],stock[3]).lastInsertRowid);
    store.db.prepare('INSERT INTO recipes VALUES(?,?,?)').run(id,item,stock[2]);
  }
  store.db.prepare("INSERT OR REPLACE INTO settings VALUES('client_menu_version','flamingo-client-menu-2026-10')").run();
  return store;
}

test('upgrade from v1 waits for the open shift, merges bolo flavors into one stock and keeps history',t=>{
  const dir=mkdtempSync(join(tmpdir(),'flamingo-menu-')),file=join(dir,'store.sqlite');t.after(()=>rmSync(dir,{recursive:true,force:true}));
  let store=menuV1(file);const owner=store.login({username:'admin',password:'Flamingo2026!'}).user;
  const colaId=store.db.prepare("SELECT id FROM products WHERE menu_key='coca-cola-500-ml'").get().id;
  store.db.prepare('UPDATE products SET price=750 WHERE id=?').run(colaId); // owner's own edit
  open(store,owner);const grosella=store.db.prepare("SELECT id FROM products WHERE menu_key='bolo-agua-grosella'").get().id;
  const sale=sell(store,owner,[{id:grosella,quantity:2}]);store.close();
  // Restart during the shift: nothing changes under the cashier.
  store=createStore(file,{demo:true});let s=store.snapshot(owner);
  assert.equal(s.products.find(p=>p.id===grosella).active,1);assert(!s.inventory.some(i=>i.name==='Bolo de agua'));
  // Approving the arqueo applies the new menu right away.
  store.startCount(owner,{shiftId:s.shift.id});const d=store.submitCount(owner,{shiftId:s.shift.id,version:1,requestId:randomUUID(),countedCash:10500,counts:s.inventory.map(i=>({id:i.id,quantity:i.stock})),notes:''});store.approveCount(owner,{shiftId:s.shift.id,declarationId:d.id});
  s=store.snapshot(owner);const inv=name=>s.inventory.find(i=>i.name===name);
  assert.equal(inv('Bolo de agua').stock,10);assert.equal(inv('Bolo de fruta').stock,8);assert.equal(inv('Bolo de leche').stock,6);
  assert(!s.inventory.some(i=>i.name.includes('·')||i.unit==='ml'));
  assert.equal(inv('Vaso de escarcha 300 ml').pack_size,100);assert.equal(inv('Sandwich mixto').stock,0);
  assert.equal(s.products.find(p=>p.id===colaId).price,750);
  assert.equal(s.products.find(p=>p.name==='Hamburguesa express').inventory_mode,'untracked');
  assert.equal(s.products.filter(p=>p.active).length,38);
  assert.equal(store.receipt(owner,sale.id).lines[0].name,'Bolo de agua · Grosella');
  const transfers=s.movements.filter(m=>m.kind==='transfer');assert.equal(transfers.length,6);assert.equal(transfers.reduce((n,m)=>n+m.quantity,0),0);
  // Runs once: a later restart keeps whatever the owner changes afterwards.
  store.saveProduct(owner,{...s.products.find(p=>p.name==='Bolo de agua'),price:300,inventoryMode:'recipe',recipe:[{item_id:inv('Bolo de agua').id,quantity:1}]});store.close();
  store=createStore(file,{demo:true});assert.equal(store.snapshot(owner).products.find(p=>p.name==='Bolo de agua').price,300);store.close();
});

test('legacy demo catalog still upgrades by name and preserves its sales',t=>{
  const dir=mkdtempSync(join(tmpdir(),'flamingo-menu-')),file=join(dir,'store.sqlite');t.after(()=>rmSync(dir,{recursive:true,force:true}));
  let store=createStore(file,{demo:true,catalog:'legacy'}),owner=store.login({username:'admin',password:'Flamingo2026!'}).user;
  open(store,owner);const sale=sell(store,owner,[{id:5,quantity:1}]);store.close();
  store=createStore(file,{demo:true});assert.equal(store.snapshot(owner).products.length,12);
  const s=store.snapshot(owner);store.startCount(owner,{shiftId:s.shift.id});const d=store.submitCount(owner,{shiftId:s.shift.id,version:1,requestId:randomUUID(),countedCash:10800,counts:s.inventory.map(i=>({id:i.id,quantity:i.stock})),notes:''});store.closeShift(owner,{shiftId:s.shift.id,declarationId:d.id});store.close();
  store=createStore(file,{demo:true});const snapshot=store.snapshot(owner);
  assert.equal(snapshot.products.filter(p=>p.active).length,38);
  assert.equal(store.receipt(owner,sale.id).lines[0].price,800);
  const cola=snapshot.products.find(p=>p.name==='Coca-Cola 500 ml');assert.equal(cola.price,700);assert.equal(snapshot.inventory.find(i=>i.name===cola.name).stock,34);
  store.close();
});
