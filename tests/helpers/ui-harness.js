import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';
import {webcrypto} from 'node:crypto';
import {maximumQuantity} from '../../public/catalog.js';

const source=readFileSync(new URL('../../public/app.js',import.meta.url),'utf8')
  .replace(/^import[^\n]*\n/gm,'').replace(/\nboot\(\);\s*$/,'');

export const product={id:25,name:'Café americano',price:1200,active:1,inventory_mode:'untracked',recipe:[]};
export function snapshot(overrides={}){
  return {demo:true,user:{id:2,name:'Camila',role:'cashier'},shift:{id:1,user_id:2,stage:'open'},products:[{...product}],inventory:[],customers:[],...overrides};
}
export function uiHarness({state=snapshot(),view='pos',storageBlocked=false}={}){
  const elements=new Map(),listeners={},ticks=[],requests=[],toasts=[],receipts=[];
  const error={textContent:'',hidden:true},storage=new Map();let closed=0,refreshed=0;
  elements.set('.form-error',error);elements.set('#order-status',{textContent:''});
  const document={hidden:false,activeElement:{tagName:'BODY'},
    querySelector:s=>elements.get(s)||null,querySelectorAll:()=>[],
    addEventListener:(name,handler)=>{listeners[name]=handler;}};
  const context=createContext({document,window:{scrollTo:()=>{}},Event,crypto:webcrypto,setInterval:handler=>ticks.push(handler),
    setTimeout:()=>0,clearTimeout:()=>{},maximumQuantity,
    createReconciliationUI:()=>({submit:async()=>false,click:async()=>false}),
    createCustomersUI:()=>({submit:async()=>false,click:async()=>false,salePayload:v=>({customerId:Number(v.customerId)}),hasPending:()=>false,reset:()=>{},recover:()=>{}}),
    FormData:class{constructor(form){return new Map(form.fields);}},
    localStorage:{getItem:key=>storage.get(key)||null,
      setItem:(key,value)=>{if(storageBlocked)throw new Error('Storage blocked');storage.set(key,value);},
      removeItem:key=>{if(storageBlocked)throw new Error('Storage blocked');storage.delete(key);}},
    testApi:async(path,body)=>{requests.push({path,body});return state;},
    testClose:()=>{closed++;},testRefresh:async()=>{refreshed++;},
    testToast:(message,error)=>toasts.push({message,error}),testReceipt:sale=>receipts.push(sale),initialState:state,initialView:view
  });
  runInContext(source,context);
  context.originalApi=runInContext('api',context);
  context.originalRefresh=runInContext('refresh',context);
  runInContext('state=initialState;view=initialView;api=(...args)=>testApi(...args);closeModal=()=>testClose();refresh=()=>testRefresh();toast=(...args)=>testToast(...args);showReceipt=sale=>testReceipt(sale);',context);
  const run=code=>runInContext(code,context);
  const form=(id,fields,controls=[])=>{
    const attributes=new Map([['id',id]]),submit={disabled:false,textContent:'Guardar'};
    const element={fields,id:fields.some(([name])=>name==='id')?{value:fields.find(([name])=>name==='id')[1]}:id,
      getAttribute:name=>attributes.get(name)||null,setAttribute:(name,value)=>attributes.set(name,value),removeAttribute:name=>attributes.delete(name),
      querySelector:()=>submit,querySelectorAll:()=>controls};
    return {element,submit,event:{target:element,submitter:submit,preventDefault:()=>{}}};
  };
  return {context,run,document,elements,listeners,ticks,requests,toasts,receipts,error,storage,form,
    get closed(){return closed;},get refreshed(){return refreshed;}};
}
