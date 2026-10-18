import {createHash} from 'node:crypto';

const recoveryKey='stock_controls_recovery_20261017';
const unchangedTables=['users','sales','sale_lines','movements','shifts','counts','shift_stock','reconciliations','reconciliation_items','declarations','declaration_items','recount_requests','customers','credit_movements'];
const check=(condition,message)=>{if(!condition)throw Error(message);};
const hash=rows=>createHash('sha256').update(JSON.stringify(rows.map(row=>Object.fromEntries(Object.entries(row).sort(([a],[b])=>a.localeCompare(b)))).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))))).digest('hex');

// Operator-run repair, never invoked by application startup or shift approval.
// Restore links and active flags only. Current quantities and all business history are immutable here.
export async function recoverStockControls(db,{apply=false}={}){
 return db.transaction(async()=>{
  check((await db.one("SELECT value FROM settings WHERE key='schema_version'"))?.value==='6','Versión de esquema inesperada.');
  if(await db.one('SELECT value FROM settings WHERE key=?',recoveryKey))return {alreadyApplied:true};
  check(!await db.one('SELECT id FROM shifts WHERE closed_at IS NULL'),'Hay un turno abierto: la recuperación requiere terminar su arqueo.');
  const conversion=await db.one("SELECT * FROM audit WHERE action='products_only_applied' ORDER BY id DESC LIMIT 1");
  check(conversion,'No existe una adaptación documentada que recuperar.');
  const previous=await db.all("SELECT * FROM audit WHERE action='product_control_simplified' AND created_at=(SELECT created_at FROM audit WHERE id=?) AND id<? ORDER BY id",conversion.id,conversion.id);
  const products=await db.all('SELECT * FROM products ORDER BY id'),inventory=await db.all('SELECT * FROM inventory ORDER BY id'),recipes=await db.all('SELECT * FROM recipes ORDER BY product_id,item_id');
  const retired=JSON.parse(conversion.detail).retired;
  check(Array.isArray(retired)&&retired.length>0&&previous.length>0,'Auditoría de adaptación incompleta.');
  const restore=previous.map(a=>JSON.parse(a.detail));
  check(new Set(restore.map(p=>p.productId)).size===restore.length,'Productos repetidos en la auditoría.');
  for(const row of retired){const i=inventory.find(i=>i.id===row.id);check(i&&i.stock===row.stock&&i.unit===row.unit&&!i.active,'Una existencia cambió después de la adaptación; requiere revisión.');}
  for(const entry of restore){
   const p=products.find(p=>p.id===entry.productId);
   check(p&&p.active&&p.inventory_mode==='untracked'&&!recipes.some(r=>r.product_id===p.id),'Un producto cambió después de la adaptación; requiere revisión.');
   check(!await db.one("SELECT id FROM audit WHERE id>? AND action IN ('product_saved','product_archived','product_restored') AND detail LIKE ?",conversion.id,p.id+':%'),'Un producto tiene cambios posteriores; requiere revisión.');
   check(Array.isArray(entry.previousRecipe)&&entry.previousRecipe.length>0,'Vínculo de stock anterior incompleto.');
   for(const r of entry.previousRecipe)check(r.product_id===p.id&&Number.isSafeInteger(r.quantity)&&r.quantity>0&&inventory.some(i=>i.id===r.item_id),'Vínculo de stock anterior inválido.');
  }
  const summary={alreadyApplied:false,products:restore.map(e=>({id:e.productId,name:e.name})),inventory:retired.map(r=>{const i=inventory.find(i=>i.id===r.id);return {id:i.id,name:i.name,stock:i.stock,unit:i.unit};})};
  if(!apply)return summary;
  const protectedBefore={};for(const table of unchangedTables)protectedBefore[table]=hash(await db.all(`SELECT * FROM ${table}`));
  for(const row of retired)await db.run('UPDATE inventory SET active=1 WHERE id=?',row.id);
  for(const entry of restore){
   await db.run("UPDATE products SET inventory_mode='recipe' WHERE id=?",entry.productId);
   for(const r of entry.previousRecipe)await db.run('INSERT INTO recipes(product_id,item_id,quantity) VALUES(?,?,?)',r.product_id,r.item_id,r.quantity);
  }
  const afterInventory=await db.all('SELECT * FROM inventory ORDER BY id'),afterProducts=await db.all('SELECT * FROM products ORDER BY id');
  check(hash(inventory.map(({active,...i})=>i))===hash(afterInventory.map(({active,...i})=>i)),'La recuperación alteró datos de existencias.');
  check(hash(products.map(({inventory_mode,...p})=>p))===hash(afterProducts.map(({inventory_mode,...p})=>p)),'La recuperación alteró otros datos de productos.');
  for(const table of unchangedTables)check(protectedBefore[table]===hash(await db.all(`SELECT * FROM ${table}`)),'La recuperación alteró '+table+'.');
  // Keep the old marker at 1 so an older warm server instance also skips its retired normalizer.
  await db.run("INSERT INTO settings(key,value) VALUES('products_only_version','1') ON CONFLICT(key) DO UPDATE SET value='1'");
  await db.run('INSERT INTO settings(key,value) VALUES(?,?)',recoveryKey,'1');
  await db.run("INSERT INTO audit(user_id,action,detail) VALUES(NULL,'stock_controls_recovered',?)",JSON.stringify({...summary,sourceAudit:conversion.id,unchangedTables:unchangedTables.length,reason:'Recuperación autorizada de controles anteriores; conserva cantidades del último arqueo aprobado.'}));
  return {...summary,verifiedUnchangedTables:unchangedTables.length};
 },!apply);
}
