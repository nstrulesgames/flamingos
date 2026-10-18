import { createReconciliationUI } from './reconciliation.js';
import { createCustomersUI } from './customers.js';
import { servingPrice, weightBasisLabel, cartLineKey } from './pricing.js';
import { menuGroups, maximumQuantity } from './catalog.js';
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=c=>`Bs ${(Number(c||0)/100).toLocaleString('es-BO',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const cents=v=>Math.round(Number(v)*100);
const date=(v,full=false)=>new Date(v).toLocaleString('es-BO',{timeZone:'America/La_Paz',...(full?{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}:{hour:'2-digit',minute:'2-digit'})});
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/La_Paz',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const paths={wallet:'M3 7a2 2 0 0 1 2-2h13v4M3 7v11a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2zM16 14h.01',grid:'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',chart:'M3 3v18h18M7 16v-5m5 5V7m5 9V4',box:'m3 7 9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10M7 5l10 4',receipt:'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 7h6M9 11h6M9 15h3',clock:'M12 8v4l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',users:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M16 4a4 4 0 0 1 0 8M22 21v-2a4 4 0 0 0-3-4M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',search:'m21 21-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',plus:'M12 5v14M5 12h14',minus:'M5 12h14',arrow:'M5 12h14m-5-5 5 5-5 5',close:'m6 6 12 12M6 18 18 6',check:'m5 12 4 4L19 6',bag:'M5 7h14l2 14H3zM9 8V6a3 3 0 0 1 6 0v2',cash:'M2 5h20v14H2zM6 9v6m12-6v6M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',qr:'M3 3h6v6H3zM15 3h6v6h-6zM3 15h6v6H3zM15 15h2v2h-2zM19 15h2v6h-6v-2',card:'M2 5h20v14H2zM2 10h20M6 15h4',logout:'M9 3H3v18h6M10 12h11m-4-4 4 4-4 4',chevron:'m9 5 7 7-7 7',alert:'m12 3 10 18H2zM12 9v5m0 3v1',download:'M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4',edit:'m15 3 6 6-12 12H3v-6zM12 6l6 6',coffee:'M3 8h14v10a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3zM17 8h2a3 3 0 0 1 0 6h-2M7 2v3m5-3v3',refresh:'M20 7a9 9 0 1 0 1 8M20 2v6h-6',shield:'m12 2 9 4v6c0 6-9 10-9 10S3 18 3 12V6zM8 12l3 3 5-6',print:'M6 9V2h12v7M6 18H2V9h20v9h-4M6 14h12v8H6z'};
const icon=(name,cls='')=>`<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]||paths.grid}"/></svg>`;
Object.assign(paths,{sun:'M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',moon:'M20.9 13.2A9 9 0 1 1 10.8 3.1a7 7 0 0 0 10.1 10.1',monitor:'M3 3h18v13H3zM8 21h8m-4-5v5'});
function appearanceControls(){
  return `<section class="appearance" aria-label="Apariencia"><h2>Apariencia</h2><p>Elige el cristal que prefieras para este dispositivo.</p><div class="theme-options" role="group" aria-label="Modo de color">${[['light','sun','Claro'],['dark','moon','Oscuro'],['system','monitor','Sistema']].map(([value,ic,label])=>`<button type="button" data-theme-preference="${value}" aria-pressed="${window.FlamingoTheme.preference===value}">${icon(ic)}<span>${label}</span></button>`).join('')}</div></section>`;
}
const art=(p,cls='')=>`<svg class="food-art ${cls}" aria-hidden="true" viewBox="0 0 220 160"><use href="/${['sandwich','empanada','brownie','cookie','coffee','shake','juice','bolo'].includes(p.art)?'menu-art':'art'}.svg#${esc(p.art)}"/></svg>`;
const brand=`<div class="brand"><img src="/icon.svg" alt=""><div>Flamingo’s<span>PUNTO DE VENTA</span></div></div>`;
let state,view='pos',category='Todos',search='',cart=[],service='local',orderNote='',payment='cash',pendingSale=null,reportData,online=true,refreshing=false;
let visibleGroups=[],selectedVariantSize='Chica';
const submittingForms=new WeakSet();
const uncertainForms=new WeakSet();
const app=$('#app');
function toast(message,error=false){const t=$('#toast');t.textContent=message;t.className=`show ${error?'error':''}`;clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.className='',4500);}
async function api(path,body,method=body===undefined?'GET':'POST') {
  let response;
  try {response=await fetch(`/api${path}`,{method,headers:body===undefined?{}:{'Content-Type':'application/json','X-Flamingo-Request':'1'},body:body===undefined?undefined:JSON.stringify(body)});} catch {online=false;throw new Error('Sin conexión al servidor. La operación no se ha confirmado; vuelve a intentar cuando tengas conexión.');}
  let data;
  try{data=await response.json();}catch{const error=new Error('El servidor no confirmó la operación. Vuelve a intentar; en un cobro se conservará la misma solicitud.');error.status=response.status;throw error;}
  online=true;
  if(!response.ok){if(response.status===401&&state){state=null;cart=[];pendingSale=null;customers.reset();closeModal();boot();}const error=new Error(data.error||'No se pudo completar la operación.');error.status=response.status;throw error;}
  online=true;return data;
}
function modal(title,subtitle,content,wide=false){
  const previous=document.activeElement;
  $('#modal-root').innerHTML=`<dialog class="modal ${wide?'wide':''}" aria-labelledby="modal-title"><header><div><h2 id="modal-title" tabindex="-1" autofocus>${title}</h2><p>${subtitle}</p></div><button type="button" class="icon-button" data-action="close-modal" aria-label="Cerrar">${icon('close')}</button></header>${content}</dialog>`;
  const d=$('.modal');d.showModal();d.addEventListener('close',()=>{d.remove();previous?.focus();if(d.classList.contains('payment-modal')&&cart.length&&view==='pos'&&!pendingSale)showCart();});
  d.addEventListener('click',e=>{const box=d.getBoundingClientRect();if(e.target===d&&(e.clientX<box.left||e.clientX>box.right||e.clientY<box.top||e.clientY>box.bottom)&&canDismissModal(d))d.close();});
  d.addEventListener('cancel',e=>{if(!canDismissModal(d))e.preventDefault();});
  setTimeout(()=>{if(d.isConnected&&window.matchMedia('(min-width:721px) and (pointer:fine)').matches&&!d.classList.contains('count-modal'))d.querySelector('input:not([type=hidden]),select,textarea,button[type=submit]')?.focus();},80);
}
function closeModal(){if(pendingSale||customers.hasPending()){toast('Reintenta la operación pendiente para confirmar su resultado.',true);return;}$('dialog.modal[open]')?.close();}
function canDismissModal(d=$('dialog.modal[open]')){if(pendingSale||customers.hasPending()){toast('Reintenta la operación pendiente para confirmar su resultado.',true);return false;}if(d?.querySelector('form[aria-busy="true"]')){toast('Estamos guardando. Espera un momento.',true);return false;}return true;}
const button=(label,action,cls='primary',extra='')=>`<button type="button" class="${cls}" data-action="${action}" ${extra}>${label}</button>`;
const empty=(title,copy,ic='receipt')=>`<div class="empty">${icon(ic)}<h3>${title}</h3><p>${copy}</p></div>`;
const formError=error=>{const el=$('.form-error');if(el){el.textContent=error.message;el.hidden=false;}else toast(error.message,true);};
const formFooter=(label)=>`<p class="form-error" role="alert" hidden></p><button type="submit" class="primary full">${label}${icon('arrow')}</button>`;
async function boot(){
  try{const status=await api('/status');
    try{state=await api('/state');view=state.user.role==='admin'?'dashboard':'pos';render();recoverPayment();if(!pendingSale)customers.recover();return;}catch(e){if(!e.message.includes('Inicia sesión'))throw e;}
    loginScreen(status);
  }catch(e){app.innerHTML=`<main class="boot-error">${brand}${empty('No pudimos conectar',esc(e.message),'alert')}${button('Volver a intentar','boot')}</main>`;}
}
function loginScreen(status){
  const setupBlocked=!status.setup&&status.setupAllowed===false;
  app.innerHTML=`<main class="login"><section class="login-story"><img class="original-logo" src="/logo.png" alt="Logo de Flamingo’s"><div><span class="eyebrow">HECHO PARA TU NEGOCIO</span><h1>Buen sabor.<br>Buenas cuentas.</h1><p>Cada venta, cada producto y cada turno.<br>Todo en un solo lugar.</p></div><small>Flamingo’s · Un día más para hacerlo bien.</small></section><section class="login-form">${brand}<div><span class="eyebrow">${status.demo?'ESPACIO DE DEMOSTRACIÓN':'BIENVENIDO A FLAMINGO’S'}</span><h2>${setupBlocked?'Configuración pendiente':status.setup?'Iniciar sesión':'Crear cuenta del propietario'}</h2><p>${setupBlocked?'El negocio aún no tiene una cuenta de propietario.':status.setup?'Usa el acceso que te asignó el propietario.':'Este acceso administrará el negocio y los permisos del equipo.'}</p>${setupBlocked?`<div class="setup-access"><p>La primera cuenta debe crearse desde el servidor local del negocio. Cuando esté lista, podrás entrar aquí con tu correo o usuario.</p><button type="button" class="primary full" data-action="boot">Ya creé la cuenta · actualizar ${icon('refresh')}</button></div>`:`<form id="login-form">${!status.setup?'<label>Tu nombre<input name="name" autocomplete="name" required maxlength="120"></label>':''}<label>Correo o usuario<input name="username" autocomplete="username" inputmode="email" autocapitalize="none" spellcheck="false" maxlength="254" required placeholder="tu@correo.com o tu usuario" ${status.demo?'value="admin"':''}></label><label for="login-password">Contraseña</label><div class="password-field"><input id="login-password" name="password" type="password" autocomplete="${status.setup?'current-password':'new-password'}" required minlength="10" placeholder="${status.setup?'Tu contraseña':'Al menos 10 caracteres'}" ${status.demo?'value="Flamingo2026!"':''}><button type="button" class="password-toggle" data-action="toggle-password" aria-controls="login-password" aria-pressed="false" aria-label="Mostrar contraseña">Mostrar</button></div>${formFooter(status.setup?'Entrar':'Crear cuenta')}</form>`}${status.google&&status.setup?'<div class="google-access"><p class="muted">También puedes entrar con tu cuenta autorizada</p><button type="button" class="secondary full" data-action="google-login">Continuar con Google</button></div>':''}${status.demo?'<div class="demo-login"><strong>Prueba libremente</strong><p>Datos de ejemplo separados del negocio real.<br>Propietario: <b>admin</b> · Cajera: <b>camila</b><br>Contraseña: <b>Flamingo2026!</b></p></div>':''}<small class="muted">${icon('shield')} Acceso individual y operaciones registradas</small></div><footer>Un sistema simple. Un negocio bajo control.</footer></section></main>`;
  $('.login-form>div:not(.brand)').insertAdjacentHTML('beforeend',appearanceControls());
  const googleError=new URLSearchParams(window.location.search).get('google_error');
  if(googleError){formError(new Error(googleError==='unauthorized'?'Este correo no tiene acceso al negocio. Pide al propietario que lo registre en Equipo.':'No se completó el acceso con Google. Vuelve a intentarlo o usa tu contraseña.'));window.history.replaceState(null,'',window.location.pathname);}
  $('#login-form')?.addEventListener('submit',async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;try{const data=Object.fromEntries(new FormData(e.target));if(!status.setup)await api('/setup',data);await api('/login',data);state=await api('/state');view=state.user.role==='admin'?'dashboard':'pos';render();recoverPayment();if(!pendingSale)customers.recover();}catch(error){formError(error);}finally{b.disabled=false;}});
}
const navItems=[['pos','grid','Punto de venta'],['dashboard','chart','Resumen'],['inventory','box','Productos'],['sales','receipt','Ventas'],['shifts','clock','Turnos y arqueos'],['team','users','Equipo'],['customers','wallet','Clientes'],['more','grid','Más opciones']];
function render(){
  if(!state)return;

  const admin=state.user.role==='admin';
  const items=navItems.filter(([id])=>admin||!['dashboard','team'].includes(id));
  const bottomItems=admin?['pos','dashboard','shifts','more']:['pos','shifts','sales','more'];
  app.innerHTML=`<div class="shell"><aside class="sidebar">${brand}<div class="workspace-label">MI NEGOCIO</div><nav aria-label="Navegación principal">${items.map(([id,ic,label])=>`<button class="nav-item ${view===id?'active':''}" data-view="${id}" aria-label="${label}" title="${label}">${icon(ic)}<span>${label}</span>${view===id?'<i></i>':''}</button>`).join('')}</nav><div class="sidebar-bottom"><div class="sidebar-tip">${icon('shield')}<span>Tu negocio.<br><b>Siempre a mano.</b></span></div><button class="profile" data-action="logout" aria-label="Cerrar sesión"><span class="avatar">${esc(state.user.name[0])}</span><span><b>${esc(state.user.name)}</b><small>${admin?'Propietario':'Cajero'}</small></span>${icon('logout')}</button></div></aside><div class="main-shell"><header class="topbar"><div class="breadcrumb"><img src="/icon.svg" alt="">Flamingo’s <span>/</span> <b>${navItems.find(i=>i[0]===view)[2]}</b></div><div class="topbar-right">${state.demo?'<span class="demo-badge">DEMOSTRACIÓN</span>':''}<span class="connection ${online?'':'offline'}"><i></i><span>${online?'Conectado':'Sin conexión'}</span></span><span class="top-date">${new Date().toLocaleDateString('es-BO',{timeZone:'America/La_Paz',day:'numeric',month:'short',year:'numeric'})}</span><button class="avatar small" data-view="more" aria-label="Mi cuenta y opciones">${esc(state.user.name[0])}</button></div></header><main id="content" class="content ${view==='pos'?'pos-content':''}"></main><nav class="mobile-nav" aria-label="Navegación móvil">${items.map(([id,ic,label])=>`<button class="${view===id?'active':''}" data-view="${id}" aria-label="${label}" title="${label}">${icon(ic)}<span>${id==='shifts'?'Turnos':id==='pos'?'Vender':label}</span></button>`).join('')}</nav></div></div>`;
  renderContent();
  $('.mobile-nav').innerHTML=bottomItems.map(id=>{const [,ic,label]=navItems.find(n=>n[0]===id);return `<button class="${view===id||id==='more'&&!bottomItems.includes(view)?'active':''}" data-view="${id}" aria-label="${label}" ${view===id?'aria-current="page"':''}>${icon(ic)}<span>${id==='pos'?'Vender':id==='shifts'?'Arqueo':id==='more'?'Más':label}</span></button>`;}).join('');
}
function heading(kicker,title,subtitle,actions=''){return `<div class="page-heading"><div><h1>${title}</h1><p>${subtitle}</p></div><div class="heading-actions">${actions}</div></div>`;}
function renderContent(){
  if(view==='pos')renderPOS();
  if(view==='dashboard')renderDashboard();
  if(view==='inventory')renderInventory();
  if(view==='sales')renderSales();
  if(view==='shifts')renderShifts();
  if(view==='team')renderTeam();
  if(view==='more')renderMore();
  if(view==='customers')customers.render();
}
function renderMore(){
  const admin=state.user.role==='admin';
  $('#content').innerHTML=heading('','Más opciones','Inventario, comprobantes y acceso a tu cuenta.')+`<div class="more-menu">${[['inventory','box','Productos','Productos, cantidades y reposiciones'],['sales','receipt','Historial de ventas','Comprobantes y medios de pago'],['customers','wallet','Clientes','Deudas, abonos y saldos a favor'],...(admin?[['team','users','Equipo','Cajeros y permisos']]:[])].map(([id,ic,name,copy])=>`<button data-view="${id}">${icon(ic)}<span><b>${name}</b><small>${copy}</small></span>${icon('chevron')}</button>`).join('')}</div><div class="account-card"><span class="avatar">${esc(state.user.name[0])}</span><div><b>${esc(state.user.name)}</b><small>${admin?'Propietario':'Cajero'}</small></div>${button('Cambiar mi contraseña','my-password','secondary')}${button('Cerrar sesión','logout','secondary')}</div>`;
  $('.more-menu').insertAdjacentHTML('afterend',appearanceControls());
}
function shiftChip(){return state.shift?`<span class="shift-chip"><i></i> Turno #${String(state.shift.id).padStart(3,'0')} · ${esc(state.shift.cashier)}</span>`:button(`${icon('plus')} Abrir turno`,'open-shift','secondary');}
function reconciliationLocked(){return !!state.shift&&state.shift.stage!=='open';}
function pausedNotice(){return `<div class="reconcile-notice">${icon('clock')}<div><b>${reconciliation.label(state.shift.stage)} · operaciones pausadas</b><p>El inventario permanece fijo hasta que el propietario apruebe el arqueo.</p></div>${button('Ver arqueo','go-shifts','secondary')}</div>`;}
function renderPOS(){
  $('#content').innerHTML=`<div class="catalog"><div class="pos-heading"><div><h1>Nueva venta</h1><p>El menú de Flamingo’s, a un toque.</p></div>${shiftChip()}</div><div class="catalog-controls"><div class="catalog-toolbar"><label class="search-box">${icon('search')}<input id="product-search" type="search" aria-label="Buscar productos" placeholder="Buscar producto o sabor…" enterkeyhint="search" autocomplete="off" value="${esc(search)}"></label></div><div class="categories" role="group" aria-label="Categorías">${['Todos',...state.categories].map(c=>`<button data-category="${esc(c)}" aria-pressed="${category===c}" class="category ${category===c?'active':''}">${esc(c)}</button>`).join('')}</div></div><div id="product-count" class="catalog-result muted"></div><div id="product-grid" class="product-grid"></div><div class="catalog-foot">${icon('shield')} Precios del menú · Conteo por producto.</div></div><dialog id="order" class="order-panel" aria-labelledby="order-title"></dialog><div class="sale-dock"><button class="mobile-cart" data-action="show-cart"></button><button class="primary dock-checkout" data-action="checkout" aria-label="Cobrar pedido">${icon('cash')} Cobrar</button></div>`;
  renderProducts();renderCart();
  if(reconciliationLocked())$('.catalog').insertAdjacentHTML('afterbegin',pausedNotice());
  $('#product-search').addEventListener('input',e=>{search=e.target.value;renderProducts();});
}
function renderProducts(){
  if(state.blind){$('#product-count').textContent='Conteo independiente';$('#product-grid').innerHTML=empty('Inventario en conteo','Ingresa las cantidades físicas desde Turnos y arqueos. Los saldos esperados permanecen ocultos.','box');return;}
  visibleGroups=menuGroups(state.products,{category,search});
  $('#product-count').textContent=`${visibleGroups.length} opciones${category==='Todos'?' · Menú completo':''}`;
  $('#product-grid').innerHTML=visibleGroups.length?visibleGroups.map((group,index)=>{
    const p=group.products[0],many=group.products.length>1,ids=group.products.map(p=>p.id),qty=cart.filter(c=>ids.includes(c.id)).reduce((sum,c)=>sum+c.quantity,0);
    const available=group.products.some(p=>p.available===null||p.available>0),pending=group.products.every(p=>p.inventory_mode==='recipe'&&!p.recipe.length),prices=group.products.map(p=>p.price),min=Math.min(...prices),max=Math.max(...prices);
    return `<button class="product-card ${qty?'selected':''} ${pending?'needs-recipe':''}" data-menu-group="${index}" ${!many?`data-product="${p.id}"`:''} ${!available&&!pending?'disabled':''} ${pending&&state.user.role!=='admin'?'disabled':''}><div class="product-visual art-${p.art}">${art(p)}${pending?'<span class="stock-pill recipe-pill">Configurar stock</span>':!available?'<span class="stock-pill sold-out">'+icon('alert')+'Agotado</span>':''}${qty?`<span class="selected-qty">${qty}</span>`:''}</div><div class="product-info"><h3>${esc(many?group.name:p.name)}</h3><small class="product-option">${esc(many?group.products.map(p=>p.variant).join(' · '):p.variant||p.category)}</small><div class="product-bottom"><strong>${group.products.every(p=>p.allow_manual_price)?'Precio libre':many&&group.products.some(p=>p.allow_manual_price)?'Ver precios':min===max?money(min):`Desde ${money(min)}`}${!many&&p.pricing_mode==='weight'?` / ${weightBasisLabel(p.weight_basis_grams)}`:''}</strong><span class="add-product">${icon(pending?'edit':many?'chevron':qty?'check':'plus')}</span></div></div></button>`;
  }).join(''):empty('No encontramos ese producto','Prueba con otro nombre, sabor o categoría.','search');
}
function chooseVariant(group){
  const hasSizes=group.category==='Escarchas'&&group.products.some(p=>p.flavor),sizes=[...new Set(group.products.map(p=>p.size).filter(Boolean))];
  const initial=sizes.includes(selectedVariantSize)?selectedVariantSize:sizes[0];
  modal(group.name,'Elige una presentación para añadirla al pedido.',`${hasSizes?`<div class="variant-sizes" role="group" aria-label="Tamaño">${sizes.map(size=>{const item=group.products.find(p=>p.size===size);return `<button data-variant-size="${esc(size)}" aria-pressed="${size===initial}"><b>${esc(size)}</b><small>${esc(item.description||'')} · ${money(item.price)}</small></button>`;}).join('')}</div>`:''}<div id="variant-options" class="variant-options"></div>`);
  $('.modal').classList.add('variant-modal');
  const fill=size=>{
    $('#variant-options').innerHTML=group.products.filter(p=>!hasSizes||p.size===size).map(p=>`<button data-variant-product="${p.id}" ${p.available!==null&&p.available<1?'disabled':''}><span>${esc(p.flavor||p.variant||p.name)}</span><small>${p.available===0?icon('alert')+' Agotado':p.allow_manual_price?'Precio libre':money(p.price)}</small>${icon('plus')}</button>`).join('');
  };
  fill(initial);
  $('.variant-sizes')?.addEventListener('click',e=>{const b=e.target.closest('[data-variant-size]');if(!b)return;selectedVariantSize=b.dataset.variantSize;$('.variant-sizes').querySelectorAll('button').forEach(button=>button.setAttribute('aria-pressed',button===b));fill(selectedVariantSize);});
}
const cartTotal=()=>cart.reduce((sum,line)=>sum+line.price*line.quantity,0);
function pendingKey(){return `flamingo-pending-${state.demo?'demo':'live'}-${state.user.id}`;}
function rememberPayment(payload){try{localStorage.setItem(pendingKey(),JSON.stringify(payload));return true;}catch{return false;}}
function forgetPayment(){try{localStorage.removeItem(pendingKey());}catch{}pendingSale=null;}
function recoverPayment(){
  let saved;
  try{saved=JSON.parse(localStorage.getItem(pendingKey())||'null');}catch{return;}
  if(!saved)return;
  pendingSale=saved;
  modal('Confirmar un cobro pendiente','La conexión se interrumpió durante un cobro. Consulta o reintenta la misma operación para evitar duplicados.',`<form id="payment-form"><div class="info-block">${icon('shield')} Se conservaron los datos de la operación. El servidor registrará esta venta una sola vez.</div>${formFooter('Verificar y recuperar comprobante')}</form>`);
}
function renderCart(){
  const focused=document.activeElement,focusId=focused?.dataset.qty,focusDelta=focused?.dataset.delta,focusWeight=focused?.dataset.weight||'',focusPrice=focused?.dataset.price||'';
  const scroll=$('.order-lines')?.scrollTop||0;
  const qty=cart.reduce((s,l)=>s+l.quantity,0);
  $('#order').innerHTML=`<div class="order-top"><div><h2 id="order-title">Tu pedido <span class="count-badge">${qty}</span></h2></div><button class="icon-button" data-action="hide-cart" aria-label="Volver al menú">${icon('close')}</button></div><div class="service-toggle"><button data-service="local" class="${service==='local'?'active':''}">${icon('coffee')} Para aquí</button><button data-service="takeaway" class="${service==='takeaway'?'active':''}">${icon('bag')} Para llevar</button></div><div class="order-lines">${cart.length?cart.map(p=>`<div class="order-line"><div class="line-art art-${p.art}">${art(p)}</div><div class="line-info"><h3>${esc(p.name)}</h3><span>${p.weight_grams?`${p.weight_grams} g · ${money(p.weight_price)} / ${weightBasisLabel(p.weight_basis_grams)}`:p.manual_price?`Precio libre · ${money(p.price)}`:money(p.price)}</span>${p.manual_price?`<button class="text-button" data-edit-price="${p.id}" data-price="${p.price}">Editar importe</button>`:''}${p.weight_grams?`<button class="text-button" data-edit-weight="${p.id}" data-weight="${p.weight_grams}">Cambiar peso</button>`:''}<div class="quantity"><button data-qty="${p.id}" data-price="${p.manual_price?p.price:''}" data-weight="${p.weight_grams||''}" data-delta="-1" aria-label="Quitar uno de ${esc(p.name)}">${icon('minus')}</button><b>${p.quantity}</b><button data-qty="${p.id}" data-price="${p.manual_price?p.price:''}" data-weight="${p.weight_grams||''}" data-delta="1" aria-label="Agregar uno de ${esc(p.name)}">${icon('plus')}</button></div></div><strong>${money(p.price*p.quantity)}</strong></div>`).join(''):empty('Tu pedido está vacío','Añade productos. Aquí verás las cantidades y el total.','bag')}</div><div class="order-bottom">${cart.length?`<details class="order-extras"><summary>Nota y opciones del pedido</summary><label class="order-note">Nota del pedido<input id="order-note" placeholder="Ej. sin cebolla, salsa aparte…" maxlength="300" value="${esc(orderNote)}"></label><button class="clear-cart" data-action="clear-cart">Vaciar orden</button></details>`:''}<div class="total-line"><span>Total a cobrar</span><strong>${money(cartTotal())}</strong></div><button class="primary checkout" data-action="checkout" ${!cart.length||reconciliationLocked()?'disabled':''}><span>${icon('cash')} Cobrar pedido</span>${icon('arrow')}</button><p class="checkout-hint">${state.shift?`Turno de ${esc(state.shift.cashier)}`:'Abre un turno para comenzar a vender.'}</p></div>`;
  $('#order-note')?.addEventListener('input',e=>orderNote=e.target.value);
  $('.mobile-cart').innerHTML=`${icon('bag')}<span><b>${qty?`${qty} ${qty===1?'producto':'productos'}`:'Pedido vacío'}</b><small>${qty?'Ver pedido':'Elige del menú'}</small></span><strong>${money(cartTotal())}</strong>`;
  $('.dock-checkout').disabled=!qty||reconciliationLocked();
  $('.sale-dock').classList.toggle('has-items',qty>0);
  $('.order-lines').scrollTop=scroll;
  if(focusId)$('#order').querySelector(`[data-qty="${focusId}"][data-weight="${focusWeight}"][data-price="${focusPrice}"][data-delta="${focusDelta}"]`)?.focus({preventScroll:true});
}
function showCart(){const d=$('#order');if(d&&!d.open)d.showModal();}
function hideCart(){$('#order')?.close();}
function freePriceModal(id,oldPrice=null){
  const p=state.products.find(p=>p.id===id&&p.active);if(!p||!p.allow_manual_price)return;
  if(reconciliationLocked()){toast('Las operaciones están pausadas por el arqueo.',true);return;}
  modal(oldPrice?'Editar importe':p.name,'Escribe lo que corresponde cobrar por esta porción.',`<form id="free-price-form"><input type="hidden" name="id" value="${id}"><input type="hidden" name="oldPrice" value="${oldPrice||''}"><label>Importe a cobrar (Bs)<input name="unitPrice" id="free-unit-price" type="number" inputmode="decimal" min="0.01" max="100000" step="0.01" required value="${oldPrice?oldPrice/100:''}" placeholder="0,00" autofocus></label><p class="info-block">Precio libre: ingresa el importe que obtuviste al pesar la porción. Se registrará con tu usuario al cobrar.</p>${formFooter(oldPrice?'Guardar importe':'Añadir al pedido')}</form>`);
  const input=$('#free-unit-price'),submit=$('#free-price-form button[type="submit"]');
  const sync=()=>{submit.disabled=!(servingPrice(p,null,cents(input.value))>0)||!input.validity.valid;};input.addEventListener('input',sync);sync();
}
function weightModal(id,oldWeight=null){
  const p=state.products.find(p=>p.id===id&&p.active);if(!p)return;
  if(reconciliationLocked()){toast('Las operaciones están pausadas por el arqueo.',true);return;}
  modal(oldWeight?'Cambiar peso':p.name,'Ingresa el peso neto de una porción, sin el recipiente.',`<form id="weight-form"><input type="hidden" name="id" value="${id}"><input type="hidden" name="oldWeight" value="${oldWeight||''}"><p class="info-block">${money(p.price)} por ${weightBasisLabel(p.weight_basis_grams)}</p><label>Peso servido (g)<input name="weightGrams" id="served-weight" type="number" inputmode="numeric" min="1" max="100000" step="1" required value="${oldWeight||''}" placeholder="Peso de la balanza" autofocus></label><div class="payment-total"><span>Total por porción</span><strong id="weight-total">${money(0)}</strong></div><p class="muted">El importe se redondea a dos decimales. Cada porción conserva su peso en el comprobante.</p>${formFooter(oldWeight?'Guardar peso':'Añadir al pedido')}</form>`);
  const input=$('#served-weight'),submit=$('#weight-form button[type="submit"]');
  const sync=()=>{const price=servingPrice(p,Number(input.value));$('#weight-total').textContent=money(price||0);submit.disabled=!(price>0);};
  input.addEventListener('input',sync);sync();
}
function addProduct(id,delta=1,weightGrams=null,unitPrice=null){
  if(reconciliationLocked()){toast('Las operaciones están pausadas por el arqueo.',true);return;}
  const p=state.products.find(p=>p.id===id);if(!p)return;
  if(p.allow_manual_price&&unitPrice===null){freePriceModal(id);return false;}
  if(!p.allow_manual_price&&unitPrice!==null){toast('Este producto no permite precio libre.',true);return false;}
  if(p.pricing_mode==='weight'&&weightGrams===null){weightModal(id);return false;}
  if(p.pricing_mode!=='weight'&&weightGrams!==null){toast('El tipo de cobro cambió. Actualiza el pedido.',true);return false;}
  const price=servingPrice(p,weightGrams,unitPrice);if(!(price>0)){toast('Ingresa un importe o peso válido mayor a cero.',true);return false;}
  const key=cartLineKey({id,price,manual_price:p.allow_manual_price?1:0,weight_grams:weightGrams}),line=cart.find(c=>cartLineKey(c)===key),qty=(line?.quantity||0)+delta;
  const maximum=maximumQuantity(p,cart,state.inventory);
  const other=cart.filter(c=>c.id===id&&cartLineKey(c)!==key).reduce((n,c)=>n+c.quantity,0);
  if(delta>0&&qty+other>maximum){toast(`Puedes añadir hasta ${maximum} de ${p.name} con el stock restante.`,true);return false;}
  if(qty+other>999)return false;
  if(qty<=0)cart=cart.filter(c=>cartLineKey(c)!==key);else if(line)line.quantity=qty;else cart.push({...p,price,quantity:qty,manual_price:p.allow_manual_price?1:0,...(weightGrams!==null?{weight_grams:weightGrams,weight_price:p.price}: {})});
  document.querySelectorAll('[data-menu-group]').forEach(el=>{
    const ids=visibleGroups[Number(el.dataset.menuGroup)]?.products.map(p=>p.id)||[];
    const count=cart.filter(c=>ids.includes(c.id)).reduce((sum,c)=>sum+c.quantity,0);
    el.classList.toggle('selected',count>0);
    el.querySelector('.selected-qty')?.remove();
    if(count)el.querySelector('.product-visual').insertAdjacentHTML('beforeend',`<span class="selected-qty">${count}</span>`);
    el.querySelector('.add-product').innerHTML=icon(count?'check':'plus');
  });
  renderCart();$('#order-status').textContent=`${p.name}: ${Math.max(qty,0)} en el pedido. Total ${money(cartTotal())}.`;
  return true;
}
function openShift(){return reconciliation.openShift();}
function checkout(){
  if(reconciliationLocked()){toast('El turno está en arqueo. Espera la aprobación del propietario.',true);return;}
  if(!state.shift){openShift();return;}
  if(state.shift.user_id!==state.user.id&&state.user.role!=='admin'){toast('Este turno pertenece a otro usuario. Cambia de sesión o solicita el cierre al propietario.',true);return;}
  payment='cash';
  hideCart();
  modal('Cobrar pedido','Selecciona el medio de pago y confirma el importe.',`<form id="payment-form"><div class="payment-total"><span>Total a cobrar</span><strong>${money(cartTotal())}</strong></div><div class="payment-methods">${[['cash','cash','Efectivo'],['qr','qr','QR'],['card','card','Tarjeta'],['credit','wallet','Saldo'],['mixed','grid','Mixto'],...((state.user.role==='admin'||state.user.can_fiado)?[['fiado','users','Fiado']]:[])].map(([id,ic,name])=>`<button type="button" data-payment="${id}" aria-pressed="${payment===id}" class="${payment===id?'active':''}">${icon(ic)}${name}</button>`).join('')}</div><div id="payment-fields"></div>${formFooter('Confirmar cobro')}</form>`);
  paymentFields();
  $('.modal').classList.add('payment-modal');
}
function paymentFields(){
  const total=cartTotal();
  if(payment==='fiado'){
    $('#payment-fields').innerHTML=customers.picker('Cliente',false)+'<label>Paga ahora (Bs)<input name="paidNow" id="fiado-paid" type="number" inputmode="decimal" min="0" max="'+total/100+'" step="0.01" value="0" required></label><label>Medio del pago de hoy<select name="paidMethod" id="fiado-method"><option value="cash">Efectivo</option><option value="qr">QR</option><option value="card">Tarjeta</option></select></label><label class="check-label" id="fiado-verified-label" hidden><input name="verified" id="fiado-verified" type="checkbox" disabled> Confirmé que recibí el pago digital.</label><div class="info-block" id="fiado-summary" aria-live="polite"></div>';
    const preview=()=>{const c=customers.selected(),paid=cents($('#fiado-paid').value),available=Math.max(0,c?.balance||0),credit=Math.min(available,Math.max(0,total-paid)),debt=Math.max(0,total-paid-credit),allowed=c&&c.allow_fiado&&Math.max(0,-c.balance)+debt<=c.credit_limit;
      $('#fiado-summary').textContent='Total '+money(total)+' · Paga hoy '+money(paid)+(credit?' · Usa saldo '+money(credit):'')+' · Queda debiendo '+money(Math.max(0,-(c?.balance||0))+debt)+(debt&&!allowed?' · La propietaria debe habilitar el fiado o revisar su límite.':'');
      const digital=paid>0&&$('#fiado-method').value!=='cash',verified=$('#fiado-verified');$('#fiado-verified-label').hidden=!digital;verified.disabled=!digital;verified.required=digital;verified.checked=false;};
    customers.bindPicker(preview);$('#fiado-paid').addEventListener('input',preview);$('#fiado-method').addEventListener('change',preview);preview();return;
  }
  if(payment==='credit'){

    $('#payment-fields').innerHTML=`${customers.picker()}<p class="info-block" id="credit-hint">${icon('wallet')} Elige al cliente que paga con su saldo a favor.</p>`;
    customers.bindPicker(c=>{$('#credit-hint').innerHTML=!c?`${icon('wallet')} Un cliente nuevo no tiene saldo todavía.`:c.balance>=total?`${icon('wallet')} Saldo de ${esc(c.name)}: <b>${money(c.balance)}</b>. Quedará ${money(c.balance-total)}.`:`${icon('alert')} ${esc(c.name)} tiene ${money(c.balance)}. Usa <b>Mixto</b> para completar con efectivo o QR.`;});
    return;
  }
  $('#payment-fields').innerHTML=payment==='cash'?`<label>Efectivo recibido (Bs)<input id="tendered" name="tendered" type="number" inputmode="decimal" min="${cartTotal()/100}" step="0.01" value="${(cartTotal()/100).toFixed(2)}" required></label><div class="quick-cash"><button type="button" data-cash="${cartTotal()/100}">Exacto</button>${[20,50,100,200].filter(n=>n*100>=cartTotal()).map(n=>`<button type="button" data-cash="${n}">Bs ${n}</button>`).join('')}</div><div class="change-row"><span>Vuelto</span><strong id="change-value">${money(0)}</strong></div><label class="check-label" id="keep-change-label" hidden><input type="checkbox" name="keepChange" id="keep-change"> Guardar el vuelto como saldo a favor del cliente</label><div id="keep-change-customer" hidden>${customers.picker()}</div>`:payment==='mixed'?`<div class="field-row"><label>Efectivo aplicado (Bs)<input name="cash" id="mixed-cash" type="number" inputmode="decimal" min="0" step="0.01" value="0" required></label><label>QR (Bs)<input name="qr" type="number" inputmode="decimal" min="0" step="0.01" value="0" required></label><label>Tarjeta (Bs)<input name="card" type="number" inputmode="decimal" min="0" step="0.01" value="0" required></label><label>Saldo a favor (Bs)<input name="credit" type="number" inputmode="decimal" min="0" step="0.01" value="0" required></label></div>${customers.picker('Cliente (solo si usa saldo a favor)')}<label>Efectivo recibido (Bs)<input name="tendered" type="number" inputmode="decimal" min="0" step="0.01" value="0" required></label><p class="muted">Los importes aplicados deben sumar ${money(cartTotal())}. Verifica los pagos digitales antes de confirmar.</p>`:`<div class="info-block">${icon(payment)} Verifica el pago de <b>${money(cartTotal())}</b> en tu ${payment==='qr'?'aplicación bancaria':'terminal de tarjeta'}.</div><label class="check-label"><input type="checkbox" name="verified" required> Confirmé que el pago fue recibido.</label>`;
  // When a customer leaves the change, it is kept as their balance instead of being handed back.
  const syncCustomer=()=>{const enabled=payment==='cash'?$('#keep-change').checked:payment==='mixed'?cents($('#payment-fields [name="credit"]').value)>0:true;customers.enablePicker(enabled);};
  const syncChange=()=>{const change=Math.max(0,cents($('#tendered').value)-total);$('#change-value').textContent=money(change);$('#keep-change-label').hidden=!change;if(!change){$('#keep-change').checked=false;$('#keep-change-customer').hidden=true;}syncCustomer();};
  $('#tendered')?.addEventListener('input',syncChange);
  $('#keep-change')?.addEventListener('change',e=>{$('#keep-change-customer').hidden=!e.target.checked;syncCustomer();});
  customers.bindPicker();
  $('#payment-fields [name="credit"]')?.addEventListener('input',syncCustomer);
  if(['cash','mixed'].includes(payment))syncCustomer();
}
function showReceipt(sale){
  modal('Venta registrada',`Orden #${String(sale.id).padStart(4,'0')} · ${date(sale.created_at,true)}`,`<div class="receipt" id="receipt"><div class="receipt-brand">Flamingo’s</div><p>Comprobante interno · No es factura fiscal</p><p>${esc(sale.cashier)} · ${sale.service==='local'?'Para aquí':'Para llevar'}</p><div class="receipt-lines">${sale.lines.map(l=>`<div><span>${l.quantity} × ${esc(l.name)}${l.manual_price?'<small>Precio libre</small>':''}${l.weight_grams?` · ${l.weight_grams} g por porción<small>${money(l.weight_price)} / ${weightBasisLabel(l.weight_basis_grams)}</small>`:''}</span><b>${money(l.price*l.quantity)}</b></div>`).join('')}</div><div class="total-line"><span>Total</span><strong>${money(sale.total)}</strong></div>${sale.customer?`<p>Cliente: <b>${esc(sale.customer)}</b></p>`:''}${[['Efectivo',sale.cash],['QR',sale.qr],['Tarjeta',sale.card],['Saldo a favor',sale.credit],['Fiado en esta compra',sale.debt]].filter(v=>v[1]>0).map(([label,value])=>`<div class="receipt-payment"><span>${label}</span><b>${money(value)}</b></div>`).join('')}${sale.cash?`<div class="receipt-payment"><span>Recibido / vuelto entregado</span><b>${money(sale.tendered)} / ${money(sale.change_due-(sale.change_credit||0))}</b></div>`:''}${sale.change_credit?`<div class="receipt-payment"><span>Vuelto guardado como saldo</span><b>${money(sale.change_credit)}</b></div>`:''}${sale.customer?`<div class="receipt-payment"><span>${sale.customer_balance<0?'Deuda actual':'Saldo a favor actual'} de ${esc(sale.customer)}</span><b>${money(Math.abs(sale.customer_balance))}</b></div>`:''}${sale.note?`<p class="receipt-note">${esc(sale.note)}</p>`:''}${sale.status==='void'?`<p class="danger-text">ANULADA: ${esc(sale.void_reason)}</p>`:''}<p>Gracias por elegirnos. ¡Vuelve pronto!</p></div><div class="modal-actions">${button(`${icon('print')} Imprimir`,'print','secondary')}${button('Nueva venta','new-sale')}</div>${state.user.role==='admin'&&sale.status==='paid'&&state.shift?.stage==='open'&&state.shift.id===sale.shift_id?`<button class="text-danger" data-void="${sale.id}">Anular venta y devolver productos al inventario</button>`:''}`);
}
function syncCartWithCatalog(){
  const total=cartTotal(),count=cart.length;
  cart=cart.flatMap(line=>{
    const product=state.products.find(p=>p.id===line.id&&p.active);if(!product)return [];
    if(!!product.allow_manual_price!==!!line.manual_price)return [];
    const weighted=product.pricing_mode==='weight';if(weighted!==!!line.weight_grams)return [];
    const price=servingPrice(product,line.weight_grams,line.manual_price?line.price:undefined);if(!(price>0))return [];
    return [{...product,price,quantity:line.quantity,manual_price:line.manual_price||0,...(weighted?{weight_grams:line.weight_grams,weight_price:product.price}:{})}];
  });
  if(total!==cartTotal()||count!==cart.length)toast('El menú cambió. Revisa los productos y el total del pedido.',true);
}
async function refresh(){
  const user=state?.user.id,next=await api('/state');
  if(!state||state.user.id!==user)throw new Error('La sesión cambió. Vuelve a iniciar sesión.');
  state=next;syncCartWithCatalog();
  if(view==='dashboard')await loadReport(reportData?.from,reportData?.to);
  if(!state||state.user.id!==user)throw new Error('La sesión cambió. Vuelve a iniciar sesión.');
  render();
}
let reportRequest=0;
async function loadReport(from=today(),to=today()){
  const request=++reportRequest,user=state.user.id;
  const result=await api(`/report?from=${from}&to=${to}`);
  if(request===reportRequest&&state?.user.id===user){
    reportData=result;
    syncReportPresets();
  }
}
function syncReportPresets(){
  const from=reportData?.from||today(),to=reportData?.to||today();
  const base=new Date(today()+'T12:00:00Z').getTime(),yesterday=new Date(base-86400000).toISOString().slice(0,10),weekStart=new Date(base-6*86400000).toISOString().slice(0,10);
  document.querySelectorAll('[data-period]').forEach(b=>{const active=b.dataset.period==='today'?from===today()&&to===today():b.dataset.period==='yesterday'?from===yesterday&&to===yesterday:from===weekStart&&to===today();b.classList.toggle('active',active);b.setAttribute('aria-pressed',active);});
}
function businessStatus(){
  const s=state.shift,waiting=s?.stage==='review',paused=s&&s.stage!=='open';
  return `<section class="business-status ${waiting?'needs-review':''}"><div class="business-status-main"><span class="status-symbol">${icon(waiting?'alert':s?'cash':'clock')}</span><div><span class="status-label">Estado actual de la caja</span><h2>${waiting?'Un arqueo espera tu aprobación':paused?reconciliation.label(s.stage):s?'Caja abierta':'Caja cerrada'}</h2><p>${s?`Turno #${s.id} · ${esc(s.cashier)} · Desde ${date(s.opened_at)}`:'Sin turno activo. El próximo cajero puede recibir la caja.'}</p></div></div>${s?`<div class="status-amount"><small>Ventas del turno</small><strong>${money(s.total||0)}</strong></div>`:''}${waiting?`<button class="primary" data-shift-detail="${s.id}">Revisar arqueo</button>`:button(s?'Ver turno':'Ver turnos','go-shifts','secondary')}</section>`;
}
function renderDashboard(){
  $('#content').innerHTML=heading('TU NEGOCIO, DE UN VISTAZO','Resumen','Ventas, caja y pendientes para tomar decisiones.',button(`${icon('refresh')} Actualizar`,'refresh','secondary'))+`<div class="report-presets" role="group" aria-label="Período del resumen"><button data-period="today" class="secondary">Hoy</button><button data-period="yesterday" class="secondary">Ayer</button><button data-period="week" class="secondary">Últimos 7 días</button></div><details class="report-custom"><summary>Elegir otras fechas</summary><form id="report-range" class="date-range"><label>Desde<input type="date" name="from" value="${reportData?.from||today()}" required></label><label>Hasta<input type="date" name="to" value="${reportData?.to||today()}" required></label><button class="secondary" type="submit">Ver resumen</button><span class="muted">Hora de Bolivia · Se actualiza cada 15 s</span></form></details><div id="report-body">${reportData?dashboardBody():empty('Cargando resumen…','Un momento, estamos consultando las ventas.','chart')}</div>`;
  if(!reportData)loadReport().then(()=>{if(view==='dashboard')$('#report-body').innerHTML=dashboardBody();}).catch(e=>toast(e.message,true));
  syncReportPresets();
}
function recipeWarning(){return '';}

