// One query plan for both adapters. SQLite executes it synchronously in a read
// transaction; PostgreSQL awaits it within its existing repeatable-read wrapper.
const one=(sql,...args)=>({method:'one',sql,args});
const all=(sql,...args)=>({method:'all',sql,args});
export function historyRange(from,to,assert){
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/La_Paz',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 from=from||today;to=to||from;
 const valid=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T04:00:00Z'))&&new Date(v+'T04:00:00Z').toISOString().slice(0,10)===v;
 assert(valid(from)&&valid(to)&&from<=to,'Elige un rango de fechas válido.');
 return {from,to,start:from+'T04:00:00.000Z',end:new Date(Date.parse(to+'T04:00:00.000Z')+86400000).toISOString()};
}
export function* historyQueries(kind,id,options,assert){
 assert(['product','inventory'].includes(kind),'Tipo de historial inválido.');
 assert(Number.isSafeInteger(id)&&id>0,'Producto o existencia inválido.');
 const range=historyRange(options.from,options.to,assert),size=30;
 const requestedSalesPage=Number(options.salesPage||1),requestedStockPage=Number(options.stockPage||1);
 assert([requestedSalesPage,requestedStockPage].every(p=>Number.isSafeInteger(p)&&p>=1&&p<=1000000),'Página inválida.');
 let entity,items,sales=null;
 if(kind==='product'){
  entity=yield one('SELECT id,name,active,inventory_mode FROM products WHERE id=?',id);assert(entity,'Producto inexistente.',404);
  const totals=yield one("SELECT COUNT(DISTINCT CASE WHEN s.status='paid' THEN s.id END) tickets,COALESCE(SUM(CASE WHEN s.status='paid' THEN l.quantity ELSE 0 END),0) quantity,COALESCE(SUM(CASE WHEN s.status='paid' THEN l.price*l.quantity ELSE 0 END),0) total,COALESCE(SUM(CASE WHEN s.status='paid' THEN COALESCE(l.weight_grams,0)*l.quantity ELSE 0 END),0) grams,COUNT(DISTINCT CASE WHEN s.status='void' THEN s.id END) voided_tickets,COALESCE(SUM(CASE WHEN s.status='void' THEN l.quantity ELSE 0 END),0) voided_quantity,COUNT(DISTINCT s.id) records FROM sale_lines l JOIN sales s ON s.id=l.sale_id WHERE l.product_id=? AND s.created_at>=? AND s.created_at<?",id,range.start,range.end);
  const pages=Math.max(1,Math.ceil(totals.records/size)),page=Math.min(requestedSalesPage,pages);
  const rows=yield all('SELECT s.id sale_id,s.created_at,s.status,s.void_reason,u.name actor,MIN(l.name) sold_name,SUM(l.quantity) quantity,SUM(l.price*l.quantity) total,SUM(COALESCE(l.weight_grams,0)*l.quantity) grams,MAX(l.manual_price) manual_price FROM sale_lines l JOIN sales s ON s.id=l.sale_id JOIN users u ON u.id=s.user_id WHERE l.product_id=? AND s.created_at>=? AND s.created_at<? GROUP BY s.id,s.created_at,s.status,s.void_reason,u.name ORDER BY s.created_at DESC,s.id DESC LIMIT ? OFFSET ?',id,range.start,range.end,size,(page-1)*size);
  sales={totals,rows,page,pages,size};
  items=yield all('SELECT i.*,r.quantity consumption FROM recipes r JOIN inventory i ON i.id=r.item_id WHERE r.product_id=? ORDER BY i.name',id);
 }else{
  entity=yield one('SELECT id,name,active FROM inventory WHERE id=?',id);assert(entity,'Existencia inexistente.',404);
  items=yield all('SELECT * FROM inventory WHERE id=?',id);
 }
 let stock={items:[],rows:[],records:0,page:1,pages:1,size};
 if(items.length){
  const ids=items.map(i=>i.id),slots=ids.map(()=>'?').join(',');
  const linked=yield all(`SELECT r.item_id,r.quantity,p.id,p.name FROM recipes r JOIN products p ON p.id=r.product_id WHERE p.active=1 AND r.item_id IN (${slots}) ORDER BY p.name`,...ids);
  const summaries=yield all(`SELECT item_id,COALESCE(SUM(CASE WHEN kind='restock' THEN quantity ELSE 0 END),0) restocked,COALESCE(SUM(CASE WHEN kind='waste' THEN -quantity ELSE 0 END),0) wasted,COALESCE(SUM(CASE WHEN kind='sale' THEN -quantity ELSE 0 END),0) sold,COALESCE(SUM(CASE WHEN kind='void' THEN quantity ELSE 0 END),0) returned,COALESCE(SUM(CASE WHEN kind='count' THEN quantity ELSE 0 END),0) adjusted,COALESCE(SUM(CASE WHEN kind='transfer' THEN quantity ELSE 0 END),0) transferred FROM movements WHERE item_id IN (${slots}) AND created_at>=? AND created_at<? GROUP BY item_id`,...ids,range.start,range.end);
  const count=yield one(`SELECT COUNT(*) records FROM movements WHERE item_id IN (${slots}) AND created_at>=? AND created_at<?`,...ids,range.start,range.end);
  const pages=Math.max(1,Math.ceil(count.records/size)),page=Math.min(requestedStockPage,pages);
  const rows=yield all(`SELECT m.id,m.item_id,i.name,i.unit,m.quantity,m.kind,m.shift_id,m.sale_id,m.note,m.created_at,u.name actor FROM movements m JOIN inventory i ON i.id=m.item_id JOIN users u ON u.id=m.user_id WHERE m.item_id IN (${slots}) AND m.created_at>=? AND m.created_at<? ORDER BY m.created_at DESC,m.id DESC LIMIT ? OFFSET ?`,...ids,range.start,range.end,size,(page-1)*size);
  stock={items:items.map(i=>({...i,linked:linked.filter(p=>p.item_id===i.id),period:{restocked:0,wasted:0,sold:0,returned:0,adjusted:0,transferred:0,...summaries.find(s=>s.item_id===i.id)}})),rows,records:count.records,page,pages,size};
 }
 return {kind,entity,from:range.from,to:range.to,queriedAt:new Date().toISOString(),sales,stock};
}
export function runHistory(db,plan){let step=plan.next();while(!step.done){const q=step.value;step=plan.next(db[q.method](q.sql,...q.args));}return step.value;}
export async function runHistoryAsync(db,plan){let step=plan.next();while(!step.done){const q=step.value;step=plan.next(await db[q.method](q.sql,...q.args));}return step.value;}
