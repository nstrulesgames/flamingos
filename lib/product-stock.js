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
