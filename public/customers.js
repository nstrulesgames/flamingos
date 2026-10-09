// Customers with a balance in their favor (saldo a favor): list, history and balance operations.
export function createCustomersUI(ctx) {
  const {api,modal,closeModal,refresh,toast,icon,esc,money,date,button,heading,empty,formFooter,cents}=ctx;
  const $=s=>document.querySelector(s);
  const state=()=>ctx.getState();
  const admin=()=>state().user.role==='admin';
  const requestId=()=>Array.from(crypto.getRandomValues(new Uint8Array(24)),v=>v.toString(16).padStart(2,'0')).join('');
  const norm=v=>String(v||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
  const signed=v=>`${v>0?'+':v<0?'−':''}${money(Math.abs(v))}`;
  const kinds={deposit:'Recarga',change:'Vuelto guardado',sale:'Pago con saldo',void:'Anulación de venta',refund:'Devolución',adjust:'Ajuste'};
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
  function picker(label='Cliente') {
    const customers=state().customers.filter(c=>c.active);
    return `<label>${label}<select name="customerId" id="customer-select"><option value="">Elegir cliente…</option>${customers.map(c=>`<option value="${c.id}">${esc(c.name)} · ${money(c.balance)}</option>`).join('')}<option value="new">+ Nuevo cliente</option></select></label><div id="new-customer-fields" class="field-row" hidden><label>Nombre del cliente<input name="newCustomerName" maxlength="80" autocomplete="off"></label><label>Teléfono (opcional)<input name="newCustomerPhone" inputmode="tel" maxlength="30" autocomplete="off"></label></div>`;
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
    const list=state().customers.filter(c=>c.active||(admin()&&showInactive)),owed=state().customers.reduce((n,c)=>n+c.balance,0);
    $('#content').innerHTML=heading('','Clientes','Saldo a favor: vueltos que dejan guardados y recargas anticipadas.',button(`${icon('plus')} Nuevo cliente`,'new-customer'))+
      `<div class="inventory-summary"><span><b>${money(owed)}</b> a favor de clientes</span><span><b>${list.filter(c=>c.balance>0).length}</b> con saldo</span></div>`+
      `${admin()?`<label class="check-label"><input id="customer-inactive" type="checkbox" ${showInactive?'checked':''}> Mostrar también clientes inactivos</label>`:''}<label class="search-box inventory-search">${icon('search')}<input id="customer-search" type="search" placeholder="Buscar por nombre o teléfono…" aria-label="Buscar cliente"></label><div id="customer-list" class="phone-list"></div>`;
    const rows=q=>{$('#customer-list').innerHTML=list.filter(c=>norm(`${c.name} ${c.phone}`).includes(norm(q))).map(c=>`<button class="phone-card" data-customer="${c.id}" aria-label="Ver saldo de ${esc(c.name)}"><div class="phone-card-top"><b>${esc(c.name)}</b><strong class="${c.balance?'success-text':''}">${money(c.balance)}</strong></div><div class="phone-card-bottom"><small>${esc(c.phone||'Sin teléfono')}${c.active?'':' · Inactivo'}</small>${icon('chevron')}</div></button>`).join('')||empty('Sin clientes','Se registran al guardar un vuelto o con «Nuevo cliente».','users');};
    rows('');$('#customer-search').addEventListener('input',e=>rows(e.target.value));
    $('#customer-inactive')?.addEventListener('change',e=>{const query=$('#customer-search').value;showInactive=e.target.checked;render();$('#customer-search').value=query;$('#customer-search').dispatchEvent(new Event('input'));});
  }
  async function detail(id) {
    const c=await api(`/customers/${id}`),attr=`data-customer-id="${c.id}"`;
    const shift=state().shift,unlocked=!shift||shift.stage==='open',canDeposit=c.active&&unlocked&&(admin()||shift?.user_id===state().user.id);
    const actions=[button(`${icon('plus')} Cargar saldo`,'credit-deposit','primary',`${attr}${canDeposit?'':' disabled'}`),...(admin()?[button('Devolver','credit-refund','secondary',`${attr}${c.active&&unlocked&&c.balance>0?'':' disabled'}`),button('Ajustar','credit-adjust','secondary',`${attr}${c.active&&unlocked?'':' disabled'}`),button('Editar','customer-edit','secondary',attr)]:[])];
    modal(c.name,`${c.phone?esc(c.phone)+' · ':''}Cliente desde ${date(c.created_at,true).split(',')[0]}`,`<div class="payment-total"><span>Saldo a favor</span><strong>${money(c.balance)}</strong></div><div class="modal-actions customer-actions">${actions.join('')}</div><h3 class="customer-history-title">Movimientos</h3>${c.movements.map(m=>`<div class="movement-card"><div><b>${kinds[m.kind]||m.kind}${methods[m.method]?' · '+methods[m.method]:''}</b><small>${date(m.created_at,true)} · ${esc(m.actor)}${m.sale_id?` · Pedido #${String(m.sale_id).padStart(4,'0')}`:''}</small></div><strong class="${m.amount>0?'success-text':'danger-text'}">${signed(m.amount)}</strong>${m.note&&(m.kind==='void'||!m.sale_id)?`<p>${esc(m.note)}</p>`:''}</div>`).join('')||'<p class="muted">Sin movimientos todavía.</p>'}`);
  }
  function creditModal(kind,id) {
    const c=state().customers.find(v=>v.id===id),title={deposit:'Cargar saldo',refund:'Devolver saldo',adjust:'Ajustar saldo'}[kind];
    const cashAvailable=state().shift?.stage==='open';
    const method=kind==='deposit'?`<label>Medio<select name="method"><option value="cash" ${cashAvailable?'':'disabled'}>Efectivo (requiere turno abierto)</option><option value="qr" ${cashAvailable?'':'selected'}>QR</option><option value="card">Tarjeta</option></select></label>`
      :kind==='refund'?`<label>¿De dónde sale el dinero?<select name="method"><option value="cash" ${cashAvailable?'':'disabled'}>De la caja (turno abierto)</option><option value="none" ${cashAvailable?'':'selected'}>Fuera de la caja</option></select></label>`
      :`<label>Tipo de ajuste<select name="direction"><option value="add">Sumar al saldo</option><option value="remove">Restar del saldo</option></select></label>`;
    const subtitle={deposit:'El cliente deja dinero por adelantado para usarlo en próximas compras.',refund:`Saldo actual: ${money(c.balance)}. El dinero devuelto se descuenta del saldo.`,adjust:'Corrige un error de registro. Queda en el historial con tu nombre.'}[kind];
    modal(`${title} · ${esc(c.name)}`,subtitle,`<form id="credit-form"><input type="hidden" name="kind" value="${kind}"><input type="hidden" name="customerId" value="${id}"><input type="hidden" name="requestId" value="${requestId()}"><label>Monto (Bs)<input name="amount" type="number" inputmode="decimal" min="0.01" step="0.01" max="100000" required></label>${method}${kind==='deposit'?'<label class="check-label" id="credit-verification" hidden><input name="verified" type="checkbox" disabled> Confirmé que el pago digital fue recibido.</label>':''}<label>${kind==='deposit'?'Nota (opcional)':'Motivo'}<input name="note" maxlength="300" ${kind==='deposit'?'':'required'} placeholder="${kind==='deposit'?'Ej. adelanto para la semana':'Ej. lo pidió en efectivo'}"></label>${formFooter(title)}</form>`);
    if(kind==='deposit'){
      const form=$('#credit-form'),method=form.elements.method,verified=form.elements.verified;
      const sync=()=>{const digital=method.value!=='cash';$('#credit-verification').hidden=!digital;verified.disabled=!digital;verified.required=digital;verified.checked=false;};
      method.addEventListener('change',sync);sync();
    }
  }
  function customerModal(c) {
    modal(c?'Editar cliente':'Nuevo cliente',c?'Para desactivarlo, su saldo debe estar en cero.':'Podrás guardarle vueltos y recargas.',`<form id="customer-form"><input type="hidden" name="id" value="${c?.id||''}"><label>Nombre<input name="name" required maxlength="80" value="${esc(c?.name||'')}"></label><label>Teléfono (opcional)<input name="phone" inputmode="tel" maxlength="30" value="${esc(c?.phone||'')}"></label>${c?`<label class="check-label"><input type="checkbox" name="active" ${c.active?'checked':''}> Cliente activo</label>`:''}${formFooter(c?'Guardar cambios':'Crear cliente')}</form>`);
  }
  async function click(el) {
    if(el.dataset.customer){await detail(Number(el.dataset.customer));return true;}
    if(el.dataset.action==='new-customer'){customerModal();return true;}
    const id=Number(el.dataset.customerId);
    if(el.dataset.action==='customer-edit'){customerModal(state().customers.find(c=>c.id===id));return true;}
    for(const kind of ['deposit','refund','adjust'])if(el.dataset.action===`credit-${kind}`){creditModal(kind,id);return true;}
    return false;
  }
  async function submit(id,form,v,f) {
    if(id==='customer-form'){
      if(v.id)await api(`/customers/${v.id}`,{name:v.name,phone:v.phone,active:f.has('active')},'PATCH');
      else await api('/customers',{name:v.name,phone:v.phone});
      closeModal();try{await refresh();}catch{toast('Cliente guardado. No pudimos actualizar la pantalla; usa Actualizar.',true);return true;}toast(v.id?'Cliente actualizado.':'Cliente registrado.');return true;
    }
    if(id==='credit-form'){
      const amount=cents(v.amount),operation=pendingCredit||{customerId:Number(v.customerId),payload:{requestId:v.requestId,kind:v.kind,method:v.method,amount:v.kind==='adjust'&&v.direction==='remove'?-amount:amount,note:v.note}};
      const persisted=rememberCredit(operation),controls=[...form.querySelectorAll('input,select,textarea,button')],submit=form.querySelector('button[type="submit"]');
      const disabled=controls.map(control=>control.disabled);controls.forEach(control=>control.disabled=true);
      let result;
      try{result=await api(`/customers/${operation.customerId}/credit`,operation.payload);}catch(error){
        if(error.status>=400&&error.status<500&&error.status!==401){forgetCredit();controls.forEach((control,n)=>control.disabled=disabled[n]);}
        else{submit.textContent='Reintentar la misma operación';if(!persisted)error.message+=' Mantén esta ventana abierta para confirmar este saldo.';}
        throw error;
      }
      forgetCredit();closeModal();
      try{await refresh();await detail(operation.customerId);}catch{toast(`Saldo guardado: ${money(result.balance)}. No pudimos actualizar la pantalla; usa Actualizar.`,true);return true;}
      toast(`Saldo actualizado: ${money(result.balance)}.`);return true;
    }
    return false;
  }
  return {render,click,submit,picker,bindPicker,enablePicker,selected,salePayload,recover,hasPending:()=>!!pendingCredit,reset:()=>{pendingCredit=null;}};
}
