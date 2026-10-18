export function createProductHistoryUI(ctx){
 const {api,modal,esc,money,date,icon,empty,showReceipt}=ctx,$=s=>document.querySelector(s);
 let current=null,sequence=0,request=0;
 const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/La_Paz',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const qty=n=>Number(n||0).toLocaleString('es-BO');
 const periodRange=value=>{const t=today(),base=Date.parse(t+'T12:00:00Z'),to=value==='yesterday'?new Date(base-86400000).toISOString().slice(0,10):t;return {from:value==='week'?new Date(base-6*86400000).toISOString().slice(0,10):to,to};};
 const selected=value=>{const p=periodRange(value);return p.from===current.from&&p.to===current.to;};
 const amount=(n,unit)=>`${qty(n)} ${esc(unit)}`;
 const alive=c=>current===c&&ctx.getState()?.user.id===c.user&&$('dialog[open][data-history-token="'+c.token+'"]');
 function show(){
  const c=current;c.token=++sequence;
  modal('Historial · '+esc(c.name),'Consulta por fecha, en horario de Bolivia.','<div id="product-history-content"></div>',true);
  const d=$('dialog.modal[open]');d.classList.add('product-history-modal');d.dataset.historyToken=String(c.token);render();
 }
 function pager(part){const p=current.data[part];return p.pages>1?'<nav class="history-pagination" aria-label="Páginas de '+(part==='sales'?'ventas':'movimientos')+'"><button type="button" class="secondary" data-history-page="'+part+'" data-page="'+(p.page-1)+'" '+(p.page<=1?'disabled':'')+'>Anterior</button><span>'+p.page+' / '+p.pages+'</span><button type="button" class="secondary" data-history-page="'+part+'" data-page="'+(p.page+1)+'" '+(p.page>=p.pages?'disabled':'')+'>Siguiente</button></nav>':'';}
 function salesBody(d){
  const t=d.sales.totals;
  return '<div class="history-metrics"><div><small>Unidades vendidas</small><strong>'+qty(t.quantity)+'</strong></div><div><small>Importe de ventas</small><strong>'+money(t.total)+'</strong></div></div><p class="muted">'+qty(t.tickets)+(t.tickets===1?' venta completada':' ventas completadas')+(t.grams?' · '+qty(t.grams)+' g vendidos':'')+(t.voided_tickets?' · '+qty(t.voided_tickets)+' ventas anuladas, excluidas de los totales':'')+'</p><div class="history-events">'+(d.sales.rows.map(s=>'<button type="button" class="history-event" data-history-receipt="'+s.sale_id+'"><span class="history-event-head"><b>Venta #'+s.sale_id+'</b><strong class="'+(s.status==='void'?'history-void':'')+'">'+money(s.total)+'</strong></span><span>'+qty(s.quantity)+' × '+esc(s.sold_name)+(s.grams?' · '+qty(s.grams)+' g':'')+(s.manual_price?' · Precio libre':'')+'</span><small>'+date(s.created_at,true)+' · '+esc(s.actor)+'</small><span class="history-event-foot">'+(s.status==='void'?'<span class="badge red">Anulada</span>':'<span>Ver comprobante</span>')+icon('chevron')+'</span></button>').join('')||empty('Sin ventas en estas fechas','Elige otro período para consultar.','receipt'))+'</div>'+pager('sales');
 }
 function stockBody(d){
  if(!d.stock.items.length)return empty('Sin stock asociado','Este producto solo registra ventas.','box');
  const shared=d.stock.items.some(i=>d.kind==='product'?i.linked.some(p=>p.id!==d.entity.id):i.linked.length>1);
  const captions={sale:'Venta · salida de stock',void:'Anulación · devolución',restock:'Reposición',waste:'Merma',count:'Ajuste de arqueo',transfer:'Traspaso'};
  return '<p class="info-block">'+(shared?'Stock compartido: estos movimientos pueden incluir ventas de otras presentaciones.':'Movimientos de las existencias asociadas actualmente.')+'</p>'+d.stock.items.map(i=>{
   const p=i.period;return '<section class="history-stock-card"><div class="history-event-head"><b>'+esc(i.name)+'</b><strong>'+amount(i.stock,i.unit)+'</strong></div><small>Stock actual al consultar · '+date(d.queriedAt,true)+(i.active?'':' · Archivado')+'</small>'+(i.linked.length?'<p class="muted">Lo usan: '+i.linked.map(p=>esc(p.name)).join(', ')+'</p>':'<p class="muted">Conteo independiente, sin producto de venta asociado.</p>')+'<dl class="history-stock-totals"><div><dt>Reposiciones</dt><dd>+'+amount(p.restocked,i.unit)+'</dd></div><div><dt>Mermas</dt><dd>−'+amount(p.wasted,i.unit)+'</dd></div><div><dt>Salidas por ventas</dt><dd>−'+amount(p.sold,i.unit)+'</dd></div><div><dt>Devoluciones por anulación</dt><dd>+'+amount(p.returned,i.unit)+'</dd></div><div><dt>Ajustes de arqueo</dt><dd>'+(p.adjusted>0?'+':'')+amount(p.adjusted,i.unit)+'</dd></div>'+(p.transferred?'<div><dt>Traspasos</dt><dd>'+amount(p.transferred,i.unit)+'</dd></div>':'')+'</dl></section>';
  }).join('')+'<p class="muted">'+qty(d.stock.records)+' movimientos en el período. El stock actual es independiente del filtro de fechas.</p><div class="history-events">'+(d.stock.rows.map(m=>'<article class="history-event"><div class="history-event-head"><b>'+esc(captions[m.kind]||'Movimiento')+'</b><strong class="'+(m.quantity<0?'history-out':'')+'">'+(m.quantity>0?'+':'')+amount(m.quantity,m.unit)+'</strong></div><span>'+esc(m.name)+'</span><small>'+date(m.created_at,true)+' · '+esc(m.actor)+(m.shift_id?' · Turno #'+m.shift_id:'')+'</small>'+(m.note?'<p>'+esc(m.note)+'</p>':'')+(m.sale_id?'<button type="button" class="history-receipt-link" data-history-receipt="'+m.sale_id+'">Ver comprobante #'+m.sale_id+' '+icon('chevron')+'</button>':'')+'</article>').join('')||empty('Sin movimientos en estas fechas','El stock actual se muestra arriba.','box'))+'</div>'+pager('stock');
 }
 function render(){
  const c=current;if(!alive(c))return;const d=c.data;if(d&&$('#modal-title'))$('#modal-title').textContent='Historial · '+d.entity.name;
  $('#product-history-content').innerHTML='<div class="history-period-head"><span>'+esc(c.from)+' → '+esc(c.to)+'</span><button type="button" class="icon-button" data-history-refresh aria-label="Actualizar historial" '+(c.loading?'disabled':'')+'>'+icon('refresh')+'</button></div><div class="history-presets" role="group" aria-label="Período del historial">'+[['today','Hoy'],['yesterday','Ayer'],['week','7 días']].map(([v,label])=>'<button type="button" class="secondary" data-history-period="'+v+'" aria-pressed="'+selected(v)+'" '+(c.loading?'disabled':'')+'>'+label+'</button>').join('')+'</div><details class="history-custom"><summary>Elegir otras fechas</summary><form id="product-history-range"><label>Desde<input type="date" name="from" required value="'+esc(c.from)+'"></label><label>Hasta<input type="date" name="to" required value="'+esc(c.to)+'"></label><button type="submit" class="secondary" '+(c.loading?'disabled':'')+'>Ver historial</button></form></details>'+(c.loading?'<p class="info-block" role="status">Consultando el historial…</p>':c.error?'<p class="form-error" role="alert">'+esc(c.error)+'</p>':!d?'':(d.entity.active?'':'<p class="info-block">Registro archivado. Su historial se conserva.</p>')+(d.sales?'<div class="history-tabs" role="group" aria-label="Tipo de historial"><button type="button" data-history-tab="sales" aria-pressed="'+(c.tab==='sales')+'">Ventas del producto</button><button type="button" data-history-tab="stock" aria-pressed="'+(c.tab==='stock')+'">Stock asociado</button></div>':'')+(c.tab==='sales'&&d.sales?salesBody(d):stockBody(d)));
 }
 async function load(){
  const c=current,version=++request;c.loading=true;c.error='';render();
  try{const params=new URLSearchParams({from:c.from,to:c.to,salesPage:String(c.salesPage),stockPage:String(c.stockPage)}),d=await api('/'+(c.kind==='product'?'products':'inventory')+'/'+c.id+'/history?'+params);if(!alive(c)||version!==request)return;c.data=d;c.name=d.entity.name;c.from=d.from;c.to=d.to;c.salesPage=d.sales?.page||1;c.stockPage=d.stock.page;}
  catch(e){if(!alive(c)||version!==request)return;c.error=e.message;}
  finally{if(alive(c)&&version===request){c.loading=false;render();}}
 }
 async function open(kind,id,range={}){
  const state=ctx.getState();if(state.user.role!=='admin')throw Error('Solo la propietaria puede consultar este historial.');
  const entity=(kind==='product'?state.products:[...state.inventory,...(state.archivedInventory||[])]).find(p=>p.id===id);
  current={kind,id,user:state.user.id,name:entity?.name||'Registro',from:range.from||today(),to:range.to||range.from||today(),salesPage:1,stockPage:1,tab:kind==='product'?'sales':'stock',loading:false,error:'',data:null};show();await load();
 }
 async function click(el){
  if(el.dataset.productHistory){await open('product',Number(el.dataset.productHistory),el.dataset.historyFrom?{from:el.dataset.historyFrom,to:el.dataset.historyTo}:{});return true;}
  if(el.dataset.inventoryHistory){await open('inventory',Number(el.dataset.inventoryHistory));return true;}
  if(el.hasAttribute('data-history-return')&&current){show();return true;}
  if(!current||!alive(current))return false;
  const c=current;
  if(el.dataset.historyTab){c.tab=el.dataset.historyTab;render();return true;}
  if(el.hasAttribute('data-history-refresh')){await load();return true;}
  if(el.dataset.historyPage){c[el.dataset.historyPage+'Page']=Number(el.dataset.page);await load();return true;}
  if(el.dataset.historyPeriod){Object.assign(c,periodRange(el.dataset.historyPeriod));c.salesPage=1;c.stockPage=1;await load();return true;}
  if(el.dataset.historyReceipt){el.disabled=true;try{const sale=await api('/sales/'+el.dataset.historyReceipt);if(!alive(c))return true;showReceipt(sale);$('dialog.modal[open]')?.insertAdjacentHTML('beforeend','<button type="button" class="secondary full history-back" data-history-return>Volver al historial '+icon('arrow')+'</button>');}finally{el.disabled=false;}return true;}
  return false;
 }
 async function submit(e){if(e.target.getAttribute('id')!=='product-history-range')return false;const values=Object.fromEntries(new FormData(e.target));current.from=values.from;current.to=values.to;current.salesPage=1;current.stockPage=1;await load();return true;}
 return {click,submit,open,reset:()=>{current=null;request++;}};
}
