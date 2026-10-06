// Transcribed from the client's two menu photographs (October 2026).
// Prices are centavos; the photos do not provide recipes or opening stock.
export const menuVersion='flamingo-client-menu-2026-10';
export const menuCategories=['Comida','Bebidas frías','Cafés','Batidos','Escarchas','Bolos'];
export const escarchaFlavors=['Maracuyá','Copoazú','Grosella','Mocochinchi','Tamarindo','Menta'];
export const escarchaSizes=[{name:'Chica',ml:250,price:500},{name:'Mediana',ml:300,price:700},{name:'Grande',ml:500,price:1000}];
const item=(key,name,category,price,art,extra={})=>({key,name,category,price,art,description:'',group:name,variant:'',...extra});
const slug=v=>v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-');
export const clientMenu=[
  ...[
    ['Sandwich mixto',1200,'sandwich'],['Sandwich mixto integral',1200,'sandwich'],
    ['Empanada de queso',600,'empanada'],['Empanada integral',800,'empanada'],
    ['Hamburguesa express',1500,'burger'],['Brownie',800,'brownie'],['Mini brownie',300,'brownie'],
    ['Alfajor',600,'cookie'],['Galletas',600,'cookie'],['Mini galletas',300,'cookie']
  ].map(([name,price,art])=>item(slug(name),name,'Comida',price,art,{stockKind:['Sandwich mixto','Sandwich mixto integral','Hamburguesa express'].includes(name)?'prepared':'unit'})),
  ...[
    ['Coca-Cola',300,500,'cola'],['Coca-Cola',500,700,'cola'],['Agua Vital',600,600,'water'],
    ['Aquarius',300,500,'soda'],['Del Valle',300,500,'juice'],['Sante',500,900,'soda'],['Sante',1000,1400,'soda'],
    ['Powerade',500,900,'soda'],['Powerade',1000,1300,'soda'],['Malta',null,900,'cola'],
    ['Black',null,900,'cola'],['Rush',null,1300,'soda'],['Sfrut',null,700,'juice'],['Agua con gas',null,700,'water']
  ].map(([brand,ml,price,art])=>{const size=ml===1000?'1 L':ml?`${ml} ml`:'';const name=`${brand}${size?' '+size:''}`;return item(slug(name),name,'Bebidas frías',price,art,{group:brand,variant:size,size,stockKind:'unit'});}),
  ...[
    ['Café americano',1200],['Café con leche',1500],['Café frío',1500],['Capuchino',1500],['Frapuchino',1800],['Latte frío',1600]
  ].map(([name,price])=>item(slug(name),name,'Cafés',price,'coffee',{stockKind:'prepared'})),
  ...[['Batido de proteína con agua',2200],['Batido de proteína con leche',2500]].map(([name,price])=>item(slug(name),name,'Batidos',price,'shake',{stockKind:'prepared'})),
  ...escarchaSizes.flatMap(size=>escarchaFlavors.map(flavor=>item(`escarcha-${slug(size.name)}-${slug(flavor)}`,`Escarcha ${size.name.toLowerCase()} · ${flavor}`,'Escarchas',size.price,'slush',{
    group:'Escarcha',variant:`${size.name} · ${flavor}`,size:size.name,flavor,description:`${size.ml} ml`,stockKind:'escarcha',ml:size.ml
  }))),
  ...[
    ['Agua',250,['Menta','Grosella']],['Leche',400,['Frutilla','Chocolate','Vainilla','Coco']],['Fruta',350,['Maracuyá','Copoazú','Tamarindo','Mocochinchi']]
  ].flatMap(([base,price,flavors])=>flavors.map(flavor=>item(`bolo-${slug(base)}-${slug(flavor)}`,`Bolo de ${base.toLowerCase()} · ${flavor}`,'Bolos',price,'bolo',{
    group:`Bolos de ${base.toLowerCase()}`,variant:flavor,flavor,stockKind:'unit'
  })))
];