function dashboardBody(){
  const r=reportData,t=r.totals,max=Math.max(1,...r.hours.map(h=>h.total)),hours=Array.from({length:15},(_,i)=>i+8);
  const low=state.inventory.filter(i=>i.stock<=i.minimum);
  return `<div class="period-caption">Ventas del ${esc(r.from)} al ${esc(r.to)}</div><div class="stats-grid"><article class="stat-card highlight"><span>Ventas totales ${icon('chart')}</span><strong>${money(t.total)}</strong><small>${t.tickets} ventas completadas</small></article><article class="stat-card"><span>Ticket promedio ${icon('receipt')}</span><strong>${money(t.tickets?Math.round(t.total/t.tickets):0)}</strong><small>Promedio por pedido</small></article><article class="stat-card"><span>Efectivo vendido ${icon('cash')}</span><strong>${money(t.cash)}</strong><small>Sin incluir el fondo de caja</small></article><article class="stat-card"><span>Pagos digitales ${icon('qr')}</span><strong>${money(t.qr+t.card)}</strong><small>QR + tarjeta</small></article><button class="stat-card credit-card" data-view="customers"><span>Saldo a favor de clientes ${icon('wallet')}</span><strong>${money(r.credit?.owed||0)}</strong><small>${r.credit?.customers===1?'1 cliente':`${r.credit?.customers||0} clientes`} · lo que el negocio debe${t.credit?` · ${money(t.credit)} usado en el período`:''}</small></button><button class="stat-card" data-view="customers"><span>Cuentas por cobrar</span><strong class="danger-text">${money(r.credit?.receivable||0)}</strong><small>${r.credit?.debtors||0} clientes con deuda · ${money(t.debt||0)} fiado en el período</small></button></div><p class="muted">Abonos y recargas del período: efectivo ${money(r.collections?.cash||0)} · QR ${money(r.collections?.qr||0)} · tarjeta ${money(r.collections?.card||0)}. Cobrar una deuda no suma otra venta.</p>${businessStatus()}${recipeWarning()}<div class="dashboard-grid"><section class="panel chart-panel"><div class="panel-heading"><div><h2>El ritmo de tus ventas</h2><p>Importe acumulado por hora</p></div><span class="legend"><i></i> Ventas</span></div><div class="bar-chart">${hours.map(h=>{const n=r.hours.find(v=>Number(v.hour)===h)?.total||0;return `<div class="bar-column" tabindex="0" role="img" aria-label="${h}:00 a ${h}:59: ${money(n)}"><span class="bar-value">${n?money(n):''}</span><div class="bar" style="height:${n?Math.max(4,n/max*155):3}px" title="${h}:00 · ${money(n)}"></div><small>${h}</small></div>`;}).join('')}</div><p class="chart-caption">${t.tickets?'Horario mostrado: 08:00–22:59. Los totales incluyen todas las horas.':'Tu primera venta le dará vida a este gráfico.'}</p></section><section class="panel"><div class="panel-heading"><div><h2>Los favoritos</h2><p>Productos con más ventas</p></div>${icon('bag')}</div>${r.top.length?`<div class="top-products">${r.top.map((p,i)=>`<div><span class="rank">${i+1}</span><span><b>${esc(p.name)}</b><small>${p.quantity} unidades</small></span><strong>${money(p.total)}</strong></div>`).join('')}</div>`:empty('Aún no hay favoritos','Se mostrarán después de tu primera venta.','bag')}</section><section class="panel"><div class="panel-heading"><div><h2>Tu equipo en acción</h2><p>Ventas por cajero en este período</p></div>${icon('users')}</div>${r.cashiers.length?r.cashiers.map(c=>`<div class="cashier-row"><span class="avatar">${esc(c.name[0])}</span><span><b>${esc(c.name)}</b><small>${c.tickets} pedidos</small></span><strong>${money(c.total)}</strong></div>`).join(''):empty('Listos para empezar','Las ventas del equipo aparecerán aquí.','users')}</section><section class="panel stock-alerts"><div class="panel-heading"><div><h2>Stock que necesita atención</h2><p>${low.length} productos por reponer</p></div><span class="alert-bubble">${icon('box')}</span></div>${low.slice(0,4).map(i=>`<div class="alert-row"><span>${esc(i.name)}</span><b>${i.stock} ${esc(i.unit)}</b></div>`).join('')||'<p class="good-stock">Todo está listo para seguir vendiendo.</p>'}${button('Ver productos '+icon('arrow'),'go-inventory','text-button')}</section></div>`;
}
let inventoryFilter='all';
function productStock(p){const id=p.stock_item_id||(p.recipe?.length===1?p.recipe[0].item_id:null);return [...state.inventory,...(state.archivedInventory||[])].find(i=>i.id===id);}
function stockStatus(p){return p.inventory_mode==='untracked'?'Solo registrar ventas':p.available===0?'Agotado':'Disponible';}
function stockNotice(label){return '<span class="stock-warning">'+icon('alert')+esc(label)+'</span>';}
function renderInventory(){
  if(state.blind){$('#content').innerHTML=heading('','Productos en arqueo','Ingresa las cantidades físicas desde Arqueo.')+pausedNotice();return;}
  const admin=state.user.role==='admin',active=state.products.filter(p=>p.active),tracked=active.filter(p=>p.inventory_mode!=='untracked'),emptyStock=tracked.filter(p=>p.available===0),directIds=new Set(active.filter(p=>p.stock_mode==='unit').map(p=>p.stock_item_id)),extra=state.inventory.filter(i=>!directIds.has(i.id));
  $('#content').innerHTML=heading('','Productos','Cada venta descuenta su stock. Repón las unidades que recibes.',(admin?button(icon('plus')+' Nuevo producto','new-product','primary'):'')+(canRestock()&&state.inventory.length?button(icon('box')+' Reponer','restock','secondary'):''))+
    (reconciliationLocked()?pausedNotice():'')+
    '<div class="inventory-summary"><span><b>'+tracked.length+'</b> con stock</span><span><b>'+(active.length-tracked.length)+'</b> solo ventas</span><span><b>'+emptyStock.length+'</b> agotados</span></div>'+
    '<label class="search-box inventory-search">'+icon('search')+'<input id="inventory-search" type="search" placeholder="Buscar producto o existencia…" aria-label="Buscar producto en inventario"></label><label class="customer-filter-label">Mostrar<select id="inventory-filter"><option value="all">Todos los productos</option><option value="unit">Con control de stock</option><option value="empty">Agotados</option><option value="untracked">Solo registrar ventas</option>'+(admin?'<option value="archived">Archivados</option>':'')+'</select></label><div id="inventory-list" class="inventory-list product-stock-list"></div>'+
    (extra.length?'<details id="extra-stock" class="movement-history"><summary>Existencias compartidas y adicionales · '+extra.length+'</summary><p class="muted">Cada existencia se cuenta una sola vez en el arqueo. Las ventas vinculadas descuentan del mismo saldo.</p><div id="extra-stock-list" class="inventory-list"></div></details>':'')+
    (admin?'<details class="movement-history"><summary>Movimientos de productos</summary>'+state.movements.map(m=>'<div class="movement-card"><div><b>'+esc(m.item)+'</b><small>'+(m.kind==='restock'?'Reposición':m.kind==='waste'?'Baja':m.kind==='count'?'Ajuste de arqueo':'Movimiento')+' · '+date(m.created_at,true)+' · '+esc(m.actor)+'</small></div><strong>'+ (m.quantity>0?'+':'')+m.quantity+'</strong><p>'+esc(m.note)+'</p></div>').join('')+'</details>':'');
  $('#inventory-filter').value=admin||inventoryFilter!=='archived'?inventoryFilter:'all';
  const rows=()=>{const q=$('#inventory-search').value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(),filter=$('#inventory-filter').value;inventoryFilter=filter;
    const matches=name=>name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(q);
    const extraMatches=extra.filter(i=>matches(i.name)&&(filter!=='empty'||i.stock===0)),showExtra=!['archived','untracked'].includes(filter);
    const products=state.products.filter(p=>(filter==='archived'?!p.active:p.active)&&(filter==='unit'?p.inventory_mode!=='untracked':filter==='empty'?p.inventory_mode!=='untracked'&&p.available===0:filter==='untracked'?p.inventory_mode==='untracked':true)&&matches(p.name));
    $('#inventory-list').innerHTML=products.map(p=>{
      const i=productStock(p),counted=p.inventory_mode!=='untracked',direct=p.stock_mode==='unit',label=stockStatus(p),duplicate=admin&&active.filter(v=>v.name.toLowerCase()===p.name.toLowerCase()).length>1;
      return '<article class="inventory-item product-stock-card"><div><b>'+esc(p.name)+'</b><small>'+(p.allow_manual_price?'Precio libre':money(p.price))+' · '+(label==='Agotado'?stockNotice(label):label)+(direct&&i?.pack_size>1?' · Paquete de '+i.pack_size:'')+'</small>'+(counted&&!direct?'<small>Descuenta de '+esc(i?.name||'sus existencias asociadas')+'</small>':'')+(duplicate?'<small class="muted">Nombre repetido · revisa cuál conservar</small>':'')+'</div><strong>'+(counted?(direct?(i?.stock??0)+' ud':p.available+' ventas disponibles'):'Sin conteo')+'</strong><div class="product-stock-actions">'+(p.active&&counted&&i&&canRestock()?'<button class="secondary" data-restock="'+i.id+'" aria-label="Reponer '+esc(p.name)+'">Reponer</button>':'')+(p.active&&counted&&i&&canWaste()?'<button class="icon-button" data-waste="'+i.id+'" aria-label="Registrar merma de '+esc(p.name)+'">'+icon('minus')+'</button>':'')+(admin?'<button class="icon-button" data-edit-product="'+p.id+'" aria-label="Editar '+esc(p.name)+'">'+icon('edit')+'</button>':'')+'</div></article>';
    }).join('')||(q&&showExtra&&extraMatches.length?'':empty('Sin productos en esta vista','Cambia el filtro o revisa las existencias adicionales.','box'));
    if($('#extra-stock-list')){const items=extraMatches;$('#extra-stock').hidden=!showExtra;$('#extra-stock-list').innerHTML=items.map(i=>'<article class="inventory-item product-stock-card"><div><b>'+esc(i.name)+'</b><small>'+(i.stock===0?stockNotice('Agotado'):state.products.some(p=>p.active&&p.recipe?.some(r=>r.item_id===i.id))?'Saldo compartido':'Conteo independiente')+'</small></div><strong>'+stockLabel(i.stock,i.unit)+'</strong><div class="product-stock-actions">'+(canRestock()?'<button class="secondary" data-restock="'+i.id+'" aria-label="Reponer '+esc(i.name)+'">Reponer</button>':'')+(canWaste()?'<button class="icon-button" data-waste="'+i.id+'" aria-label="Registrar merma de '+esc(i.name)+'">'+icon('minus')+'</button>':'')+(admin?'<button class="icon-button" data-edit-inventory="'+i.id+'" aria-label="Editar existencia '+esc(i.name)+'">'+icon('edit')+'</button>':'')+'</div></article>').join('')||'<p class="muted">Sin existencias adicionales en esta búsqueda.</p>';if(q&&items.length&&!products.length)$('#extra-stock').open=true;}
  };
  rows();$('#inventory-search').addEventListener('input',rows);$('#inventory-filter').addEventListener('change',rows);
}
const stockLabel=(quantity,unit)=>unit==='ml'?((quantity/1000).toLocaleString('es-BO',{maximumFractionDigits:3})+' L'):quantity+' '+esc(unit);
const canRestock=()=>!reconciliationLocked()&&(state.user.role==='admin'||state.shift?.user_id===state.user.id);
const canWaste=()=>!reconciliationLocked()&&state.user.role==='admin';

