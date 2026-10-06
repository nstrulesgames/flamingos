export const normalizeSearch=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export function menuGroups(products,{category='Todos',search=''}={}){
  const query=normalizeSearch(search),groups=new Map();
  for(const product of products){
    if(!product.active||(category!=='Todos'&&product.category!==category)||!normalizeSearch(`${product.name} ${product.group_name} ${product.variant} ${product.description}`).includes(query))continue;
    const name=product.group_name||product.name,key=`${product.category}:${name}`;
    if(!groups.has(key))groups.set(key,{key,name,category:product.category,art:product.art,products:[]});
    groups.get(key).products.push(product);
  }
  const categories=['Comida','Bebidas frías','Cafés','Batidos','Escarchas','Bolos'];
  return [...groups.values()].sort((a,b)=>categories.indexOf(a.category)-categories.indexOf(b.category)).map(group=>({...group,products:group.products.sort((a,b)=>a.size?.includes('ml')&&b.size?.includes('ml')?parseInt(a.size)-parseInt(b.size):0)}));
}
export function maximumQuantity(product,cart,inventory){
  if(product.inventory_mode==='untracked')return 999;
  if(!product.recipe?.length)return 0;
  return Math.max(0,Math.min(...product.recipe.map(ingredient=>{
    const stock=inventory.find(i=>i.id===ingredient.item_id)?.stock||0;
    const reserved=cart.filter(line=>line.id!==product.id).reduce((sum,line)=>sum+(line.recipe?.find(r=>r.item_id===ingredient.item_id)?.quantity||0)*line.quantity,0);
    return Math.floor((stock-reserved)/ingredient.quantity);
  })));
}
