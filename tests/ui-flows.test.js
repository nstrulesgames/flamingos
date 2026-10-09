import test from 'node:test';
import assert from 'node:assert/strict';
import {uiHarness,snapshot,product} from './helpers/ui-harness.js';

function renderSpies(h){
  const calls=[];h.context.renderSpy=name=>calls.push(name);
  h.run("renderPOS=()=>renderSpy('pos');renderProducts=()=>renderSpy('products');renderCart=()=>renderSpy('cart');renderLiveContent=()=>renderSpy('content');");
  return calls;
}
test('POS polling runs with a closed cart dialog and notices a remotely started count',async()=>{
  const h=uiHarness(),calls=renderSpies(h);
  h.elements.set('dialog',{open:false});
  h.context.testApi=async()=>snapshot({shift:{id:1,user_id:2,stage:'counting'}});
  await h.ticks[0]();
  assert.deepEqual(calls,['pos']);assert.equal(h.run('state.shift.stage'),'counting');
});
test('polling waits while an order or form is open',async()=>{
  const h=uiHarness(),calls=renderSpies(h);h.elements.set('dialog[open]',{});
  await h.ticks[0]();assert.equal(h.requests.length,0);assert.deepEqual(calls,[]);
});
test('a late background response cannot replace a newly opened form or a different screen',async()=>{
  for(const change of ['modal','navigation']){
    const h=uiHarness(),calls=renderSpies(h);let finish;
    h.context.testApi=()=>new Promise(resolve=>{finish=resolve;});
    const pending=h.ticks[0]();
    if(change==='modal')h.elements.set('dialog[open]',{});else h.run("view='inventory'");
    finish(snapshot({shift:{id:1,user_id:2,stage:'counting'}}));await pending;
    assert.deepEqual(calls,[]);assert.equal(h.run('state.shift.stage'),'open');
  }
});
test('unchanged inventory does not reset its filters or collapse history',async()=>{
  const h=uiHarness({view:'inventory'}),calls=renderSpies(h);
  await h.ticks[0]();assert.deepEqual(calls,[]);
});
test('changed inventory preserves search values, the pending filter and expanded movement history',()=>{
  const h=uiHarness({view:'inventory'});let rendered=false,filtered='',pendingClicks=0;
  const oldInput={id:'inventory-search',value:'Coca-Cola'},newInput={value:'',dispatchEvent:()=>{filtered=newInput.value;}};
  const oldDetail={querySelector:()=>({textContent:'Últimos movimientos'})},newDetail={open:false,querySelector:oldDetail.querySelector};
  const root={querySelectorAll:selector=>selector==='input[type="search"]'?[oldInput]:selector==='details[open]'?[oldDetail]:rendered?[newDetail]:[]};
  h.elements.set('#content',root);h.elements.set('#recipe-pending',{getAttribute:()=> 'true'});
  h.context.testRenderContent=()=>{rendered=true;h.elements.set('#inventory-search',newInput);h.elements.set('#recipe-pending',{click:()=>{pendingClicks++;}});};
  h.run('renderContent=testRenderContent;renderLiveContent();');
  assert.equal(filtered,'Coca-Cola');assert.equal(pendingClicks,1);assert.equal(newDetail.open,true);
});
test('a live catalog change updates order prices and removes discontinued products without changing remaining quantities',()=>{
  const h=uiHarness({state:snapshot({products:[{...product,price:1500}]})});
  h.context.originalProduct=product;h.run('cart=[{...originalProduct,quantity:2},{...originalProduct,id:99,quantity:1}];syncCartWithCatalog();');
  assert.equal(h.run('cart.length'),1);assert.equal(h.run('cart[0].quantity'),2);assert.equal(h.run('cartTotal()'),3000);
  assert.match(h.toasts[0].message,/menú cambió/);
});
test('minus still reduces an order after stock has dropped below its reserved quantity',()=>{
  const tracked={...product,inventory_mode:'recipe',recipe:[{item_id:1,quantity:1}]};
  const h=uiHarness({state:snapshot({products:[tracked],inventory:[{id:1,stock:2}]})});
  h.context.tracked=tracked;h.run('cart=[{...tracked,quantity:5}];renderCart=()=>{};');
  assert.equal(h.run('addProduct(25,-1)'),true);assert.equal(h.run('cart[0].quantity'),4);
  assert.equal(h.run('addProduct(25,1)'),false);assert.equal(h.run('cart[0].quantity'),4);
});
test('repeated submit events during one save send only one request',async()=>{
  const h=uiHarness();let finish,started;
  const ready=new Promise(resolve=>{started=resolve;});
  h.context.testApi=async(path,body)=>{h.requests.push({path,body});started();await new Promise(resolve=>{finish=resolve;});};
  const f=h.form('product-form',[['id','25'],['name','Café americano'],['category','Cafés'],['price','12'],['inventoryMode','untracked'],['active','on']]);
  const first=h.listeners.submit(f.event),second=h.listeners.submit(f.event);
  await second;await ready;assert.equal(h.requests.length,1);assert.equal(f.submit.disabled,true);
  assert.equal(f.element.getAttribute('aria-busy'),'true');finish();await first;
  assert.equal(h.closed,1);assert.equal(f.submit.disabled,false);assert.equal(f.element.getAttribute('aria-busy'),null);
});
test('a failed screen refresh after saving is reported as a saved operation',async()=>{
  const h=uiHarness();h.context.testRefresh=async()=>{throw new Error('No connection');};
  const f=h.form('inventory-form',[['name','Pulpa'],['unit','g'],['minimum','5']]);
  await h.listeners.submit(f.event);
  assert.equal(h.requests.length,1);assert.equal(h.closed,1);assert.match(h.toasts[0].message,/Guardado correctamente.*No pudimos actualizar/);assert.equal(h.error.hidden,true);
});
test('closing is blocked during a save or an uncertain payment',()=>{
  const h=uiHarness();h.elements.set('dialog.modal[open]',{querySelector:()=>({})});
  assert.equal(h.run('canDismissModal()'),false);assert.match(h.toasts.at(-1).message,/Estamos guardando/);
  h.run('pendingSale={requestId:"same-request"}');
  assert.equal(h.run('canDismissModal()'),false);assert.match(h.toasts.at(-1).message,/operación pendiente/);
});
test('a malformed server reply preserves the same payment for retry, even when browser storage is blocked',async()=>{
  const h=uiHarness({storageBlocked:true});h.context.originalProduct=product;
  h.run('cart=[{...originalProduct,quantity:1}];');
  let attempted=0;
  h.context.fetch=async(url,options)=>{
    h.requests.push({url,body:JSON.parse(options.body)});attempted++;
    return {status:200,ok:true,json:async()=>{if(attempted===1)throw new Error('Unexpected HTML');return {id:1,total:1200};}};
  };
  // Restore the app's real fetch wrapper after the harness installs its API spy.
  h.run('api=originalApi;');
  const controls=[{disabled:false}],f=h.form('payment-form',[['tendered','12']],controls);
  await h.listeners.submit(f.event);
  const requestId=h.run('pendingSale.requestId');assert.equal(h.requests.length,1);assert.equal(f.submit.disabled,false);assert.match(h.error.textContent,/Mantén esta ventana abierta/);
  await h.listeners.submit(f.event);
  assert.equal(h.requests.length,2);assert.equal(h.requests[1].body.requestId,requestId);assert.deepEqual(h.requests[1].body,h.requests[0].body);
  assert.equal(h.run('pendingSale'),null);assert.equal(h.run('cart.length'),0);assert.equal(h.receipts.length,1);
});
test('keyboard search works when the cart dialog exists but is closed',()=>{
  const h=uiHarness();let focused=false,prevented=false;
  h.elements.set('dialog',{open:false});h.elements.set('#product-search',{focus:()=>{focused=true;}});
  h.listeners.keydown({key:'/',preventDefault:()=>{prevented=true;}});
  assert.equal(focused,true);assert.equal(prevented,true);
});

