// Views and forms for the worker declaration / owner approval workflow.
export function createReconciliationUI(ctx) {
  const {api,modal,closeModal,refresh,toast,icon,esc,money,date,button,heading,empty,formFooter}=ctx;
  const $=s=>document.querySelector(s);
  const label=stage=>({open:'Turno abierto',counting:'Conteo en curso',review:'Pendiente de revisión',recount:'Reconteo solicitado',closed:'Arqueo aprobado'})[stage]||stage;
  const badge=stage=>`<span class="badge ${stage==='review'||stage==='recount'?'amber':stage==='closed'?'green':''}">${label(stage)}</span>`;
  const delta=(n,cash=false)=>`<span class="${n?'danger-text':'success-text'}">${n>0?'+':''}${cash?money(n):n}</span>`;
  const key=(s)=>`flamingo-count-units-v2-${ctx.getState().demo?'demo':'live'}-${ctx.getState().user.id}-${s.id}-${s.count_version}`;
  const quantity=(value,unit)=>unit==='ml'?`${(value/1000).toLocaleString('es-BO',{maximumFractionDigits:3})} L`:`${value} ${esc(unit)}`;
  const requestId=()=>Array.from(crypto.getRandomValues(new Uint8Array(24)),v=>v.toString(16).padStart(2,'0')).join('');
  const steps=stage=>`<ol class="reconcile-steps" aria-label="Proceso del arqueo">${['Turno abierto','Conteo del trabajador','Revisión del propietario','Aprobado'].map((name,i)=>{
    const current=stage==='closed'?3:stage==='review'?2:stage==='open'?0:1;
    return `<li class="${i<current?'done':i===current?'current':''}" ${i===current?'aria-current="step"':''}><span>${i<current?icon('check'):i+1}</span><b>${name}</b></li>`;
  }).join('')}</ol>`;
  function actions(s) {
    const user=ctx.getState().user;
    if(s.stage==='open'&&(user.id===s.user_id||user.role==='admin'))return button('Iniciar arqueo '+icon('arrow'),'start-count');
    if(['counting','recount'].includes(s.stage)&&user.id===s.user_id)return button(s.stage==='recount'?'Realizar reconteo':'Ingresar mi conteo','fill-count');
    return '';
  }
  async function openShift() {
    await refresh();const state=ctx.getState();
    if(state.shift)throw new Error('Ya existe un turno activo. Actualizamos la pantalla.');
    modal('Recibir caja y abrir turno','Revisa las existencias que recibes. Si no coinciden, solicita al propietario que resuelva la entrega antes de aceptarla.',`<form id="open-shift-form"><div class="info-block">${icon('users')} Responsable: <b>${esc(state.user.name)}</b></div><label>Fondo de caja recibido (Bs)<input name="openingCash" type="number" inputmode="decimal" min="0" max="1000000" step="0.01" required placeholder="0.00"></label><details class="count-history" open><summary>Inventario que recibes · ${state.inventory.length} insumos</summary><div class="opening-stock">${state.inventory.map(i=>`<div><span>${esc(i.name)}</span><b>${quantity(i.stock,i.unit)}</b><input type="hidden" name="opening-${i.id}" value="${i.stock}"></div>`).join('')}</div></details><label class="check-label"><input name="confirmed" type="checkbox" required> Revisé y confirmo el inventario y el fondo que recibo.</label>${formFooter('Confirmar recepción y abrir turno')}</form>`,true);
  }
  function startModal() {
    const s=ctx.getState().shift;
    modal('Preparar el arqueo',`Turno #${s.id} · Responsable: ${esc(s.cashier)}`,`<form id="start-count-form"><input name="shiftId" type="hidden" value="${s.id}"><div class="info-block">${icon('clock')} Se pausarán los cobros, reposiciones, mermas y anulaciones en todos los dispositivos hasta aprobar el arqueo.</div><p class="reconcile-copy">Finaliza los pedidos pendientes. El sistema guardará su saldo esperado y <b>${esc(s.cashier)}</b> declarará lo que encuentre físicamente. Enviar el conteo todavía no ajusta el inventario.</p><label class="check-label"><input type="checkbox" required> Terminamos las operaciones y podemos empezar a contar.</label>${formFooter('Pausar operaciones e iniciar')}</form>`);
  }
  async function countModal() {
    const s=await api(`/shifts/${ctx.getState().shift.id}`);
    if(!['counting','recount'].includes(s.stage)||s.user_id!==ctx.getState().user.id)throw new Error('El turno cambió o no eres su responsable. Actualiza la pantalla.');
    let draft={};try{draft=JSON.parse(localStorage.getItem(key(s))||'{}');}catch{}
    const request=s.requests.find(r=>r.version===s.count_version);
    modal(s.stage==='recount'?`Reconteo · versión ${s.count_version}`:'Mi conteo de cierre','Cuenta lo que hay físicamente. Escribe 0 cuando no queden unidades.',`<form id="declare-count-form"><input type="hidden" name="shiftId" value="${s.id}"><input type="hidden" name="version" value="${s.count_version}"><input type="hidden" name="requestId" value="${esc(draft.requestId||requestId())}">${request?`<div class="recount-reason"><b>Solicitud de ${esc(request.requester)}</b><p>${esc(request.reason)}</p></div>`:''}<div class="count-tools"><div class="count-progress-head"><h3>Productos e insumos</h3><span id="count-progress" aria-live="polite"></span></div><progress id="count-meter" max="${s.items.length}" value="0" aria-label="Insumos contados"></progress><div class="count-filters"><label class="search-box">${icon('search')}<input id="count-search" type="search" aria-label="Buscar insumo para contar" placeholder="Buscar insumo…" autocomplete="off"></label><button type="button" class="secondary" id="count-pending" aria-pressed="false">Solo pendientes</button></div></div><div class="count-list declaration-list">${s.items.map((i,n)=>`<label class="count-row" data-count-name="${esc(i.name)}"><span class="count-index" aria-hidden="true">${n+1}</span><span><b>${esc(i.name)}</b><small>${i.unit==='ml'?'Litros · 1 L = 1000 ml':esc(i.unit)}</small></span><input name="count-${i.item_id}" data-count-item="${i.item_id}" data-count-factor="${i.unit==='ml'?1000:1}" aria-label="Conteo de ${esc(i.name)}" type="number" min="0" max="${i.unit==='ml'?100000:100000000}" step="${i.unit==='ml'?0.001:1}" inputmode="${i.unit==='ml'?'decimal':'numeric'}" enterkeyhint="next" required placeholder="—" value="${esc(draft[`count-${i.item_id}`]??'')}"></label>`).join('')}</div><p id="count-empty" class="muted" hidden>No hay insumos en esta vista. Cambia la búsqueda o muestra todos.</p><div class="count-cash"><label>Efectivo contado (Bs)<input name="countedCash" type="number" min="0" step="0.01" inputmode="decimal" required placeholder="0.00" value="${esc(draft.countedCash??'')}"></label><p>Cuenta billetes y monedas, incluido el fondo recibido. Excluye QR y tarjeta.</p></div><label>${s.stage==='recount'?'Explicación del reconteo':'Observaciones (opcional)'}<textarea name="notes" rows="2" maxlength="500" ${s.stage==='recount'?'required':''} placeholder="Anota cualquier incidencia del turno">${esc(draft.notes||'')}</textarea></label><label class="check-label"><input type="checkbox" name="confirmed" required> Confirmo que conté físicamente estas cantidades.</label><p class="muted">El envío queda registrado. Para corregirlo, el propietario debe solicitar un reconteo.</p><div class="count-footer"><span id="count-save-status" class="muted"></span><button type="button" class="secondary full" id="next-count">Siguiente pendiente ${icon('arrow')}</button>${formFooter('Enviar conteo')}</div></form>`,true);
    $('dialog').classList.add('count-modal');
    const form=$('#declare-count-form');
    const inputs=[...form.querySelectorAll('[data-count-item]')];
    let pendingOnly=false;
    const valid=i=>i.value!==''&&i.validity.valid;
    const normalize=v=>v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    const filter=()=>{
      const query=normalize($('#count-search').value);
      inputs.forEach(i=>{i.closest('.count-row').hidden=!normalize(i.closest('.count-row').dataset.countName).includes(query)||(pendingOnly&&valid(i)&&i!==document.activeElement);});
      $('#count-empty').hidden=inputs.some(i=>!i.closest('.count-row').hidden);
    };
    const persist=()=>{
      const fields=Object.fromEntries(new FormData(form));delete fields.confirmed;
      try{localStorage.setItem(key(s),JSON.stringify(fields));$('#count-save-status').textContent='Borrador guardado en este dispositivo';}catch{$('#count-save-status').textContent='No se pudo guardar el borrador. Mantén esta ventana abierta.';}
      const done=inputs.filter(valid).length;
      $('#count-progress').textContent=`${done} / ${inputs.length} contados`;
      $('#count-meter').value=done;
      $('#next-count').innerHTML=done===inputs.length?`Revisar efectivo ${icon('arrow')}`:`Siguiente pendiente · ${inputs.length-done} ${icon('arrow')}`;
      inputs.forEach(i=>i.closest('.count-row').classList.toggle('is-counted',valid(i)));
    };
    const showInput=i=>{if(i.matches('[data-count-item]')){$('#count-search').value='';i.closest('.count-row').hidden=false;}i.focus();i.scrollIntoView({block:'center',behavior:'instant'});i.select?.();};
    $('#count-search').addEventListener('input',filter);
    $('#count-pending').addEventListener('click',e=>{pendingOnly=!pendingOnly;e.currentTarget.setAttribute('aria-pressed',pendingOnly);e.currentTarget.textContent=pendingOnly?'Mostrar todos':'Solo pendientes';filter();});
    $('#next-count').addEventListener('click',()=>{const next=inputs.find(i=>!valid(i));showInput(next||form.elements.countedCash);});
    form.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.matches('[data-count-item]')){e.preventDefault();if(!valid(e.target)){e.target.reportValidity();return;}const index=inputs.indexOf(e.target);const next=inputs.slice(index+1).find(i=>!valid(i))||inputs.find(i=>!valid(i));showInput(next||form.elements.countedCash);}});
    // Native constraint validation must be able to focus fields hidden by search.
    form.addEventListener('invalid',e=>{if(e.target.matches('[data-count-item]')){pendingOnly=false;$('#count-search').value='';$('#count-pending').textContent='Solo pendientes';$('#count-pending').setAttribute('aria-pressed','false');inputs.forEach(i=>i.closest('.count-row').hidden=false);}},true);
    form.addEventListener('input',e=>{if(e.target.id!=='count-search')persist();});
    form.addEventListener('focusout',()=>queueMicrotask(()=>{if(document.contains(form))filter();}));
    persist();
  }
  function comparison(s,d) {
    const cashDifference=d.counted_cash-s.baseline.expected_cash;
    const differences=s.items.filter(i=>d.items.find(c=>c.item_id===i.item_id)?.quantity!==i.expected).length;
    const row=i=>{const qty=d.items.find(c=>c.item_id===i.item_id).quantity;return `<div class="compare-item ${qty!==i.expected?'difference-row':''}"><div class="compare-name"><b>${esc(i.name)}</b><small>${esc(i.unit)} · Inicio: ${quantity(i.opening,i.unit)}</small></div><div><small>Sistema</small><b>${quantity(i.expected,i.unit)}</b></div><div><small>Trabajador</small><b>${quantity(qty,i.unit)}</b></div><div><small>Diferencia</small><b>${i.unit==='ml'?`<span class="${qty!==i.expected?'danger-text':'success-text'}">${quantity(qty-i.expected,i.unit)}</span>`:delta(qty-i.expected)}</b></div></div>`;};
    const changed=s.items.filter(i=>d.items.find(c=>c.item_id===i.item_id).quantity!==i.expected),matched=s.items.filter(i=>!changed.includes(i));
    return `<div class="reconcile-metrics"><div><small>Efectivo según sistema</small><strong>${money(s.baseline.expected_cash)}</strong></div><div><small>Declarado por trabajador</small><strong>${money(d.counted_cash)}</strong></div><div class="${cashDifference?'has-difference':''}"><small>Diferencia de caja</small><strong>${delta(cashDifference,true)}</strong></div></div><div class="section-toolbar"><h3>${differences?'Revisa estas diferencias':'Todos los productos coinciden'}</h3><span class="badge ${differences?'amber':'green'}">${differences} con diferencia</span></div><div class="compare-list">${changed.map(row).join('')}</div>${matched.length?`<details class="count-history"><summary>Ver ${matched.length} insumos sin diferencias</summary><div class="compare-list">${matched.map(row).join('')}</div></details>`:''}`;
  }
  function history(s) {
    return `<div class="reconcile-history"><h3>Declaraciones conservadas</h3>${s.declarations.map(d=>{
      const request=s.requests.find(r=>r.version===d.version);
      return `<details class="count-history"><summary><span>Versión ${d.version} · ${esc(d.author)}</span><small>${date(d.created_at,true)}</small></summary>${request?`<div class="recount-reason"><b>Reconteo solicitado por ${esc(request.requester)} · ${date(request.created_at,true)}</b><p>${esc(request.reason)}</p></div>`:''}<p><b>Efectivo declarado: ${money(d.counted_cash)}</b></p><p class="reconcile-copy">${esc(d.notes||'Sin observaciones del trabajador.')}</p><div class="declared-list">${s.items.map(i=>{const value=d.items.find(c=>c.item_id===i.item_id)?.quantity;return `<div class="declared-item"><span>${esc(i.name)}</span><b>${value===undefined?'—':quantity(value,i.unit)}</b></div>`;}).join('')}</div></details>`;
    }).join('')||'<p class="muted">El trabajador todavía no envió una declaración.</p>'}</div>`;
  }
  function body(s) {
    const owner=ctx.getState().user.role==='admin',latest=s.declarations[0],request=s.requests.find(r=>r.version===s.count_version);
    if(!s.items.length){
      if(!s.closed_at)return '<p class="muted">El saldo del sistema se fijará al iniciar el conteo.</p>';
      if(!owner)return '<p class="muted">Cierre anterior al flujo de declaraciones independientes.</p>';
      return `<p class="info-block">Arqueo histórico, anterior al flujo de declaraciones independientes.</p><div class="close-cash"><div><span>Efectivo esperado / contado</span><strong>${money(s.expected_cash)} / ${money(s.counted_cash)}</strong></div></div><p class="reconcile-copy">${esc(s.notes||'Sin observaciones.')}</p><div class="table-scroll"><table><thead><tr><th>Insumo</th><th>Esperado</th><th>Contado</th><th>Diferencia</th></tr></thead><tbody>${s.counts.map(c=>`<tr><td>${esc(c.name)}</td><td>${c.expected}</td><td>${c.counted}</td><td>${delta(c.difference)}</td></tr>`).join('')}</tbody></table></div>`;
    }
    return `${s.stage==='closed'?`<div class="approval-note">${icon('check')}<div><b>Arqueo aprobado${owner?` por ${esc(s.baseline.approver)}`:''}</b><p>${date(s.closed_at,true)}${owner?` · ${esc(s.baseline.approval_notes||'Sin diferencias.')}`:''}</p></div></div>`:`<div class="reconcile-notice">${icon('clock')}<div><b>Operaciones pausadas</b><p>${s.stage==='review'?'La declaración está enviada. Falta la revisión del propietario.':`Esperando el conteo físico de ${esc(s.cashier)}.`} El stock aún no se ha ajustado.</p></div></div>`}${request&&s.stage==='recount'?`<div class="recount-reason"><b>Reconteo solicitado · versión ${s.count_version}</b><p>${esc(request.reason)}</p><small>${esc(request.requester)} · ${date(request.created_at,true)}</small></div>`:''}${latest?`<div class="section-toolbar"><div><h2>${owner?'Sistema y trabajador':'Mi declaración enviada'}</h2><p class="muted">Versión ${latest.version} · ${esc(latest.author)} · ${date(latest.created_at,true)}</p></div>${badge(s.stage)}</div>${owner?comparison(s,latest):`<p class="info-block">Efectivo declarado: <b>${money(latest.counted_cash)}</b>. Las cantidades se conservan en el historial.</p>`}<div class="worker-notes"><small>OBSERVACIONES DEL TRABAJADOR</small><p>${esc(latest.notes||'Sin observaciones.')}</p></div>${owner&&s.stage==='review'?`<div class="review-actions"><p>Revisa las diferencias antes de aprobar. No se generan ventas ni deudas del trabajador.</p><div><button class="secondary" data-recount="${s.id}" data-declaration="${latest.id}">${icon('refresh')} Solicitar reconteo</button><button class="primary" data-approve="${s.id}" data-declaration="${latest.id}">${icon('check')} Revisar y aprobar</button></div></div>`:''}`:empty('Esperando la declaración',`El responsable ${esc(s.cashier)} debe ingresar el conteo desde su sesión.`,'box')}${history(s)}`;
  }
  function render() {
    const state=ctx.getState(),s=state.shift,owner=state.user.role==='admin';
    $('#content').innerHTML=heading('DOS REGISTROS. UN CIERRE CLARO.','Turnos y arqueos','El trabajador declara. El propietario compara y aprueba.',!s?button(`${icon('plus')} Abrir turno`,'open-shift'):'')+
      `${s?`${steps(s.stage)}<section class="active-shift"><div>${badge(s.stage)}<h2>Turno #${String(s.id).padStart(3,'0')} · ${esc(s.cashier)}</h2><p>Abierto ${date(s.opened_at,true)}</p></div>${!state.blind?`<div class="shift-stat"><span>Fondo recibido</span><b>${money(s.opening_cash)}</b></div><div class="shift-stat"><span>Ventas del turno</span><b>${money(s.total||0)}</b></div>`:'<p class="muted">Conteo independiente: ingresa las cantidades que encuentras físicamente.</p>'}${actions(s)}</section>${s.stage!=='open'?'<section id="reconciliation-detail" class="panel reconciliation-panel" aria-live="polite"><p class="muted">Cargando arqueo…</p></section>':''}`:empty('Listos para un nuevo turno','El próximo responsable confirmará el inventario recibido y su fondo de caja.','clock')}<div class="logic-note">${icon('shield')}<div><b>Declarar no es ajustar el inventario</b><p>El saldo del sistema queda fijo al iniciar el conteo. Las declaraciones y los reconteos se conservan; solo la aprobación del propietario ajusta las existencias y cierra el turno.</p></div></div><div class="section-toolbar"><h2>Historial de turnos</h2></div><div class="phone-list">${state.shifts.map(v=>`<article class="phone-card"><div class="phone-card-top"><b>Turno #${String(v.id).padStart(3,'0')} · ${esc(v.cashier)}</b>${badge(v.stage)}</div><p class="phone-card-meta">${date(v.opened_at,true)}</p><div class="phone-card-bottom"><span>Ventas <b>${state.blind&&v.id===s?.id?'—':money(v.total||0)}</b>${v.closed_at?`<small>Diferencia de caja: ${delta(v.cash_difference,true)}</small>`:''}</span>${v.stage!=='open'?`<button class="secondary" data-shift-detail="${v.id}" aria-label="Ver arqueo ${v.id}">Ver arqueo ${icon('chevron')}</button>`:''}</div></article>`).join('')||'<p class="muted">Tu historial comenzará con el primer turno.</p>'}</div>`;
    if(s&&s.stage!=='open'){
      const userId=state.user.id;
      api(`/shifts/${s.id}`).then(d=>{if($('#reconciliation-detail')&&ctx.getState().user.id===userId&&ctx.getState().shift?.id===d.id)$('#reconciliation-detail').innerHTML=body(d);}).catch(e=>{if($('#reconciliation-detail'))$('#reconciliation-detail').textContent=e.message;});
    }
  }
  async function detail(id) {
    const s=await api(`/shifts/${id}`);
    modal(`Arqueo #${s.id}`,`${esc(s.cashier)} · ${label(s.stage)}`,body(s),true);
  }
  async function click(el) {
    if(el.dataset.action==='start-count'){startModal();return true;}
    if(el.dataset.action==='fill-count'){await countModal();return true;}
    if(el.dataset.action==='go-shifts'){ctx.goShifts();return true;}
    if(el.dataset.shiftDetail){await detail(Number(el.dataset.shiftDetail));return true;}
    if(el.dataset.recount){
      modal('Solicitar un nuevo conteo','La declaración anterior se conservará. El trabajador enviará una nueva versión sin ver el saldo esperado.',`<form id="recount-form"><input type="hidden" name="shiftId" value="${el.dataset.recount}"><input type="hidden" name="declarationId" value="${el.dataset.declaration}"><label>Qué debe revisar el trabajador<textarea name="reason" rows="3" maxlength="500" required placeholder="Ej. volver a contar las bebidas de la nevera"></textarea></label><p class="muted">Evita indicar cantidades esperadas si quieres mantener el conteo independiente.</p>${formFooter('Pedir reconteo')}</form>`);return true;
    }
    if(el.dataset.approve){
      const s=await api(`/shifts/${el.dataset.approve}`),d=s.declarations[0];
      if(s.stage!=='review'||d.id!==Number(el.dataset.declaration))throw new Error('El arqueo cambió. Revisa la última declaración.');
      const n=s.items.filter(i=>d.items.find(c=>c.item_id===i.item_id).quantity!==i.expected).length,cash=d.counted_cash-s.baseline.expected_cash;
      modal('Aprobar arqueo y cerrar turno',`Declaración de ${esc(d.author)} · versión ${d.version}`,`<form id="approve-count-form"><input type="hidden" name="shiftId" value="${s.id}"><input type="hidden" name="declarationId" value="${d.id}"><div class="approval-summary"><p><b>${n}</b> insumos con diferencia</p><p>Diferencia de efectivo: <b>${delta(cash,true)}</b></p></div><label>${n||cash?'Explicación de las diferencias':'Observaciones de aprobación'}<textarea name="notes" rows="3" maxlength="500" ${n||cash?'required':''} placeholder="${n||cash?'Explica qué se revisó y por qué se acepta el resultado':'Opcional'}"></textarea></label><label class="check-label"><input type="checkbox" required> Revisé la declaración y autorizo ajustar el stock a estas cantidades.</label><p class="muted">El turno se cerrará. El sistema conservará su saldo esperado y todas las declaraciones anteriores.</p>${formFooter('Aprobar y cerrar turno')}</form>`);return true;
    }
    return false;
  }
  async function submit(id,form,v,f) {
    if(!['open-shift-form','start-count-form','declare-count-form','recount-form','approve-count-form'].includes(id))return false;
    let message='Guardado correctamente.';
    if(id==='open-shift-form')await api('/shifts/open',{openingCash:Math.round(Number(v.openingCash)*100),confirmed:f.has('confirmed'),openingStock:[...form.querySelectorAll('[name^="opening-"]')].map(i=>({id:Number(i.name.slice(8)),quantity:Number(i.value)}))});
    if(id==='start-count-form'){await api('/shifts/count/start',{shiftId:Number(v.shiftId)});message='Arqueo iniciado. Operaciones pausadas.';}
    if(id==='declare-count-form'){
      await api('/shifts/count/submit',{shiftId:Number(v.shiftId),version:Number(v.version),requestId:v.requestId,countedCash:Math.round(Number(v.countedCash)*100),notes:v.notes,counts:[...form.querySelectorAll('[data-count-item]')].map(i=>({id:Number(i.dataset.countItem),quantity:Math.round(Number(i.value)*Number(i.dataset.countFactor))}))});
      try{localStorage.removeItem(key({id:Number(v.shiftId),count_version:Number(v.version)}));}catch{}
      message='Declaración enviada. Pendiente de aprobación; el stock no se ha ajustado.';
    }
    if(id==='recount-form'){await api('/shifts/count/recount',{shiftId:Number(v.shiftId),declarationId:Number(v.declarationId),reason:v.reason});message='Reconteo solicitado. La versión anterior se conserva.';}
    if(id==='approve-count-form'){await api('/shifts/count/approve',{shiftId:Number(v.shiftId),declarationId:Number(v.declarationId),notes:v.notes});message='Arqueo aprobado. Stock actualizado y turno cerrado.';}
    closeModal();await refresh();toast(message);
    if(id==='start-count-form'&&ctx.getState().shift?.user_id===ctx.getState().user.id)await countModal();
    return true;
  }
  return {render,openShift,click,submit,label};
}
