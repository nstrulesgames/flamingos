import {clientMenu} from './menu.js';
// Recognize finished products without guessing how many portions an ingredient makes.
export function productStockItem(product,products,recipes,inventory){
  if(product.inventory_mode==='untracked')return null;
  const rows=recipes.filter(r=>r.product_id===product.id);
  if(rows.length!==1||rows[0].quantity!==1)return null;
  const item=inventory.find(i=>i.id===rows[0].item_id);
  if(!item||!['ud','unidad','unidades'].includes(item.unit.toLowerCase().trim()))return null;
  const users=products.filter(p=>p.active&&p.inventory_mode!=='untracked'&&recipes.some(r=>r.product_id===p.id&&r.item_id===item.id));
  return users.length<=1?item:null;
}

export function productsOnlyPlan(products,recipes,inventory){
  const tracked=[],salesOnly=[];
  for(const product of products.filter(p=>p.active&&p.inventory_mode!=='untracked')){
    if(clientMenu.some(entry=>entry.key===product.menu_key&&entry.stockKind==='untracked')){
      salesOnly.push({product,recipe:recipes.filter(r=>r.product_id===product.id)});continue;
    }
    const item=productStockItem(product,products,recipes,inventory);
    if(item)tracked.push({product,item});else salesOnly.push({product,recipe:recipes.filter(r=>r.product_id===product.id)});
  }
  const ids=new Set(tracked.map(v=>v.item.id));
  return {tracked,salesOnly,retire:inventory.filter(i=>i.active&&!ids.has(i.id))};
}
