// Customer accounts: prepaid credit, fiado and repayments with an immutable history.
export function createCustomersUI(ctx) {
  const {api,modal,closeModal,refresh,toast,icon,esc,money,date,button,heading,empty,formFooter,cents}=ctx;
  const $=s=>document.querySelector(s);
  const state=()=>ctx.getState();
  const admin=()=>state().user.role==='admin';
  const requestId=()=>Array.from(crypto.getRandomValues(new Uint8Array(24)),v=>v.toString(16).padStart(2,'0')).join('');
  const norm=v=>String(v||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
  const signed=v=>`${v>0?'+':v<0?'−':''}${money(Math.abs(v))}`;
  const balanceLabel=v=>v<0?'Debe '+money(-v):v>0?'A favor '+money(v):'Sin deuda';
  const kinds={debt:'Compra fiada',payment:'Abono recibido',opening_debt:'Deuda anterior',reversal:'Abono anulado',deposit:'Recarga',change:'Vuelto guardado',sale:'Pago con saldo',void:'Anulación de venta',refund:'Devolución',adjust:'Ajuste'};
  const methods={cash:'efectivo',qr:'QR',card:'tarjeta',none:''};
  let pendingCredit=null,showInactive=false;
  const pendingKey=()=>`flamingo-credit-pending-${state().demo?'demo':'live'}-${state().user.id}`;
  function rememberCredit(operation){pendingCredit=operation;try{localStorage.setItem(pendingKey(),JSON.stringify(operation));return true;}catch{return false;}}
  function forgetCredit(){try{localStorage.removeItem(pendingKey());}catch{}pendingCredit=null;}
  function recover(){
    try{pendingCredit=JSON.parse(localStorage.getItem(pendingKey())||'null');}catch{pendingCredit=null;}
    if(!pendingCredit)return;
    modal('Confirmar saldo pendiente','Se conservaron los datos de la operación para comprobarla sin duplicar el saldo.',`<form id="credit-form">${formFooter('Verificar la misma operación')}</form>`);
  }

  // Shared by the payment form: choose an existing customer or create one in the same sale.
  function picker(label='Cliente',allowNew=true) {
    const customers=state().customers.filter(c=>c.active);
    return `<label>${label}<select name="customerId" id="customer-select"><option value="">Elegir cliente…</option>${customers.map(c=>`<option value="${c.id}">${esc(c.name)} · ${balanceLabel(c.balance)}</option>`).join('')}${allowNew?'<option value="new">+ Nuevo cliente</option>':''}</select></label><div id="new-customer-fields" class="field-row" hidden><label>Nombre del cliente<input name="newCustomerName" maxlength="80" autocomplete="off"></label><label>Teléfono (opcional)<input name="newCustomerPhone" inputmode="tel" maxlength="30" autocomplete="off"></label></div>`;
  }
  function bindPicker(onChange=()=>{}) {
    const select=$('#customer-select');if(!select)return;
    select.addEventListener('change',()=>{enablePicker(!select.disabled);onChange(selected());});
    enablePicker(true);
  }
  function enablePicker(enabled) {
    const select=$('#customer-select');if(!select)return;
    const isNew=enabled&&select.value==='new';
    select.disabled=!enabled;select.required=enabled;$('#new-customer-fields').hidden=!isNew;
    for(const name of ['newCustomerName','newCustomerPhone']){
      const input=select.form.elements[name];input.disabled=!isNew;input.required=isNew&&name==='newCustomerName';
    }
  }
  function selected() {
    const value=$('#customer-select')?.value;
    return value&&value!=='new'?state().customers.find(c=>c.id===Number(value)):null;
  }
  // Payload fragment for a sale that uses or creates balance.
  function salePayload(v) {
    if(v.customerId==='new'){if(!v.newCustomerName?.trim())throw new Error('Escribe el nombre del nuevo cliente.');return {newCustomer:{name:v.newCustomerName,phone:v.newCustomerPhone||''}};}
    if(!v.customerId)throw new Error('Elige el cliente del saldo a favor.');
    return {customerId:Number(v.customerId)};
  }

  function render() {
    const list=state().customers.filter(c=>c.active||(admin()&&showInactive)),owed=list.reduce((n,c)=>n+Math.max(0,c.balance),0),debt=list.reduce((n,c)=>n+Math.max(0,-c.balance),0);
    $('#content').innerHTML=heading('','Clientes','Deudas, abonos y saldos a favor.',button(icon('plus')+' Nuevo cliente','new-customer'))+
      '<div class="inventory-summary"><span><b>'+money(debt)+'</b> por cobrar</span><span><b>'+money(owed)+'</b> a favor de clientes</span></div>'+
      (admin()?'<label class="check-label"><input id="customer-inactive" type="checkbox" '+(showInactive?'checked':'')+'> Mostrar también clientes inactivos</label>':'')+
      '<label class="search-box inventory-search">'+icon('search')+'<input id="customer-search" type="search" placeholder="Buscar por nombre o teléfono…" aria-label="Buscar cliente"></label><label class="customer-filter-label">Mostrar<select id="customer-balance-filter"><option value="all">Todos los clientes</option><option value="debt">Con deuda</option><option value="credit">Con saldo a favor</option></select></label><div id="customer-list" class="phone-list"></div>';
    const rows=()=>{const q=$('#customer-search').value,filter=$('#customer-balance-filter').value;$('#customer-list').innerHTML=list.filter(c=>norm(c.name+' '+c.phone).includes(norm(q))&&(filter==='debt'?c.balance<0:filter==='credit'?c.balance>0:true)).map(c=>'<button class="phone-card" data-customer="'+c.id+'"><div class="phone-card-top"><b>'+esc(c.name)+'</b><strong class="'+(c.balance<0?'danger-text':c.balance>0?'success-text':'')+'">'+balanceLabel(c.balance)+'</strong></div><div class="phone-card-bottom"><small>'+esc(c.phone||'Sin teléfono')+(!c.active?' · Inactivo':'')+(c.balance<0&&c.debt_since?' · Debe desde '+date(c.debt_since,true):'')+'</small>'+icon('chevron')+'</div></button>').join('')||empty('Sin clientes en esta vista','Cambia el filtro o registra un cliente.','users');};
    rows();$('#customer-search').addEventListener('input',rows);$('#customer-balance-filter').addEventListener('change',rows);
    $('#customer-inactive')?.addEventListener('change',e=>{showInactive=e.target.checked;render();});
  }
  async function detail(id) {
    const c=await api(`/customers/${id}`),attr=`data-customer-id="${c.id}"`;
    const shift=state().shift,unlocked=!shift||shift.stage==='open',canDeposit=c.active&&unlocked&&(admin()||shift?.user_id===state().user.id);
    const actions=[...(c.balance<0?[button('Registrar abono','credit-payment','primary',attr+(canDeposit?'':' disabled'))]:[]),...(c.balance>=0?[button(`${icon('plus')} Cargar saldo`,'credit-deposit','primary',`${attr}${canDeposit?'':' disabled'}`)]:[]),...(admin()?[button('Devolver','credit-refund','secondary',`${attr}${c.active&&unlocked&&c.balance>0?'':' disabled'}`),button('Ajustar','credit-adjust','secondary',`${attr}${c.active&&unlocked?'':' disabled'}`),button('Deuda anterior','credit-opening_debt','secondary',attr+(c.active&&unlocked?'':' disabled')),button('Editar','customer-edit','secondary',attr)]:[])];
    modal(c.name,`${c.phone?esc(c.phone)+' · ':''}Cliente desde ${date(c.created_at,true).split(',')[0]}`,`<div class="payment-total"><span>${c.balance<0?'Deuda pendiente':c.balance>0?'Saldo a favor':'Cuenta al día'}</span><strong class="${c.balance<0?'danger-text':''}">${money(Math.abs(c.balance))}</strong></div><div class="modal-actions customer-actions">${actions.join('')}</div>${c.allow_fiado?`<p class="muted">Fiado habilitado · Límite ${money(c.credit_limit)}${c.debt_since?` · Deuda desde ${date(c.debt_since,true)}`:''}</p>`:''}<h3 class="customer-history-title">Movimientos</h3>${c.movements.map(m=>`<div class="movement-card"><div><b>${kinds[m.kind]||m.kind}${methods[m.method]?' · '+methods[m.method]:''}</b><small>${date(m.created_at,true)} · ${esc(m.actor)}${m.sale_id?` · Pedido #${String(m.sale_id).padStart(4,'0')}`:''}</small></div><strong class="${m.amount>0?'success-text':'danger-text'}">${signed(m.amount)}</strong>${admin()&&unlocked&&(m.shift_id==null||m.shift_id===shift?.id)&&['payment','deposit'].includes(m.kind)&&!c.movements.some(v=>v.reversal_of===m.id)?`<button type="button" class="text-button" data-credit-reverse="${m.id}" data-customer-id="${c.id}">Anular registro</button>`:''}${m.note&&(m.kind==='void'||!m.sale_id)?`<p>${esc(m.note)}</p>`:''}</div>`).join('')||'<p class="muted">Sin movimientos todavía.</p>'}`);
  }
  function creditModal(kind,id,movementId=null) {
    const c=state().customers.find(v=>v.id===id),title={deposit:'Cargar saldo',payment:'Registrar abono',opening_debt:'Registrar deuda anterior',reversal:'Anular registro',refund:'Devolver saldo',adjust:'Ajustar saldo'}[kind];
    const cashAvailable=state().shift?.stage==='open',incoming=['deposit','payment'].includes(kind);
    const method=incoming?'<label>Medio<select name="method"><option value="cash" '+(cashAvailable?'':'disabled')+'>Efectivo (requiere turno abierto)</option><option value="qr" '+(cashAvailable?'':'selected')+'>QR</option><option value="card">Tarjeta</option></select></label>':kind==='refund'?'<label>¿De dónde sale el dinero?<select name="method"><option value="cash" '+(cashAvailable?'':'disabled')+'>De la caja (turno abierto)</option><option value="none" '+(cashAvailable?'':'selected')+'>Fuera de la caja</option></select></label>':kind==='adjust'?'<label>Tipo de ajuste<select name="direction"><option value="add">Sumar al saldo</option><option value="remove">Restar del saldo</option></select></label>':'';
    const subtitle={deposit:'El dinero recibido reduce primero la deuda; el excedente queda a favor.',payment:balanceLabel(c.balance)+'. Registra el dinero que recibes ahora.',opening_debt:'Solo deudas que ya existían. No registra una venta ni dinero recibido.',reversal:'Conserva el registro original y añade su corrección. Solo se corrigen abonos del turno actual; los cierres anteriores se conservan.',refund:'Devuelve dinero que el cliente tiene a favor.',adjust:'Corrección con motivo. No registra entrada ni salida de dinero.'}[kind];
    modal(title+' · '+esc(c.name),subtitle,'<form id="credit-form"><input type="hidden" name="kind" value="'+kind+'"><input type="hidden" name="customerId" value="'+id+'"><input type="hidden" name="requestId" value="'+requestId()+'">'+(kind==='reversal'?'<input name="movementId" type="hidden" value="'+movementId+'">':'<label>Monto (Bs)<input name="amount" type="number" inputmode="decimal" min="0.01" step="0.01" max="100000" required value="'+(kind==='payment'?(-c.balance/100).toFixed(2):'')+'"></label>')+method+(incoming?'<label class="check-label" id="credit-verification" hidden><input name="verified" type="checkbox" disabled> Confirmé que el pago digital fue recibido.</label>':'')+(kind==='payment'?'<p class="info-block" id="payment-balance-preview"></p><label class="check-label" id="payment-excess-label" hidden><input name="allowExcess" type="checkbox" disabled> Confirmo que el excedente quedará como saldo a favor.</label>':'')+'<label>'+(['deposit','payment'].includes(kind)?'Nota (opcional)':'Motivo')+'<input name="note" maxlength="300" '+(['deposit','payment'].includes(kind)?'':'required')+'></label>'+formFooter(title)+'</form>');
    if(incoming){
      const form=$('#credit-form'),method=form.elements.method,verified=form.elements.verified;
      const sync=()=>{const digital=method.value!=='cash';$('#credit-verification').hidden=!digital;verified.disabled=!digital;verified.required=digital;verified.checked=false;};
      method.addEventListener('change',sync);sync();
      if(kind==='payment'){const amount=form.elements.amount,excess=form.elements.allowExcess;const preview=()=>{const next=c.balance+cents(amount.value);$('#payment-balance-preview').textContent='Después del abono: '+balanceLabel(next);$('#payment-excess-label').hidden=next<=0;excess.disabled=next<=0;excess.required=next>0;excess.checked=false;};amount.addEventListener('input',preview);preview();}
    }
  }
  function customerModal(c) {
    modal(c?'Editar cliente':'Nuevo cliente',c?'Para desactivarlo, su saldo debe estar en cero.':'Podrás guardarle vueltos y recargas.',`<form id="customer-form"><input type="hidden" name="id" value="${c?.id||''}"><label>Nombre<input name="name" required maxlength="80" value="${esc(c?.name||'')}"></label><label>Teléfono (opcional)<input name="phone" inputmode="tel" maxlength="30" value="${esc(c?.phone||'')}"></label>${c?`<label class="check-label"><input type="checkbox" name="active" ${c.active?'checked':''}> Cliente activo</label>`:''}${admin()&&c?`<label class="check-label"><input type="checkbox" name="allowFiado" ${c.allow_fiado?'checked':''}> Permitir compras fiadas</label><label>Límite de fiado (Bs)<input name="creditLimit" type="number" inputmode="decimal" min="0" max="100000" step="0.01" value="${(c.credit_limit||0)/100}" required></label>`:''}${formFooter(c?'Guardar cambios':'Crear cliente')}</form>`);
  }
  async function click(el) {
    if(el.dataset.customer){await detail(Number(el.dataset.customer));return true;}
    if(el.dataset.action==='new-customer'){customerModal();return true;}
    const id=Number(el.dataset.customerId);
    if(el.dataset.action==='credit-view'){await detail(id);return true;}
    if(el.dataset.action==='customer-edit'){customerModal(state().customers.find(c=>c.id===id));return true;}
    if(el.dataset.creditReverse){creditModal('reversal',id,Number(el.dataset.creditReverse));return true;}
    for(const kind of ['deposit','payment','opening_debt','refund','adjust'])if(el.dataset.action===`credit-${kind}`){creditModal(kind,id);return true;}
    return false;
  }
  async function submit(id,form,v,f) {
    if(id==='customer-form'){
      if(v.id)await api(`/customers/${v.id}`,{name:v.name,phone:v.phone,active:f.has('active'),allowFiado:f.has('allowFiado'),creditLimit:cents(v.creditLimit||0)},'PATCH');
      else await api('/customers',{name:v.name,phone:v.phone});
      closeModal();try{await refresh();}catch{toast('Cliente guardado. No pudimos actualizar la pantalla; usa Actualizar.',true);return true;}toast(v.id?'Cliente actualizado.':'Cliente registrado.');return true;
    }
    if(id==='credit-form'){
      const amount=cents(v.amount),operation=pendingCredit||{customerId:Number(v.customerId),payload:{requestId:v.requestId,kind:v.kind,method:v.method,amount:v.kind==='adjust'&&v.direction==='remove'?-amount:amount,note:v.note,...(v.kind==='payment'?{allowExcess:form.elements.allowExcess.checked}:{}),...(v.kind==='reversal'?{movementId:Number(v.movementId)}:{})}};
      const persisted=rememberCredit(operation),controls=[...form.querySelectorAll('input,select,textarea,button')],submit=form.querySelector('button[type="submit"]');
      const disabled=controls.map(control=>control.disabled);controls.forEach(control=>control.disabled=true);
      let result;
      try{result=await api(`/customers/${operation.customerId}/credit`,operation.payload);}catch(error){
        if(error.status>=400&&error.status<500&&error.status!==401){forgetCredit();controls.forEach((control,n)=>control.disabled=disabled[n]);}
        else{submit.textContent='Reintentar la misma operación';if(!persisted)error.message+=' Mantén esta ventana abierta para confirmar este saldo.';}
        throw error;
      }
      forgetCredit();closeModal();
      try{await refresh();if(result.movement&&['payment','deposit'].includes(result.movement.kind)){const m=result.movement,c=state().customers.find(c=>c.id===operation.customerId);modal('Abono registrado','Comprobante #'+m.id,`<div class="receipt"><div class="receipt-brand">Flamingo’s</div><p>${date(m.created_at,true)} · ${esc(state().user.name)}</p><p>Cliente: ${esc(c?.name)}</p><div class="receipt-payment"><span>Recibido · ${methods[m.method]}</span><b>${money(m.amount)}</b></div><div class="receipt-payment"><span>Estado de cuenta</span><b>${balanceLabel(result.balance)}</b></div><p>Comprobante interno · No es factura fiscal</p></div><div class="modal-actions">${button('Ver cliente','credit-view','secondary',`data-customer-id="${operation.customerId}"`)}${button('Imprimir','print','secondary')}</div>`);}else await detail(operation.customerId);}catch{toast(`Saldo guardado: ${money(result.balance)}. No pudimos actualizar la pantalla; usa Actualizar.`,true);return true;}
      toast(result.balance<0?`Cuenta actualizada: ${balanceLabel(result.balance)}.`:`Saldo actualizado: ${money(result.balance)}.`);return true;
    }
    return false;
  }
  return {render,click,submit,picker,bindPicker,enablePicker,selected,salePayload,recover,hasPending:()=>!!pendingCredit,reset:()=>{pendingCredit=null;}};
}
