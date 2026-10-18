import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';

function fixture(){
 const elements=new Map(),requests=[],dialogs=[];let active=null,pending=[];
 const body={innerHTML:''};elements.set('#product-history-content',body);
 const state={user:{id:1,role:'admin'},products:[{id:5,name:'Hamburguesa'}],inventory:[]};
 const context=createContext({Intl,Date,URLSearchParams,FormData:class{constructor(f){return f.fields;}},document:{querySelector:s=>{if(s==='#product-history-content')return body;if(s==='dialog.modal[open]')return active;if(s.startsWith('dialog[open][data-history-token='))return active?.dataset.historyToken===s.match(/"(\d+)"/)[1]?active:null;return elements.get(s)||null;}},testCtx:{
  getState:()=>state,api:path=>{requests.push(path);return new Promise((resolve,reject)=>pending.push({resolve,reject}));},modal:()=>{active={dataset:{},classList:{add:()=>{}},insertAdjacentHTML:()=>{}};dialogs.push(active);},esc:s=>String(s),money:v=>'Bs '+v,date:s=>s,icon:()=>'<svg></svg>',empty:(title)=>title,showReceipt:()=>{active={dataset:{},classList:{add:()=>{}},insertAdjacentHTML:()=>{}};dialogs.push(active);}
 }});
 runInContext(readFileSync(new URL('../public/product-history.js',import.meta.url),'utf8').replace('export function','function')+'\nvar historyUI=createProductHistoryUI(testCtx);',context);
 const run=code=>runInContext(code,context),data={kind:'product',entity:{id:5,name:'Hamburguesa',active:1},from:'2026-10-17',to:'2026-10-17',queriedAt:'2026-10-17T12:00:00Z',sales:{totals:{quantity:2,total:3000,tickets:1},rows:[],page:1,pages:1},stock:{items:[],rows:[],records:0,page:1,pages:1}};
 return {run,body,requests,dialogs,pending,data,close:()=>{active=null;},state};
}
test('a late product-history response cannot reopen a dialog that the owner closed',async()=>{
 const f=fixture(),opening=f.run("historyUI.open('product',5,{from:'2026-10-17',to:'2026-10-17'})");assert.equal(f.dialogs.length,1);f.close();f.pending[0].resolve(f.data);await opening;assert.equal(f.dialogs.length,1);assert.doesNotMatch(f.body.innerHTML,/Unidades vendidas/);
});
test('date selection and stock tabs preserve the selected range without changing inventory',async()=>{
 const f=fixture(),opening=f.run("historyUI.open('product',5,{from:'2026-10-17',to:'2026-10-17'})");f.pending[0].resolve(f.data);await opening;assert.match(f.body.innerHTML,/Unidades vendidas/);
 const changing=f.run("historyUI.submit({target:{getAttribute:()=> 'product-history-range',fields:[['from','2026-10-16'],['to','2026-10-16']]}})");assert.match(f.requests[1],/from=2026-10-16&to=2026-10-16/);f.pending[1].resolve({...f.data,from:'2026-10-16',to:'2026-10-16'});await changing;
 await f.run("historyUI.click({dataset:{historyTab:'stock'},hasAttribute:()=>false})");assert.match(f.body.innerHTML,/Sin stock asociado/);assert.match(f.body.innerHTML,/2026-10-16/);assert.equal(f.requests.length,2);
});
test('a response from a previous history cannot overwrite a newer product selection',async()=>{
 const f=fixture(),a=f.run("historyUI.open('product',5,{from:'2026-10-17'})"),b=f.run("historyUI.open('product',6,{from:'2026-10-16'})");
 f.pending[1].resolve({...f.data,entity:{id:6,name:'Otro',active:1},from:'2026-10-16',to:'2026-10-16'});await b;f.pending[0].resolve(f.data);await a;assert.match(f.body.innerHTML,/2026-10-16/);assert.doesNotMatch(f.body.innerHTML,/2026-10-17/);
});
