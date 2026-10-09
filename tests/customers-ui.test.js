import test from 'node:test';
import assert from 'node:assert/strict';
import {createCustomersUI} from '../public/customers.js';
import {webcrypto} from 'node:crypto';

function fixture(t,{api=async()=>({balance:1000}),refresh=async()=>{}}={}){
  const elements=new Map(),storage=new Map(),toasts=[],modals=[];
  const previous={document:globalThis.document,localStorage:globalThis.localStorage,crypto:globalThis.crypto};
  globalThis.document={querySelector:s=>elements.get(s)||null};
  globalThis.localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
  if(!globalThis.crypto)globalThis.crypto=webcrypto;
  t.after(()=>{globalThis.document=previous.document;globalThis.localStorage=previous.localStorage;});
  const state={demo:true,user:{id:2,role:'cashier'},customers:[{id:1,name:'Cliente de prueba',balance:1000,active:1}]};
  const ctx={getState:()=>state,api,refresh,modal:(...args)=>modals.push(args),closeModal:()=>{},toast:(message,error)=>toasts.push({message,error}),
    icon:()=>'',esc:v=>String(v??''),money:v=>`Bs ${v/100}`,date:()=>'',button:()=>'',heading:()=>'',empty:()=>'',formFooter:()=>'<button type="submit">Confirmar</button>',cents:v=>Math.round(Number(v)*100)};
  const form={controls:[{disabled:false},{disabled:false}],querySelectorAll(){return this.controls;},querySelector(){return this.controls[1];}};
  return {ui:createCustomersUI(ctx),ctx,state,elements,storage,toasts,modals,form};
}
const values={customerId:'1',requestId:'credit-test-123',kind:'deposit',method:'cash',amount:'10',note:''};

test('hidden customer fields cannot prevent a cash payment after unchecking saved change',t=>{
  const {ui,elements}=fixture(t);let change;
  const name={disabled:false,required:false},phone={disabled:false,required:false};
  const select={value:'',disabled:false,required:false,form:{elements:{newCustomerName:name,newCustomerPhone:phone}},addEventListener:(event,callback)=>{change=callback;}};
  elements.set('#customer-select',select);elements.set('#new-customer-fields',{hidden:true});
  ui.bindPicker();assert.equal(name.disabled,true);assert.equal(name.required,false);
  select.value='new';change();assert.equal(name.required,true);assert.equal(name.disabled,false);
  ui.enablePicker(false);assert.equal(select.disabled,true);assert.equal(select.required,false);assert.equal(name.disabled,true);assert.equal(name.required,false);
  ui.enablePicker(true);assert.equal(name.required,true);assert.equal(name.disabled,false);
  select.value='1';change();assert.equal(name.required,false);assert.equal(name.disabled,true);
});

test('an uncertain credit operation freezes inputs and retries the identical request',async t=>{
  const requests=[];let attempts=0;
  const {ui,form}=fixture(t,{api:async(path,payload)=>{
    requests.push({path,payload});if(attempts++===0)throw Object.assign(new Error('Respuesta perdida'),{status:500});
    return {id:1,name:'Cliente',balance:1000,movements:[]};
  }});
  await assert.rejects(ui.submit('credit-form',form,values),/perdida/);
  assert.equal(ui.hasPending(),true);assert(form.controls.every(c=>c.disabled));
  assert.equal(form.controls[1].textContent,'Reintentar la misma operación');
  await ui.submit('credit-form',form,{...values,amount:'99',method:'qr'});
  assert.deepEqual(requests[0],requests[1]);assert.equal(requests[1].payload.amount,1000);assert.equal(ui.hasPending(),false);
});

test('a credit operation survives reload and recovers with the same customer and request ID',async t=>{
  const requests=[];
  const {ui,ctx,storage,form,modals}=fixture(t,{api:async(path,payload)=>{
    requests.push({path,payload});if(requests.length===1)throw new Error('Sin conexión');
    return {id:1,name:'Cliente',balance:1000,movements:[]};
  }});
  await assert.rejects(ui.submit('credit-form',form,values),/Sin conexión/);
  assert.equal(storage.size,1);
  const reloaded=createCustomersUI(ctx);reloaded.recover();assert.match(modals.at(-1)[0],/saldo pendiente/);
  await reloaded.submit('credit-form',form,{});assert.deepEqual(requests[0],requests[1]);assert.equal(storage.size,0);
});

test('credit validation errors restore editable fields and a committed operation reports refresh failure honestly',async t=>{
  let accepted=false;
  const {ui,form,toasts}=fixture(t,{api:async()=>{
    if(!accepted)throw Object.assign(new Error('Saldo insuficiente'),{status:409});return {balance:1000};
  },refresh:async()=>{throw new Error('Sin conexión');}});
  await assert.rejects(ui.submit('credit-form',form,values),/insuficiente/);
  assert.equal(ui.hasPending(),false);assert(form.controls.every(c=>!c.disabled));
  accepted=true;await ui.submit('credit-form',form,values);
  assert.equal(ui.hasPending(),false);assert.match(toasts.at(-1).message,/Saldo guardado/);
});

test('cashier balance actions are disabled outside their own open shift',async t=>{
  const buttons=[];
  const f=fixture(t,{api:async()=>({id:1,name:'Cliente',balance:1000,active:1,movements:[]})});
  f.ctx.button=(label,action,cls,attrs)=>{buttons.push({action,attrs});return '';};
  const detailUI=createCustomersUI(f.ctx);
  await detailUI.click({dataset:{customer:'1'}});assert.match(buttons.at(-1).attrs,/disabled/);
  f.state.shift={id:1,user_id:3,stage:'open'};await detailUI.click({dataset:{customer:'1'}});assert.match(buttons.at(-1).attrs,/disabled/);
  f.state.shift.user_id=2;await detailUI.click({dataset:{customer:'1'}});assert.doesNotMatch(buttons.at(-1).attrs,/disabled/);
  f.state.shift.stage='counting';await detailUI.click({dataset:{customer:'1'}});assert.match(buttons.at(-1).attrs,/disabled/);
});

test('digital deposits require payment confirmation, including the default without an open drawer',async t=>{
  const {ui,state,elements,modals}=fixture(t);state.user.role='admin';
  let change;const method={value:'qr',addEventListener:(event,fn)=>{change=fn;}},verified={checked:false};
  elements.set('#credit-form',{elements:{method,verified}});elements.set('#credit-verification',{hidden:true});
  await ui.click({dataset:{action:'credit-deposit',customerId:'1'}});
  assert.match(modals.at(-1)[2],/value="cash" disabled/);assert.match(modals.at(-1)[2],/value="qr" selected/);
  assert.equal(verified.required,true);assert.equal(verified.disabled,false);assert.equal(elements.get('#credit-verification').hidden,false);
  method.value='cash';change();assert.equal(verified.required,false);assert.equal(verified.disabled,true);assert.equal(elements.get('#credit-verification').hidden,true);
});
