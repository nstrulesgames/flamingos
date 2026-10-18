import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {createStore} from '../lib/store.js';
import {createPostgresStore} from '../lib/postgres-store.js';
import {createPostgresDatabase} from '../lib/postgres-db.js';
import {createApp} from '../server.js';

async function fixture(t,backend){
 let store,q,rows;
 if(backend==='SQLite'){store=createStore(':memory:',{demo:true});q=(sql,...args)=>store.db.prepare(sql).run(...args);rows=sql=>store.db.prepare(sql).all();t.after(()=>store.close());}
 else{
  const pg=new PGlite(),folder=new URL('../supabase/migrations/',import.meta.url);for(const n of (await readdir(folder)).filter(n=>n.endsWith('.sql')).sort())await pg.exec(await readFile(new URL(n,folder),'utf8'));
  await pg.exec('SET ROLE flamingo_app');let tail=Promise.resolve();
  const pool={connect:async()=>{const prior=tail;let release;tail=new Promise(r=>release=r);await prior;return {query:async(sql,args)=>{const r=await pg.query(sql,args);return {...r,rowCount:r.affectedRows};},release};},end:()=>pg.close()},db=createPostgresDatabase(undefined,pool);
  store=await createPostgresStore(undefined,{pool});t.after(()=>store.close());await store.setup({name:'Valentina',username:'admin',password:'Flamingo2026!'});
  const owner=(await store.login({username:'admin',password:'Flamingo2026!'})).user;await store.createUser(owner,{name:'Camila',username:'camila',password:'Flamingo2026!',role:'cashier'});
  q=(sql,...args)=>db.transaction(()=>db.run(sql,...args));rows=sql=>db.transaction(()=>db.all(sql),true);
 }
 const owner=(await store.login({username:'admin',password:'Flamingo2026!'})).user,worker=(await store.login({username:'camila',password:'Flamingo2026!'})).user;
 return {store,q,rows,owner,worker};
}

