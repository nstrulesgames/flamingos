// Client menu, version 2 (October 2026, owner's feedback after the first day).
// Everything is counted in whole units: no recipes, no liters.
// - Bolos: one stock per type (agua, leche, fruta); flavors are not tracked.
// - Escarchas: sold and counted by cup size; cups are restocked by full package.
// - Ready-made food (sandwiches, empanadas, sweets) has its own unit stock.
// - Made-to-order items (hamburguesa, cafés, batidos) only record the sale.
// Prices are centavos.
export const menuVersion='flamingo-client-menu-2026-10-v2';
export const menuCategories=['Comida','Bebidas frías','Cafés','Batidos','Escarchas','Bolos'];
const item=(key,name,category,price,art,extra={})=>({key,name,category,price,art,description:'',group:name,variant:'',stockKind:'unit',...extra});
const slug=v=>v.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-');

export const clientMenu=[
  ...[
    ['Sandwich mixto',1200,'sandwich'],['Sandwich mixto integral',1200,'sandwich'],
    ['Empanada de queso',600,'empanada'],['Empanada integral',800,'empanada'],
    ['Hamburguesa express',1500,'burger','untracked'],['Brownie',800,'brownie'],['Mini brownie',300,'brownie'],
    ['Alfajor',600,'cookie'],['Galletas',600,'cookie'],['Mini galletas',300,'cookie']
  ].map(([name,price,art,stockKind='unit'])=>item(slug(name),name,'Comida',price,art,{stockKind})),
  ...[
    ['Coca-Cola',300,500,'cola'],['Coca-Cola',500,700,'cola'],['Agua Vital',600,600,'water'],
    ['Aquarius',300,500,'soda'],['Del Valle',300,500,'juice'],['Sante',500,900,'soda'],['Sante',1000,1400,'soda'],
    ['Powerade',500,900,'soda'],['Powerade',1000,1300,'soda'],['Malta',null,900,'cola'],
    ['Black',null,900,'cola'],['Rush',null,1300,'soda'],['Sfrut',null,700,'juice'],['Agua con gas',null,700,'water']
  ].map(([brand,ml,price,art])=>{const size=ml===1000?'1 L':ml?`${ml} ml`:'';const name=`${brand}${size?' '+size:''}`;return item(slug(name),name,'Bebidas frías',price,art,{group:brand,variant:size,size});}),
  ...[
    ['Café americano',1200],['Café con leche',1500],['Café frío',1500],['Capuchino',1500],['Frapuchino',1800],['Latte frío',1600]
  ].map(([name,price])=>item(slug(name),name,'Cafés',price,'coffee',{stockKind:'untracked'})),
  ...[['Batido de proteína con agua',2200],['Batido de proteína con leche',2500]].map(([name,price])=>item(slug(name),name,'Batidos',price,'shake',{stockKind:'untracked'})),
  // One cup = one sale. Small and medium cups come in packages of 100; large, 50.
  // Version 1 escarcha stock was mix in ml; it cannot become cups and is only archived.
  ...[[250,500,100],[300,700,100],[500,1000,50]].map(([ml,price,pack])=>item(`escarcha-${ml}-ml`,`Escarcha ${ml} ml`,'Escarchas',price,'slush',{
    group:'Escarcha',variant:`${ml} ml`,size:`${ml} ml`,description:`Vaso de ${ml} ml`,
    stockName:`Vaso de escarcha ${ml} ml`,packSize:pack
  })),
  // Version 1 tracked each flavor. Its stock moves into the single stock of the type.
  ...[
    ['agua',250,['Menta','Grosella']],['leche',400,['Frutilla','Chocolate','Vainilla','Coco']],['fruta',350,['Maracuyá','Copoazú','Tamarindo','Mocochinchi']]
  ].map(([base,price,flavors])=>item(`bolo-de-${base}`,`Bolo de ${base}`,'Bolos',price,'bolo',{
    mergeFrom:flavors.map(f=>`bolo-${base}-${slug(f)}`)
  }))
];