function movementModal(kind,id){
  if(kind==='restock'&&!canRestock()){toast('Para reponer, tu turno debe estar abierto y sin arqueo en curso.',true);return;}
  if(kind==='waste'&&!canWaste()){toast('Solo el propietario puede registrar una merma sin arqueo en curso.',true);return;}
  modal(kind==='restock'?'Registrar reposición':'Registrar una merma',kind==='restock'?'Registra lo que entra físicamente al negocio.':'Registra productos dañados, vencidos o desperdiciados.',`<form id="movement-form"><input type="hidden" name="kind" value="${kind}">${kind==='restock'?`<p class="info-block">Registrado por: <b>${esc(state.user.name)}</b>${state.shift?` · Turno #${state.shift.id}`:''}</p>`:''}<label>Producto<select name="itemId" required>${state.inventory.map(i=>`<option value="${i.id}" ${i.id===id?'selected':''}>${esc(state.products.find(p=>p.stock_item_id===i.id)?.name||i.name)} · ${stockLabel(i.stock,i.unit)}</option>`).join('')}</select></label><label><span id="movement-unit"></span><input name="quantity" type="number" inputmode="decimal" required placeholder="0"></label><label>${kind==='restock'?'Referencia (opcional)':'Motivo de la baja'}<input name="note" ${kind==='restock'?'':'required'} maxlength="300" placeholder="${kind==='restock'?'Ej. entrega del proveedor, factura 125':'Ej. producto vencido'}"></label>${formFooter(kind==='restock'?'Registrar reposición':'Registrar merma')}</form>`);
  const form=$('#movement-form'),select=form.elements.itemId,input=form.elements.quantity;
  const hint=document.createElement('small');hint.className='muted';input.after(hint);
  const update=()=>{const i=state.inventory.find(i=>i.id===Number(select.value)),liquid=i?.unit==='ml',pack=kind==='restock'&&i?.pack_size>1?i.pack_size:0;
    // Items bought by package can only enter as whole packages.
    $('#movement-unit').textContent=pack?`Paquetes completos (de ${pack} ${i.unit})`:liquid?'Cantidad en litros (1 L = 1000 ml)':`Cantidad (${i?.unit||'unidades'})`;
    input.min=liquid&&!pack?'0.001':'1';input.step=liquid&&!pack?'0.001':'1';input.max=pack?String(Math.floor(100000/pack)):liquid?'100':'100000';input.dataset.factor=pack||(liquid?'1000':'1');input.value=pack?'1':'';
    const total=()=>{hint.textContent=pack?`Ingresan ${(Number(input.value)||0)*pack} unidades.`:'';};input.oninput=total;total();};
  select.addEventListener('change',update);update();
}
function editInventory(id){
  const i=[...state.inventory,...(state.archivedInventory||[])].find(i=>i.id===id);if(!i)return;
  modal('Editar existencia',i.active?'Corrige sus datos. Archivar conserva todo su historial.':'Esta existencia está archivada.', '<form id="inventory-edit-form"><input name="id" type="hidden" value="'+i.id+'"><label>Nombre<input name="name" required maxlength="120" value="'+esc(i.name)+'"></label><label>Unidad<input name="unit" required maxlength="20" value="'+esc(i.unit)+'"></label><label>Stock mínimo<input name="minimum" type="number" min="0" max="100000" step="1" required value="'+i.minimum+'"></label><label>Unidades por paquete<input name="packSize" type="number" min="1" max="10000" step="1" required value="'+i.pack_size+'"></label>'+formFooter('Guardar cambios')+'</form><button class="secondary full archive-item-action" data-item-state="inventory" data-item-id="'+i.id+'" data-item-active="'+(i.active?'0':'1')+'">'+(i.active?'Archivar existencia':'Restaurar existencia')+'</button>');
}
function itemStateModal(kind,id,active){
  const item=kind==='products'?state.products.find(p=>p.id===id):[...state.inventory,...(state.archivedInventory||[])].find(i=>i.id===id);if(!item)return;
  const title=active?'Restaurar':'Archivar';
  modal(title+' · '+esc(item.name),active?'Volverá a estar disponible.':'Dejará de aparecer en nuevas operaciones. Su historial se conserva.', '<form id="item-state-form"><input name="id" type="hidden" value="'+id+'"><input name="kind" type="hidden" value="'+kind+'"><input name="active" type="hidden" value="'+(active?'1':'0')+'">'+(kind==='inventory'&&!active?'<p class="info-block">Se archiva entre turnos, sin existencias y sin recetas activas que lo utilicen.</p>':'')+formFooter(title)+'</form>');
}
function inventoryModal(){modal('Nuevo insumo','Productos o ingredientes que cuentas por unidad: panes, paquetes de jamón, vasos…',`<form id="inventory-form"><label>Nombre<input name="name" required maxlength="120" placeholder="Ej. Pulpa de fresa"></label><div class="field-row"><label>Unidad de medida<input name="unit" required maxlength="20" placeholder="Ej. g, ml, ud"></label><label>Alerta de stock mínimo<input name="minimum" type="number" inputmode="decimal" min="0" step="1" value="5" required></label></div><label>Unidades por paquete<input name="packSize" type="number" inputmode="numeric" min="1" max="10000" step="1" value="1" required></label><p class="muted">Si llega en paquetes cerrados (ej. 100 vasos), se repone solo por paquete completo. Deja 1 para reponer de a una unidad.</p><p class="muted">Se crea con existencia cero. Registra una reposición para ingresar stock. Se puede crear con el turno abierto, pero no durante un arqueo.</p>${formFooter('Crear insumo')}</form>`);}
function recipeRow(r={}){return `<div class="recipe-row"><label>Existencia<select name="recipeItem" aria-label="Existencia a descontar" required>${!r.item_id?'<option value="" disabled selected>Elige una existencia…</option>':''}${[...state.inventory,...(state.archivedInventory||[]).filter(i=>i.id===r.item_id)].map(i=>`<option value="${i.id}" ${i.id===r.item_id?'selected':''}>${esc(i.name)} (${esc(i.unit)})${i.active===0?' · archivado':''}</option>`).join('')}</select></label><label>Por venta<input name="recipeQty" type="number" inputmode="decimal" aria-label="Cantidad por producto vendido" min="1" step="1" max="100000" value="${r.quantity||1}" required></label><button type="button" class="icon-button" data-action="remove-recipe" aria-label="Quitar existencia">${icon('close')}</button></div>`;}
function productModal(id){
  const p=state.products.find(v=>v.id===id),stock=p?productStock(p):null,mode=p?.stock_mode||'unit',pricingMode=p?.allow_manual_price?'free':p?.pricing_mode||'unit',basis=p?.weight_basis_grams||100;
  modal(p?'Editar producto':'Nuevo producto','Cada venta descuenta el stock que configures aquí.',
    '<form id="product-form"><input type="hidden" name="id" value="'+(p?.id||'')+'">'+(!p||p.active?'<input name="active" type="hidden" value="on">':'')+'<label>Nombre<input name="name" required maxlength="120" value="'+esc(p?.name||'')+'"></label><div class="field-row"><label>Categoría<select name="category">'+[...new Set([...state.categories,p?.category,'Comida','Bebidas frías','Cafés','Batidos','Escarchas','Bolos','Helados'].filter(Boolean))].map(c=>'<option '+(c===p?.category?'selected':'')+'>'+esc(c)+'</option>').join('')+'</select></label><label id="catalog-price-field"><span id="product-price-label">Precio (Bs)</span><input name="price" type="number" inputmode="decimal" min="0.01" step="0.01" required value="'+(p?p.price/100:'')+'"></label></div><label>Tipo de cobro<select name="pricingMode" id="pricing-mode"><option value="unit" '+(pricingMode==='unit'?'selected':'')+'>Por unidad o porción</option><option value="weight" '+(pricingMode==='weight'?'selected':'')+'>Por peso</option><option value="free" '+(pricingMode==='free'?'selected':'')+'>Precio libre en caja</option></select></label><label id="weight-basis-label">Precio por<select name="weightBasisGrams" id="weight-basis">'+[[100,'100 gramos'],[1000,'1 kilo'],[1,'1 gramo']].map(([v,label])=>'<option value="'+v+'" '+(v===basis?'selected':'')+'>'+label+'</option>').join('')+'</select></label><label>Control del producto<select name="inventoryMode" id="inventory-mode" required>'+('<option value="recipe" '+(mode==='linked'?'selected':'')+'>Descontar de existencias asociadas</option>')+'<option value="unit" '+(mode==='unit'?'selected':'')+'>Contar unidades de este producto</option><option value="untracked" '+(mode==='untracked'?'selected':'')+'>Solo registrar ventas</option></select></label><div id="unit-stock-fields"><div class="field-row"><label>Avisar cuando queden<input name="minimum" type="number" inputmode="numeric" min="0" max="100000" step="1" required value="'+(stock?.minimum??5)+'"></label><label>Unidades por paquete<input name="packSize" type="number" inputmode="numeric" min="1" max="10000" step="1" required value="'+(stock?.pack_size??1)+'"></label></div><p class="muted">Cada venta descuenta una unidad. '+(stock?'Existencia actual: '+stock.stock+' unidades.':'Empieza en cero; usa Reponer para ingresar las unidades que tienes.')+'</p></div><div id="recipe-fields" hidden><p class="info-block">Conserva el stock configurado. Si varios productos usan la misma existencia, todos descuentan del mismo saldo.</p><div id="recipe-rows">'+(p?.recipe?.length?p.recipe:[{}]).map(recipeRow).join('')+'</div>'+button(icon('plus')+' Asociar otra existencia','add-recipe','secondary')+'</div><p id="untracked-note" class="info-block" hidden>Se guarda la venta. No se pide una cantidad de este producto en el arqueo.</p><input name="description" type="hidden" value="'+esc(p?.description||'')+'"><input name="art" type="hidden" value="'+esc(p?.art||'burger')+'">'+formFooter('Guardar producto')+'</form>'+(p?'<button type="button" class="secondary full archive-item-action" data-item-state="products" data-item-id="'+p.id+'" data-item-active="'+(p.active?'0':'1')+'">'+(p.active?'Archivar producto':'Restaurar producto')+'</button>':''),true);
  const sync=()=>{const mode=$('#inventory-mode').value;$('#unit-stock-fields').hidden=mode!=='unit';$('#untracked-note').hidden=mode!=='untracked';$('#recipe-fields').hidden=mode!=='recipe';$('#unit-stock-fields').querySelectorAll('input').forEach(i=>i.disabled=mode!=='unit');$('#recipe-fields').querySelectorAll('input,select,button').forEach(i=>i.disabled=mode!=='recipe');};$('#inventory-mode').addEventListener('change',sync);sync();
  const syncPricing=()=>{const weighted=$('#pricing-mode').value==='weight',free=$('#pricing-mode').value==='free';$('#catalog-price-field').hidden=free;$('#catalog-price-field input').disabled=free;$('#weight-basis-label').hidden=!weighted;$('#weight-basis').disabled=!weighted;$('#product-price-label').textContent=weighted?'Precio por '+weightBasisLabel(Number($('#weight-basis').value))+' (Bs)':'Precio (Bs)';};$('#pricing-mode').addEventListener('change',syncPricing);$('#weight-basis').addEventListener('change',syncPricing);syncPricing();
}