for(const backend of ['SQLite','PostgreSQL'])test(`${backend}: product history covers the complete period, shares stock honestly and preserves money and counts`,async t=>{
 const {store,q,rows,owner,worker}=await fixture(t,backend),range={from:'2026-10-17',to:'2026-10-17'};
 const p=await store.saveProduct(owner,{name:'Producto historial',category:'Comida',price:100,inventoryMode:'unit'}),before=await store.snapshot(owner),item=before.products.find(v=>v.id===p.id).stock_item_id;
 await store.stockMovement(owner,{itemId:item,kind:'restock',quantity:100,note:'Stock inicial'});for(let i=0;i<80;i++)await store.stockMovement(owner,{itemId:item,kind:'restock',quantity:1,note:'Reposición adicional'});
 const shared=await store.addInventory(owner,{name:'Porción compartida',unit:'Ud',minimum:0});await store.stockMovement(owner,{itemId:shared.id,kind:'restock',quantity:10,note:'Porciones'});
 const loose=await store.addInventory(owner,{name:'Sandwich de lomito',unit:'Ud',minimum:0});await store.stockMovement(owner,{itemId:loose.id,kind:'restock',quantity:10,note:'Entrega'});
 let state=await store.snapshot(owner);const coffees=state.products.filter(v=>['Café americano','Café con leche'].includes(v.name)),acai=state.products.find(v=>v.name==='Helado de Açaí');
 for(const c of coffees)await store.saveProduct(owner,{...c,inventoryMode:'recipe',recipe:[{item_id:shared.id,quantity:1}]});
 await store.openShift(worker,{openingCash:0,confirmed:true,openingStock:(await store.snapshot(owner)).inventory.map(i=>({id:i.id,quantity:i.stock}))});
 let voided;
 for(let i=0;i<34;i++){
  const sale=await store.sale(worker,{requestId:randomUUID(),items:[{id:p.id,quantity:1}],cash:100,tendered:100,service:'local'});if(i===5)voided=sale;
  const at=i===0?'2026-10-17T03:59:59.999Z':i===33?'2026-10-18T04:00:00.000Z':`2026-10-17T04:00:00.${String(i).padStart(3,'0')}Z`;
  await q('UPDATE sales SET created_at=? WHERE id=?',at,sale.id);await q('UPDATE movements SET created_at=? WHERE sale_id=?',at,sale.id);
 }
 await store.voidSale(owner,voided.id,{reason:'Anulación de prueba'});
 const total=coffees[0].price*2+coffees[1].price,cs=await store.sale(worker,{requestId:randomUUID(),items:[{id:coffees[0].id,quantity:2},{id:coffees[1].id,quantity:1}],cash:total,tendered:total,service:'local'});
 const free=await store.sale(worker,{requestId:randomUUID(),items:[{id:acai.id,quantity:1,unitPrice:1050},{id:acai.id,quantity:1,unitPrice:2050}],cash:3100,tendered:3100,service:'local'});
 await store.saveProduct(owner,{...acai,price:1000,pricingMode:'weight',weightBasisGrams:100,inventoryMode:'untracked',recipe:[]});
 const weighted=await store.sale(worker,{requestId:randomUUID(),items:[{id:acai.id,quantity:1,weightGrams:150}],cash:1500,tendered:1500,service:'local'});
 await q('UPDATE sales SET created_at=? WHERE id=?','2026-10-17T15:00:00.000Z',weighted.id);
 await store.saveProduct(owner,{...acai,price:2000,pricingMode:'weight',weightBasisGrams:100,inventoryMode:'untracked',recipe:[]});
 for(const id of [cs.id,free.id]){await q('UPDATE sales SET created_at=? WHERE id=?','2026-10-17T12:00:00.000Z',id);await q('UPDATE movements SET created_at=? WHERE sale_id=?','2026-10-17T12:00:00.000Z',id);}
 await q("UPDATE movements SET created_at='2026-10-17T06:00:00.000Z' WHERE kind IN ('restock','void')");
 await store.stockMovement(owner,{itemId:item,kind:'waste',quantity:2,note:'Producto dañado'});await q("UPDATE movements SET created_at='2026-10-17T18:00:00.000Z' WHERE kind='waste'");
 await store.saveProduct(owner,{id:p.id,name:'Nombre corregido',category:'Comida',price:150,inventoryMode:'unit'});
 const checks=()=>rows('SELECT (SELECT SUM(stock) FROM inventory) stock,(SELECT COUNT(*) FROM sales) sales,(SELECT COUNT(*) FROM movements) movements,(SELECT COUNT(*) FROM counts) counts');
 const saved=await checks(),history=await store.productHistory(owner,p.id,range),second=await store.productHistory(owner,p.id,{...range,salesPage:2,stockPage:2});
 assert.equal(history.entity.name,'Nombre corregido');assert.equal(history.sales.totals.quantity,31);assert.equal(history.sales.totals.total,3100);assert.equal(history.sales.totals.voided_tickets,1);assert.equal(history.sales.totals.records,32);assert.equal(history.sales.rows.length,30);assert.equal(second.sales.rows.length,2);assert(history.sales.rows.every(r=>r.sold_name==='Producto historial'));assert.equal(second.sales.totals.total,3100);
 assert(history.stock.records>100);assert.equal(history.stock.items[0].period.restocked,180);assert.equal(history.stock.items[0].period.wasted,2);assert.equal(history.stock.items[0].period.sold,32);assert.equal(history.stock.items[0].period.returned,1);assert.equal(history.stock.items[0].stock,145);assert.equal(second.stock.page,2);
 const coffee=await store.productHistory(owner,coffees[0].id,range);assert.equal(coffee.sales.totals.quantity,2);assert.equal(coffee.sales.totals.total,coffees[0].price*2);assert.equal(coffee.stock.items[0].period.sold,3);assert.equal(coffee.stock.items[0].stock,7);assert.equal(coffee.stock.items[0].linked.length,2);
 const a=await store.productHistory(owner,acai.id,range);assert.equal(a.sales.totals.total,4600);assert.equal(a.sales.totals.grams,150);assert.equal(a.sales.rows.length,2);assert.equal(a.sales.rows.find(r=>r.manual_price).quantity,2);assert.equal(a.sales.rows.find(r=>r.grams).total,1500);assert.equal(a.stock.items.length,0);
 const inventory=await store.inventoryHistory(owner,loose.id,range);assert.equal(inventory.sales,null);assert.equal(inventory.stock.items[0].stock,10);assert.equal(inventory.stock.items[0].period.restocked,10);
 const report=await store.report(owner,range.from,range.to);assert.equal(report.products.find(v=>v.id===p.id).name,'Nombre corregido');assert.equal(report.products.find(v=>v.id===p.id).total,3100);
 await assert.rejects(async()=>store.productHistory(worker,p.id,range),/Solo el propietario/);await assert.rejects(async()=>store.inventoryHistory(worker,loose.id,range),/Solo el propietario/);
 for(const bad of [{from:'2026-02-30',to:'2026-03-01'},{from:'2026-10-18',to:'2026-10-17'},{...range,salesPage:-1}])await assert.rejects(async()=>store.productHistory(owner,p.id,bad),/válid/);
 await assert.rejects(async()=>store.productHistory(owner,999999,range),/inexistente/);const empty=await store.productHistory(owner,p.id,{from:'2025-01-01',to:'2025-01-01'});assert.equal(empty.sales.totals.total,0);assert.equal(empty.sales.rows.length,0);assert.equal(empty.stock.items[0].stock,145);
 assert.deepEqual(await checks(),saved);
 await store.startCount(owner,{shiftId:(await store.snapshot(owner)).shift.id});assert.equal((await store.productHistory(owner,p.id,range)).sales.totals.total,3100);await assert.rejects(async()=>store.productHistory(worker,p.id,range),/Solo el propietario/);
 const {server}=createApp({store});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));const base='http://127.0.0.1:'+server.address().port;
 const login=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json','X-Flamingo-Request':'1'},body:JSON.stringify({username:'admin',password:'Flamingo2026!'})}),cookie=login.headers.get('set-cookie').split(';')[0];
 const response=await fetch(base+`/api/products/${p.id}/history?from=${range.from}&to=${range.to}&salesPage=2`,{headers:{cookie}});assert.equal(response.status,200);assert.equal((await response.json()).sales.page,2);
 const module=await fetch(base+'/product-history.js');assert.equal(module.status,200);assert.match(module.headers.get('content-type'),/javascript/);assert.match(await module.text(),/createProductHistoryUI/);
 const unauthorized=await fetch(base+`/api/inventory/${loose.id}/history`);assert.equal(unauthorized.status,401);
 const cashierLogin=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json','X-Flamingo-Request':'1'},body:JSON.stringify({username:'camila',password:'Flamingo2026!'})}),cashierCookie=cashierLogin.headers.get('set-cookie').split(';')[0];
 const forbidden=await fetch(base+`/api/products/${p.id}/history?from=${range.from}&to=${range.to}`,{headers:{cookie:cashierCookie}});assert.equal(forbidden.status,403);assert.match((await forbidden.json()).error,/Solo el propietario/);
});
