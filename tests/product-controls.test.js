import test from 'node:test';
import assert from 'node:assert/strict';
import {uiHarness,snapshot} from './helpers/ui-harness.js';

const sandwich={id:1,name:'Sandwich mixto',category:'Comida',price:1200,active:1,inventory_mode:'recipe',stock_mode:'unit',stock_item_id:10,recipe:[{item_id:10,quantity:1}]};
const inventory=[{id:10,name:'Sandwich mixto',unit:'ud',stock:14,minimum:3,pack_size:6,active:1},{id:20,name:'Sobres de té',unit:'ud',stock:50,active:1}];
const rows=recipe=>recipe.map(r=>({querySelector:s=>({value:String(s==='select'?r.item_id:r.quantity)})}));
function harness(products=[sandwich]){return uiHarness({state:snapshot({products,inventory})});}

test('the unified tracked control preserves the exclusive stock and its alert and package settings',async()=>{
  const h=harness(),f=h.form('product-form',[['id','1'],['name','Sandwich mixto'],['category','Comida'],['price','12'],['inventoryMode','tracked'],['minimum','3'],['packSize','6'],['active','on']],rows(sandwich.recipe));
  await h.listeners.submit(f.event);
  assert.equal(h.requests.length,1);const body=h.requests[0].body;
  assert.equal(body.inventoryMode,'unit');assert.equal(body.minimum,3);assert.equal(body.packSize,6);assert.equal(body.recipe.length,0);
});

test('editing an associated existence submits the new link instead of silently restoring the old exclusive stock',async()=>{
  const h=harness(),f=h.form('product-form',[['id','1'],['name','Sandwich mixto'],['category','Comida'],['price','12'],['inventoryMode','tracked'],['active','on']],rows([{item_id:20,quantity:2}]));
  await h.listeners.submit(f.event);const body=h.requests[0].body;
  assert.equal(body.inventoryMode,'recipe');assert.deepEqual(JSON.parse(JSON.stringify(body.recipe)),[{item_id:20,quantity:2}]);assert(!('minimum' in body));
});

test('shared stock remains shared when saving price under the single tracked choice',async()=>{
  const tea={...sandwich,id:2,name:'Té caliente',stock_mode:'linked',stock_item_id:null,recipe:[{item_id:20,quantity:1}]};
  const h=harness([tea]),f=h.form('product-form',[['id','2'],['name','Té caliente'],['category','Cafés'],['price','7'],['inventoryMode','tracked'],['active','on']],rows(tea.recipe));
  await h.listeners.submit(f.event);assert.equal(h.requests[0].body.inventoryMode,'recipe');assert.equal(h.requests[0].body.recipe[0].item_id,20);
});

test('new products can create their own stock or reuse a registered existence',async()=>{
  for(const setup of ['unit','recipe']){
    const h=harness(),f=h.form('product-form',[['name','Nuevo'],['category','Comida'],['price','10'],['inventoryMode','tracked'],['stockSetup',setup],['minimum','5'],['packSize','1'],['active','on']],rows([{item_id:10,quantity:1}]));
    if(setup==='unit')f.element.querySelectorAll=()=>{throw Error('Creating stock must not read the hidden association');};
    await h.listeners.submit(f.event);assert.equal(h.requests[0].body.inventoryMode,setup);assert.equal(h.requests[0].body.recipe.length,setup==='unit'?0:1);
  }
});

test('sales-only ignores hidden links and re-enabling stock requires the explicit setup choice',async()=>{
  const p={...sandwich,inventory_mode:'untracked',stock_mode:'untracked',recipe:[]};
  const h=harness([p]);let f=h.form('product-form',[['id','1'],['name',p.name],['category','Comida'],['price','12'],['inventoryMode','untracked'],['active','on']]);
  f.element.querySelectorAll=()=>{throw Error('Sales-only must ignore links');};await h.listeners.submit(f.event);assert.equal(h.requests[0].body.inventoryMode,'untracked');
  f=h.form('product-form',[['id','1'],['name',p.name],['category','Comida'],['price','12'],['inventoryMode','tracked'],['stockSetup','recipe'],['active','on']],rows([{item_id:20,quantity:1}]));
  await h.listeners.submit(f.event);assert.equal(h.requests[1].body.inventoryMode,'recipe');assert.equal(h.requests[1].body.recipe[0].item_id,20);
});

test('stock explanation uses the actual balance and marks shared stock without duplicating it',()=>{
  const tea={...sandwich,id:2,name:'Té caliente',stock_mode:'linked',recipe:[{item_id:20,quantity:1}]},cold={...tea,id:3,name:'Té frío'};
  const h=harness([tea,cold]);
  const text=h.run('stockConfigurationDescription([{item_id:20,quantity:1}])');
  assert.match(text,/Stock actual: 50 ud/);assert.match(text,/deja 49 ud/);assert.match(text,/Saldo compartido/);assert.match(text,/Se cuenta una sola vez/);
});