function renderSales(){
  $('#content').innerHTML=heading('EL DETALLE DE CADA PEDIDO','Historial de ventas','Consulta comprobantes, medios de pago y responsables.',button(`${icon('download')} Exportar CSV`,'export-sales','secondary'))+`<div class="section-toolbar"><label class="search-box">${icon('search')}<input id="sale-search" type="search" aria-label="Buscar venta" placeholder="Número o cajero…"></label><span class="muted">${state.sales.length} ventas recientes</span></div><div id="sales-rows" class="phone-list"></div>`;
  salesRows();$('#sale-search').addEventListener('input',e=>salesRows(e.target.value));
}
function salesRows(query=''){const sales=state.sales.filter(s=>`${s.id} ${s.cashier}`.toLowerCase().includes(query.toLowerCase()));$('#sales-rows').innerHTML=sales.map(s=>`<button class="phone-card" data-receipt="${s.id}" aria-label="Ver venta ${s.id}"><div class="phone-card-top"><b>Pedido #${String(s.id).padStart(4,'0')}</b><strong>${money(s.total)}</strong></div><div class="phone-card-meta"><span>${date(s.created_at,true)}</span><span>${esc(s.cashier)}</span></div><div class="phone-card-bottom"><small>${[[s.cash,'Efectivo'],[s.qr,'QR'],[s.card,'Tarjeta'],[s.credit,'Saldo'],[s.debt,'Fiado']].filter(v=>v[0]>0).map(v=>v[1]).join(' + ')}</small><span class="badge ${s.status==='paid'?'green':'red'}">${s.status==='paid'?'Completada':'Anulada'}</span>${icon('chevron')}</div></button>`).join('')||empty('Sin ventas','No hay ventas en esta búsqueda.','bag');}
function renderShifts(){reconciliation.render();}

