import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';

// Execute the real app's submit listener. HTML forms expose named inputs as
// properties, so an input named "id" replaces form.id in the browser.
const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8')
  .replace(/^import[^\n]*\n/gm,'').replace(/\nboot\(\);\s*$/,'');

test('editing a prepared product submits sales-only mode even when a hidden input shadows form.id',async()=>{
  const listeners={},requests=[],errors={textContent:'',hidden:true};let closed=0,refreshed=0;
  const context=createContext({
    document:{querySelector:s=>s==='.form-error'?errors:null,addEventListener:(name,handler)=>{listeners[name]=handler;}},
    setInterval:()=>{},createReconciliationUI:()=>({submit:async()=>false}),createCustomersUI:()=>({submit:async()=>false,click:async()=>false}),
    FormData:class{constructor(form){return new Map(form.fields);}},
    testApi:async(path,body)=>{requests.push({path,body});},
    testClose:()=>{closed++;},testRefresh:async()=>{refreshed++;},testToast:()=>{}
  });
  runInContext(source,context);
  runInContext('api=testApi;closeModal=testClose;refresh=testRefresh;toast=testToast;',context);
  const form={id:{value:'25'},getAttribute:name=>name==='id'?'product-form':null,
    setAttribute:()=>{},removeAttribute:()=>{},
    fields:[['id','25'],['name','Café americano'],['category','Cafés'],['price','12'],['inventoryMode','untracked'],['active','on']],
    querySelectorAll:()=>{throw new Error('Sales-only mode must ignore recipe inputs');}};
  const submitter={disabled:false};let prevented=false;
  await listeners.submit({target:form,submitter,preventDefault:()=>{prevented=true;}});
  assert.equal(prevented,true);assert.equal(requests.length,1);
  assert.deepEqual(JSON.parse(JSON.stringify(requests[0])),{path:'/products',body:{id:25,name:'Café americano',category:'Cafés',price:1200,inventoryMode:'untracked',active:true,recipe:[]}});
  assert.equal(closed,1);assert.equal(refreshed,1);assert.equal(submitter.disabled,false);assert.equal(errors.hidden,true);
});
