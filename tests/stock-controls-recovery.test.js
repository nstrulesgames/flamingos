import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {createPostgresStore} from '../lib/postgres-store.js';
import {createPostgresDatabase} from '../lib/postgres-db.js';
import {recoverStockControls} from '../lib/stock-recovery.js';
import {maximumQuantity} from '../public/catalog.js';
import {uiHarness,snapshot} from './helpers/ui-harness.js';

test('stock recovery preserves approved counts and history, rolls back failures and restores shared-sale limits',async t=>{
 const pg=new PGlite(),folder=new URL('../supabase/migrations/',import.meta.url);
 t.after(()=>pg.close());for(const name of (await readdir(folder)).filter(n=>n.endsWith('.sql')).sort())await pg.exec(await readFile(new URL(name,folder),'utf8'));
 await pg.exec('SET ROLE flamingo_app');
 const pool={connect:async()=>({query:async(sql,args)=>{const r=await pg.query(sql,args);return {...r,rowCount:r.affectedRows};},release:()=>{}}),end:()=>pg.close()},db=createPostgresDatabase(undefined,pool),store=await createPostgresStore(undefined,{pool});
 await store.setup({name:'Propietaria',username:'admin',password:'Flamingo2026!'});const owner=(await store.login({username:'admin',password:'Flamingo2026!'})).user;
 const shared=await store.addInventory(owner,{name:'Medida de café',unit:'Ud',minimum:0}),lomito=await store.addInventory(owner,{name:'Sandwich de lomito',unit:'Ud',minimum:0});
 await store.stockMovement(owner,{itemId:shared.id,kind:'restock',quantity:3,note:'Stock validado'});await store.stockMovement(owner,{itemId:lomito.id,kind:'restock',quantity:10,note:'Stock validado'});
 let state=await store.snapshot(owner);const coffees=state.products.filter(p=>['Café americano','Café con leche'].includes(p.name));
 for(const p of coffees)await store.saveProduct(owner,{...p,inventoryMode:'recipe',recipe:[{item_id:shared.id,quantity:1}]});
 const open=async()=>store.openShift(owner,{openingCash:0,confirmed:true,openingStock:(await store.snapshot(owner)).inventory.map(i=>({id:i.id,quantity:i.stock}))});
 const close=async()=>{const s=await store.snapshot(owner);await store.startCount(owner,{shiftId:s.shift.id});const detail=await store.shiftDetail(owner,s.shift.id),d=await store.submitCount(owner,{shiftId:s.shift.id,version:1,requestId:randomUUID(),countedCash:detail.baseline.expected_cash,counts:s.inventory.map(i=>({id:i.id,quantity:i.stock}))});await store.approveCount(owner,{shiftId:s.shift.id,declarationId:d.id});};
 await open();await store.sale(owner,{requestId:randomUUID(),items:[{id:coffees[0].id,quantity:1}],cash:coffees[0].price,tendered:coffees[0].price,service:'local'});await close();
 await db.transaction(async()=>{
  for(const p of coffees){await db.run('DELETE FROM recipes WHERE product_id=?',p.id);await db.run("UPDATE products SET inventory_mode='untracked' WHERE id=?",p.id);await db.run("INSERT INTO audit(action,detail,created_at) VALUES('product_control_simplified',?,'2026-10-18T02:31:37.493987Z')",JSON.stringify({productId:p.id,name:p.name,previousRecipe:[{product_id:p.id,item_id:shared.id,quantity:1}]}));}
  for(const id of [shared.id,lomito.id])await db.run('UPDATE inventory SET active=0 WHERE id=?',id);
  await db.run("INSERT INTO audit(action,detail,created_at) VALUES('products_only_applied',?,'2026-10-18T02:31:37.493987Z')",JSON.stringify({retired:[{id:shared.id,stock:2,unit:'Ud'},{id:lomito.id,stock:10,unit:'Ud'}]}));
 });
 const dry=await recoverStockControls(db);assert.equal(dry.products.length,2);assert.equal((await store.snapshot(owner)).products.find(p=>p.id===coffees[0].id).inventory_mode,'untracked');
 const failing={...db,run:async(sql,...args)=>{if(sql.startsWith('UPDATE products')&&args[0]===coffees[1].id)throw Error('Fallo inyectado');return db.run(sql,...args);}};
 await assert.rejects(()=>recoverStockControls(failing,{apply:true}),/Fallo inyectado/);state=await store.snapshot(owner);assert(!state.inventory.some(i=>i.id===shared.id));assert(state.products.filter(p=>coffees.some(c=>c.id===p.id)).every(p=>p.inventory_mode==='untracked'));
 await open();await assert.rejects(()=>recoverStockControls(db,{apply:true}),/turno abierto/);await close();
 const result=await recoverStockControls(db,{apply:true});assert.equal(result.verifiedUnchangedTables,14);assert.equal((await recoverStockControls(db,{apply:true})).alreadyApplied,true);
 state=await store.snapshot(owner);assert.equal(state.inventory.find(i=>i.id===shared.id).stock,2);assert.equal(state.inventory.find(i=>i.id===lomito.id).stock,10);assert(!state.products.some(p=>p.name==='Sandwich de lomito'));assert.equal(state.products.find(p=>p.id===coffees[0].id).stock_mode,'linked');
 await open();state=await store.snapshot(owner);const a=state.products.find(p=>p.id===coffees[0].id),b=state.products.find(p=>p.id===coffees[1].id);
 assert.equal(maximumQuantity(b,[{...a,quantity:2}],state.inventory),0);
 const total=a.price+b.price;await store.sale(owner,{requestId:randomUUID(),items:[{id:a.id,quantity:1},{id:b.id,quantity:1}],cash:total,tendered:total,service:'local'});
 state=await store.snapshot(owner);assert.equal(state.inventory.find(i=>i.id===shared.id).stock,0);assert(state.products.filter(p=>[a.id,b.id].includes(p.id)).every(p=>p.available===0));
 const sales=state.sales.length;await assert.rejects(()=>store.sale(owner,{requestId:randomUUID(),items:[{id:a.id,quantity:1}],cash:a.price,tendered:a.price,service:'local'}),/Stock insuficiente/);assert.equal((await store.snapshot(owner)).sales.length,sales);
});

test('sold-out products retain a warning icon and a disabled sale button',()=>{
 const p={id:1,name:'Hamburguesa',category:'Comida',price:1500,active:1,art:'burger',inventory_mode:'recipe',recipe:[{item_id:1,quantity:1}],available:0};
 const h=uiHarness({state:snapshot({products:[p],inventory:[{id:1,stock:0}]})}),grid={innerHTML:''};h.elements.set('#product-count',{textContent:''});h.elements.set('#product-grid',grid);h.run('renderProducts()');
 assert.match(grid.innerHTML,/disabled/);assert.match(grid.innerHTML,/stock-pill sold-out/);assert.match(grid.innerHTML,/<svg[^>]+aria-hidden="true"/);assert.match(grid.innerHTML,/Agotado/);
});

test('saving the price of a shared-stock product keeps the original item and consumption',async()=>{
 const h=uiHarness(),row={querySelector:s=>({value:s==='select'?'50':'1'})},f=h.form('product-form',[['id','25'],['name','Café'],['category','Cafés'],['price','12'],['inventoryMode','recipe'],['active','on']],[row]);
 await h.listeners.submit(f.event);assert.equal(h.requests[0].body.inventoryMode,'recipe');assert.deepEqual(JSON.parse(JSON.stringify(h.requests[0].body.recipe)),[{item_id:50,quantity:1}]);
});