function renderTeam(){
  $('#content').innerHTML=heading('CADA PERSONA, SU ESPACIO','Tu equipo','Accesos individuales para saber quién realizó cada operación.',button(`${icon('plus')} Agregar persona`,'new-user'))+`<div class="team-grid">${state.users.map(u=>`<article class="panel team-card"><span class="avatar large">${esc(u.name[0])}</span><span class="badge ${u.active?'green':''}">${u.active?'Activo':'Inactivo'}</span><h2>${esc(u.name)}</h2><p>${esc(u.username)}</p><div class="role-label">${icon(u.role==='admin'?'shield':'cash')}${u.role==='admin'?'Propietario':'Cajero'}</div><p class="role-description">${u.role==='admin'?'Resumen del negocio, inventario, equipo y cierres de turno.':'Ventas, comprobantes propios y reposiciones de su turno.'}</p>${u.id!==state.user.id?`<div class="team-actions">${u.role==='cashier'?`<button class="secondary" data-toggle-fiado="${u.id}">${u.can_fiado?'Quitar permiso de fiado':'Permitir fiado'}</button>`:''}<button class="secondary" data-toggle-user="${u.id}">${u.active?'Desactivar':'Activar'}</button><button class="icon-button" data-reset-password="${u.id}" aria-label="Cambiar contraseña de ${esc(u.name)}">${icon('edit')}</button></div>`:'<small class="muted">Tu cuenta actual</small>'}</article>`).join('')}</div>`;
}
function userModal(){modal('Una persona más en el equipo','Cada persona tendrá su propio correo o usuario y contraseña.',`<form id="user-form"><label>Nombre<input name="name" required maxlength="120"></label><label>Correo o usuario<input name="username" autocomplete="username" inputmode="email" autocapitalize="none" spellcheck="false" required maxlength="254" placeholder="Ej. camila@correo.com"></label><label>Contraseña<input name="password" type="password" autocomplete="new-password" minlength="10" maxlength="128" required></label><label>Permisos<select name="role"><option value="cashier">Cajero</option><option value="admin">Propietario</option></select></label><label class="check-label"><input name="canFiado" type="checkbox"> Permitir al vendedor registrar ventas fiadas</label>${formFooter('Crear acceso')}</form>`);}
function exportSales(){
  const cell=value=>`"${String(value).replace(/^[=+@\-\t\r]/,"'$&").replaceAll('"','""')}"`;
  const rows=[['Orden','Fecha UTC','Cajero','Estado','Total Bs','Efectivo Bs','QR Bs','Tarjeta Bs','Saldo a favor Bs','Fiado Bs','Vuelto guardado Bs','Cliente'],...state.sales.map(s=>[s.id,s.created_at,s.cashier,s.status,s.total/100,s.cash/100,s.qr/100,s.card/100,(s.credit||0)/100,(s.debt||0)/100,(s.change_credit||0)/100,state.customers.find(c=>c.id===s.customer_id)?.name||''])];
  const blob=new Blob(['\uFEFF'+rows.map(row=>row.map(cell).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8;'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`flamingo-ventas-recientes-${today()}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast(`Se exportaron ${state.sales.length} ventas recientes.`);
}
document.addEventListener('click',async e=>{
  const el=e.target.closest('button');if(!el||el.disabled)return;
  if(el.closest('form')?.getAttribute('aria-busy')==='true')return;
  try{
    if(el.dataset.themePreference){window.FlamingoTheme.set(el.dataset.themePreference);return;}
    if(await reconciliation.click(el))return;
    if(await customers.click(el))return;
    if(el.dataset.view){view=el.dataset.view;reportData=null;render();window.scrollTo(0,0);return;}
    if(el.dataset.period){
      const base=new Date(today()+'T12:00:00Z');
      const to=el.dataset.period==='yesterday'?new Date(base.getTime()-86400000).toISOString().slice(0,10):today();
      const from=el.dataset.period==='week'?new Date(base.getTime()-6*86400000).toISOString().slice(0,10):to;
      $('#report-range [name=from]').value=from;$('#report-range [name=to]').value=to;
      el.disabled=true;try{await loadReport(from,to);if(view==='dashboard')$('#report-body').innerHTML=dashboardBody();}finally{el.disabled=false;}return;
    }
    if(el.dataset.editPrice){freePriceModal(Number(el.dataset.editPrice),Number(el.dataset.price));return;}
    if(el.dataset.editWeight){weightModal(Number(el.dataset.editWeight),Number(el.dataset.weight));return;}
    if(el.dataset.variantProduct){if(addProduct(Number(el.dataset.variantProduct)))closeModal();return;}
    if(el.dataset.menuGroup){
      const group=visibleGroups[Number(el.dataset.menuGroup)];if(!group)return;
      const p=group.products[0];
      if(p.inventory_mode==='recipe'&&!p.recipe.length){if(state.user.role==='admin')productModal(p.id);return;}
      if(group.products.length>1)chooseVariant(group);else addProduct(p.id);
      return;
    }
    if(el.dataset.category){category=el.dataset.category;document.querySelectorAll('[data-category]').forEach(b=>{b.classList.toggle('active',b.dataset.category===category);b.setAttribute('aria-pressed',b.dataset.category===category);});renderProducts();return;}
    if(el.dataset.product){addProduct(Number(el.dataset.product));return;}
    if(el.dataset.qty){addProduct(Number(el.dataset.qty),Number(el.dataset.delta),Number(el.dataset.weight)||null,Number(el.dataset.price)||null);return;}
    if(el.dataset.service){service=el.dataset.service;renderCart();return;}
    if(el.dataset.payment){payment=el.dataset.payment;document.querySelectorAll('[data-payment]').forEach(b=>{b.classList.toggle('active',b.dataset.payment===payment);b.setAttribute('aria-pressed',String(b.dataset.payment===payment));});paymentFields();return;}
    if(el.dataset.cash){$('#tendered').value=el.dataset.cash;$('#tendered').dispatchEvent(new Event('input'));return;}
    if(el.dataset.restock){movementModal('restock',Number(el.dataset.restock));return;}
    if(el.dataset.waste){movementModal('waste',Number(el.dataset.waste));return;}
    if(el.dataset.editProduct){productModal(Number(el.dataset.editProduct));return;}
    if(el.dataset.receipt){showReceipt(await api(`/sales/${el.dataset.receipt}`));return;}
    if(el.dataset.void){modal('Anular esta venta','Confirma la devolución del dinero. Los productos se reintegrarán al stock; registra una merma si el producto no se puede recuperar.',`<form id="void-form"><input type="hidden" name="id" value="${el.dataset.void}"><label>Motivo de anulación<textarea name="reason" maxlength="300" required></textarea></label><label class="check-label"><input type="checkbox" required> Confirmé la devolución al cliente.</label>${formFooter('Confirmar anulación')}</form>`);return;}

    if(el.dataset.editInventory){editInventory(Number(el.dataset.editInventory));return;}
    if(el.dataset.itemState){itemStateModal(el.dataset.itemState,Number(el.dataset.itemId),el.dataset.itemActive==='1');return;}
    if(el.dataset.toggleFiado){const u=state.users.find(u=>u.id===Number(el.dataset.toggleFiado));await api(`/users/${u.id}`,{canFiado:!u.can_fiado},'PATCH');await refresh();toast('Permiso de fiado actualizado.');return;}
    if(el.dataset.toggleUser){const u=state.users.find(u=>u.id===Number(el.dataset.toggleUser));await api(`/users/${u.id}`,{active:!u.active},'PATCH');await refresh();toast('Acceso actualizado.');return;}
    if(el.dataset.resetPassword){modal('Actualizar contraseña','Las sesiones de esta persona se cerrarán.',`<form id="password-form"><input name="id" type="hidden" value="${el.dataset.resetPassword}"><label>Nueva contraseña<input name="password" type="password" autocomplete="new-password" minlength="10" maxlength="128" required></label>${formFooter('Guardar contraseña')}</form>`);return;}
    const actions={boot,'toggle-password':()=>{const input=$('#login-password'),visible=input.type==='password';input.type=visible?'text':'password';el.textContent=visible?'Ocultar':'Mostrar';el.setAttribute('aria-pressed',String(visible));el.setAttribute('aria-label',visible?'Ocultar contraseña':'Mostrar contraseña');},'google-login':()=>{el.disabled=true;window.location.assign('/api/auth/google/start');}, 'close-modal':()=>{if(canDismissModal())closeModal();},'open-shift':openShift,checkout,'show-cart':showCart,'hide-cart':hideCart,'new-sale':()=>{closeModal();view='pos';render();window.scrollTo(0,0);},'clear-cart':()=>{cart=[];orderNote='';renderProducts();renderCart();},restock:()=>movementModal('restock'),waste:()=>state.user.role==='admin'&&movementModal('waste'),'new-inventory':inventoryModal,'my-password':()=>modal('Cambiar mi contraseña','Tus otros dispositivos tendrán que volver a iniciar sesión.',`<form id="my-password-form"><label>Contraseña actual<input name="current" type="password" autocomplete="current-password" maxlength="128" required></label><label>Nueva contraseña<input name="password" type="password" autocomplete="new-password" minlength="10" maxlength="128" required></label>${formFooter('Guardar contraseña')}</form>`),'new-product':()=>productModal(),'add-recipe':()=>$('#recipe-rows').insertAdjacentHTML('beforeend',recipeRow()),'remove-recipe':()=>el.closest('.recipe-row').remove(),'new-user':userModal,'go-inventory':()=>{view='inventory';render();},'export-sales':exportSales,refresh:async()=>{await refresh();toast('Datos actualizados.');},print:()=>window.print(),logout:()=>modal('Cerrar sesión','La orden sin cobrar se descartará. El turno abierto seguirá disponible para su responsable.',`<div class="modal-actions">${button('Volver','close-modal','secondary')}${button('Cerrar sesión','confirm-logout')}</div>`),'confirm-logout':async()=>{await api('/logout',{});state=null;cart=[];orderNote='';document.querySelector('#order-status').textContent='';reportData=null;view='pos';closeModal();boot();}};
    if(el.dataset.action==='go-recipes'){view='inventory';render();$('#recipe-section').scrollIntoView({block:'start'});return;}
    if(actions[el.dataset.action])await actions[el.dataset.action]();
  }catch(error){toast(error.message,true);}
});
document.addEventListener('submit',async e=>{
  // Named controls (e.g. <input name="id">) can shadow a form's DOM properties.
  const id=e.target.getAttribute('id');if(['login-form'].includes(id)||!id)return;
  e.preventDefault();const form=e.target;
  if(submittingForms.has(form)||uncertainForms.has(form))return;
  submittingForms.add(form);form.setAttribute('aria-busy','true');
  const submit=e.submitter||form.querySelector('button[type="submit"]');if(submit)submit.disabled=true;
  try{
    const f=new FormData(form),v=Object.fromEntries(f);
    if(await reconciliation.submit(id,e.target,v,f))return;
    if(await customers.submit(id,e.target,v,f))return;
    if(id==='free-price-form'){
      const product=state.products.find(p=>p.id===Number(v.id)&&p.active);
      if(!product?.allow_manual_price)throw new Error('El tipo de cobro cambió. Actualiza el pedido.');
      const price=cents(v.unitPrice);if(!(servingPrice(product,null,price)>0))throw new Error('Ingresa un importe válido mayor a cero.');
      const previous=cart,old=Number(v.oldPrice)||null;
      const oldLine=old?cart.find(c=>c.id===product.id&&c.manual_price&&c.price===old):null;
      if(old&&!oldLine)throw new Error('La porción cambió. Vuelve a abrir el pedido.');
      if(oldLine)cart=cart.filter(c=>c!==oldLine);
      if(!addProduct(product.id,oldLine?.quantity||1,null,price)){cart=previous;return;}
      closeModal();return;
    }
    if(id==='weight-form'){
      const product=state.products.find(p=>p.id===Number(v.id)&&p.active);
      if(!product||product.pricing_mode!=='weight')throw new Error('El tipo de cobro cambió. Actualiza el pedido.');
      const weight=Number(v.weightGrams),price=servingPrice(product,weight);
      if(!(price>0))throw new Error('Ingresa un peso válido que produzca un importe mayor a cero.');
      const previous=cart,old=Number(v.oldWeight)||null;
      const oldLine=old?cart.find(c=>c.id===product.id&&c.weight_grams===old):null;
      if(old&&!oldLine)throw new Error('La porción cambió. Vuelve a abrir el pedido.');
      if(oldLine)cart=cart.filter(c=>c!==oldLine);
      if(!addProduct(product.id,oldLine?.quantity||1,weight)){cart=previous;return;}
      closeModal();return;
    }
    if(id==='payment-form'){
      let payload=pendingSale;
      if(!payload){const total=cartTotal();const requestId=Array.from(crypto.getRandomValues(new Uint8Array(24)),n=>n.toString(16).padStart(2,'0')).join('');payload={requestId,items:cart.map(p=>({id:p.id,quantity:p.quantity,...(p.weight_grams?{weightGrams:p.weight_grams}:{}),...(p.manual_price?{unitPrice:p.price}:{})})),cash:payment==='cash'?total:payment==='mixed'?cents(v.cash):0,qr:payment==='qr'?total:payment==='mixed'?cents(v.qr):0,card:payment==='card'?total:payment==='mixed'?cents(v.card):0,credit:payment==='credit'?total:payment==='mixed'?cents(v.credit||0):0,tendered:['cash','mixed'].includes(payment)?cents(v.tendered):0,service,note:orderNote};
        if(payment==='fiado'){
          const c=customers.selected(),paid=cents(v.paidNow),credit=Math.min(Math.max(0,c?.balance||0),Math.max(0,total-paid));
          if(!c)throw new Error('Selecciona un cliente existente. La propietaria debe habilitar su fiado.');
          if(!Number.isSafeInteger(paid)||paid<0||paid>total)throw new Error('Revisa lo que paga ahora.');
          const method=['cash','qr','card'].includes(v.paidMethod)?v.paidMethod:'cash';
          Object.assign(payload,{[method]:paid,credit,debt:total-paid-credit,tendered:method==='cash'?paid:0},customers.salePayload(v));
        }
        // Only sales that use or keep balance are linked to a customer.
        if(payment==='cash'&&f.has('keepChange'))Object.assign(payload,{changeToCredit:true},customers.salePayload(v));
        else if(payload.credit>0)Object.assign(payload,customers.salePayload(v));}
      const persisted=rememberPayment(payload);pendingSale=payload;
      // Freeze payment inputs so an uncertain retry sends the identical idempotent request.
      const controls=[...form.querySelectorAll('input,select,textarea,button')],disabled=controls.map(n=>n.disabled);
      controls.forEach(n=>n.disabled=true);
      let sale;
      try{sale=await api('/sales',payload);}catch(error){if(error.status&&error.status>=400&&error.status<500&&error.status!==401){forgetPayment();controls.forEach((n,index)=>n.disabled=disabled[index]);}else {if(submit)submit.textContent='Reintentar el mismo cobro';if(!persisted)error.message+=' Mantén esta ventana abierta para reintentar este cobro.';}throw error;}
      forgetPayment();cart=[];orderNote='';document.querySelector('#order-status').textContent='Venta registrada. Pedido vacío.';closeModal();try{await refresh();}catch{toast('Venta guardada. No pudimos actualizar el inventario en pantalla.',true);}showReceipt(sale);return;
    }
    else if(id==='movement-form')await api('/movements',{...v,note:v.note?.trim()||(v.kind==='restock'?'Reposición de productos':''),itemId:Number(v.itemId),quantity:Math.round(Number(v.quantity)*Number(e.target.elements.quantity.dataset.factor))});
    else if(id==='inventory-edit-form')await api(`/inventory/${v.id}`,{name:v.name,unit:v.unit,minimum:Number(v.minimum),packSize:Number(v.packSize)},'PATCH');
    else if(id==='item-state-form')await api(`/${v.kind}/${v.id}`,{active:v.active==='1'},'PATCH');
    else if(id==='inventory-form')await api('/inventory',{...v,minimum:Number(v.minimum),packSize:Number(v.packSize)});
    else if(id==='product-form')await api('/products',{...v,id:v.id?Number(v.id):undefined,...(v.price!==undefined?{price:cents(v.price)}:{}),pricingMode:v.pricingMode||'unit',weightBasisGrams:Number(v.weightBasisGrams||100),active:f.has('active'),...(v.inventoryMode==='unit'?{minimum:Number(v.minimum??5),packSize:Number(v.packSize??1)}:{}),recipe:['unit','untracked'].includes(v.inventoryMode)?[]:[...e.target.querySelectorAll('.recipe-row')].map(row=>({item_id:Number(row.querySelector('select').value),quantity:Number(row.querySelector('input').value)}))});

    else if(id==='user-form')await api('/users',{...v,canFiado:f.has('canFiado')});
    else if(id==='my-password-form')await api('/me/password',{current:v.current,password:v.password});
    else if(id==='password-form')await api(`/users/${v.id}`,{password:v.password},'PATCH');
    else if(id==='void-form')await api(`/sales/${v.id}/void`,{reason:v.reason});
    else if(id==='report-range'){await loadReport(v.from,v.to);if(view==='dashboard'&&$('#report-body'))$('#report-body').innerHTML=dashboardBody();return;}
    else return;
    closeModal();try{await refresh();toast('Guardado correctamente.');}catch{toast('Guardado correctamente. No pudimos actualizar la pantalla; usa Actualizar o vuelve a entrar.',true);}
  }catch(error){
    if(['movement-form','inventory-form','user-form','customer-form'].includes(id)&&(!error.status||error.status<400||error.status>=500)){
      uncertainForms.add(form);
      error.message+=' La operación podría haberse guardado. Cierra esta ventana y verifica el inventario, el equipo o los clientes antes de registrarla otra vez.';
      if(submit)submit.textContent='Verifica el resultado antes de repetir';
    }
    formError(error);
  }finally{submittingForms.delete(form);form.removeAttribute('aria-busy');if(submit)submit.disabled=uncertainForms.has(form);}
});
document.addEventListener('keydown',e=>{if(e.key==='/'&&view==='pos'&&!$('dialog[open]')&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)){e.preventDefault();$('#product-search')?.focus();}});
function renderLiveContent(){
  const root=$('#content');
  const searches=[...root.querySelectorAll('input[type="search"]')].map(i=>({id:i.id,value:i.value}));
  const openDetails=[...root.querySelectorAll('details[open]')].map(d=>d.querySelector('summary')?.textContent);
  const pendingOnly=$('#recipe-pending')?.getAttribute('aria-pressed')==='true';
  renderContent();
  for(const {id,value} of searches){const input=$('#'+id);if(input){input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));}}
  if(pendingOnly)$('#recipe-pending')?.click();
  for(const detail of root.querySelectorAll('details'))if(openDetails.includes(detail.querySelector('summary')?.textContent))detail.open=true;
}
// Keep every connected device current. Closed dialogs do not block polling.
setInterval(async()=>{
  if(!state||document.hidden||$('dialog[open]')||refreshing)return;
  refreshing=true;
  try{
    const previous=state,currentView=view,currentUser=state.user.id;
    const next=await api('/state');
    // A user may open a form or navigate while this request is in flight.
    if(!state||state.user.id!==currentUser||view!==currentView||document.hidden||$('dialog[open]'))return;
    if(view!=='pos'&&['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName))return;
    const changed=JSON.stringify(previous)!==JSON.stringify(next);
    state=next;syncCartWithCatalog();
    if(view==='dashboard'){
      await loadReport(reportData?.from,reportData?.to);
      if(state?.user.id===currentUser&&view===currentView&&!$('dialog[open]')&&$('#report-body'))$('#report-body').innerHTML=dashboardBody();
    }else if(view==='pos'){
      if(previous.shift?.stage!==state.shift?.stage||previous.shift?.id!==state.shift?.id||previous.shift?.user_id!==state.shift?.user_id)renderPOS();
      else if(JSON.stringify(previous.products)!==JSON.stringify(state.products)){renderProducts();renderCart();}
    }else if(changed)renderLiveContent();
    document.querySelectorAll('.connection').forEach(e=>{e.classList.remove('offline');e.innerHTML='<i></i><span>Conectado</span>';});
  }
  catch{document.querySelectorAll('.connection').forEach(e=>{e.classList.add('offline');e.innerHTML='<i></i><span>Sin conexión</span>';});}finally{refreshing=false;}
},15000);
const customers=createCustomersUI({getState:()=>state,api,modal,closeModal,refresh,toast,icon,esc,money,date,button,heading,empty,formFooter,cents});
const reconciliation=createReconciliationUI({getState:()=>state,api,modal,closeModal,refresh,toast,icon,esc,money,date,button,heading,empty,formFooter,goShifts:()=>{view='shifts';render();}});
boot();