test('an uncertain restock cannot be submitted again before the worker verifies its result',async()=>{
  const h=uiHarness();h.context.testApi=async(path,body)=>{h.requests.push({path,body});throw new Error('Response lost');};
  const f=h.form('movement-form',[['kind','restock'],['itemId','1'],['quantity','12'],['note','Entrega']]);
  f.element.elements={quantity:{dataset:{factor:'1'}}};
  await h.listeners.submit(f.event);await h.listeners.submit(f.event);
  assert.equal(h.requests.length,1);assert.equal(f.submit.disabled,true);assert.match(h.error.textContent,/podría haberse guardado/);
  assert.equal(h.run('canDismissModal()'),true);
});

test('only the owner writes waste off; both stock actions pause during the count',()=>{
  const h=uiHarness({state:snapshot({user:{id:1,role:'admin'},shift:null})});
  assert.equal(h.run('canRestock()'),true);assert.equal(h.run('canWaste()'),true);
  h.run('state.user={id:2,role:"cashier"};state.shift={id:1,user_id:2,stage:"open"};');
  assert.equal(h.run('canWaste()'),false);
  h.run('state.shift.user_id=3;');assert.equal(h.run('canWaste()'),false);
  h.run('state.user.role="admin";state.shift.stage="counting";');assert.equal(h.run('canWaste()'),false);assert.equal(h.run('canRestock()'),false);
});

test('New sale from a historical receipt returns to the POS',async()=>{
  const h=uiHarness({view:'sales'});let rendered=false;
  h.context.renderSpy=()=>{rendered=true;};h.run('render=renderSpy;');
  const button={disabled:false,dataset:{action:'new-sale'},closest:()=>null};
  await h.listeners.click({target:{closest:()=>button}});
  assert.equal(h.run('view'),'pos');assert.equal(h.closed,1);assert.equal(rendered,true);
});

test('a custom report returning after navigation does not write into the new screen',async()=>{
  const h=uiHarness({view:'dashboard'});let finish,started;
  const ready=new Promise(resolve=>{started=resolve;});
  h.context.reportDeferred=()=>new Promise(resolve=>{finish=resolve;started();});h.run('loadReport=reportDeferred;');
  const f=h.form('report-range',[['from','2026-10-01'],['to','2026-10-08']]);
  const pending=h.listeners.submit(f.event);await ready;
  h.run('view="inventory"');finish();await pending;
  assert.equal(h.error.hidden,true);assert.equal(f.submit.disabled,false);assert.equal(h.run('view'),'inventory');
});

test('a refresh returning after logout cannot restore the previous user',async()=>{
  const h=uiHarness();let finish;h.context.testApi=()=>new Promise(resolve=>{finish=resolve;});h.run('refresh=originalRefresh;');
  const pending=h.run('refresh()');h.run('state=null;');finish(snapshot());
  await assert.rejects(pending,/sesión cambió/);assert.equal(h.run('state'),null);
});
