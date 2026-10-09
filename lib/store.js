import { DatabaseSync } from 'node:sqlite';
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { clientMenu, menuCategories, menuVersion } from './menu.js';

export class AppError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
export const assert = (value, message, status = 400) => { if (!value) throw new AppError(message, status); };
export function integer(value, name, min = 0, max = 100000000) {
  assert(Number.isSafeInteger(value) && value >= min && value <= max, `${name}: valor inválido.`);
  return value;
}
export function str(value, name, max = 120) {
  assert(typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max, `${name}: campo obligatorio (máximo ${max} caracteres).`);
  return value.trim();
}
export function loginIdentifier(value) {
  const identifier = str(value, 'Correo o usuario', 254).toLowerCase();
  if (!identifier.includes('@')) {
    assert(identifier.length <= 40 && /^[a-z0-9._-]+$/.test(identifier), 'Usa un correo válido o un usuario con letras sin acentos, números, punto o guion.');
    return identifier;
  }
  const parts = identifier.split('@'), [local, domain] = parts;
  assert(parts.length === 2 && local.length <= 64 && /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local)
    && !local.startsWith('.') && !local.endsWith('.') && !local.includes('..')
    && domain.includes('.') && domain.split('.').every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)), 'Ingresa un correo electrónico válido.');
  return identifier;
}
const hash = value => createHash('sha256').update(value).digest('hex');
function passwordHash(password) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
function passwordMatches(password, saved) {
  const [salt, digest] = String(saved).split(':');
  const expected = Buffer.from(digest || '', 'hex');
  return expected.length === 64 && timingSafeEqual(scryptSync(password, salt, 64), expected);
}
export const categories = [...menuCategories,'Hamburguesas','Bebidas','Helados','Snacks'];
const products = [
  ['Clásica Flamingo', 'Hamburguesas', 2200, 'burger', 'Pan suave, carne y vegetales'],
  ['Doble con queso', 'Hamburguesas', 3200, 'double', 'Doble carne, doble sabor'],
  ['Hamburguesa crispy', 'Hamburguesas', 2600, 'crispy', 'Pollo crocante y salsa de la casa'],
  ['Papas fritas', 'Snacks', 1200, 'fries', 'Doradas, crujientes y recién hechas'],
  ['Coca-Cola 500 ml', 'Bebidas', 800, 'cola', 'Bien fría, como te gusta'],
  ['Sprite 500 ml', 'Bebidas', 800, 'soda', 'Un toque fresco de limón'],
  ['Agua mineral', 'Bebidas', 500, 'water', 'Botella personal · 600 ml'],
  ['Helado de vainilla', 'Helados', 1000, 'icecream', 'Un clásico para endulzar el día'],
  ['Helado de chocolate', 'Helados', 1200, 'chocolate', 'Cremoso e irresistible'],
  ['Escarcha de fresa', 'Escarchas', 1500, 'slush', 'Frutal, helada y refrescante'],
  ['Escarcha de maracuyá', 'Escarchas', 1500, 'yellow', 'Tu pausa tropical'],
  ['Nuggets de pollo', 'Snacks', 1800, 'nuggets', '6 unidades con salsa']
];

export function createStore(path, { demo = false, catalog = 'client' } = {}) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,name TEXT NOT NULL,username TEXT UNIQUE NOT NULL,password TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('admin','cashier')),active INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id INTEGER REFERENCES users(id),expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS inventory(id INTEGER PRIMARY KEY,name TEXT NOT NULL,unit TEXT NOT NULL DEFAULT 'ud',stock INTEGER NOT NULL DEFAULT 0 CHECK(stock>=0),minimum INTEGER NOT NULL DEFAULT 5);
    CREATE TABLE IF NOT EXISTS products(id INTEGER PRIMARY KEY,name TEXT NOT NULL,category TEXT NOT NULL,price INTEGER NOT NULL CHECK(price>0),art TEXT NOT NULL,description TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS recipes(product_id INTEGER REFERENCES products(id),item_id INTEGER REFERENCES inventory(id),quantity INTEGER NOT NULL CHECK(quantity>0),PRIMARY KEY(product_id,item_id));
    CREATE TABLE IF NOT EXISTS shifts(id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),opened_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),closed_at TEXT,opening_cash INTEGER NOT NULL,expected_cash INTEGER,counted_cash INTEGER,cash_difference INTEGER,notes TEXT);
    CREATE UNIQUE INDEX IF NOT EXISTS one_open_shift ON shifts((1)) WHERE closed_at IS NULL;
    CREATE TABLE IF NOT EXISTS sales(id INTEGER PRIMARY KEY,request_id TEXT UNIQUE NOT NULL,shift_id INTEGER NOT NULL REFERENCES shifts(id),user_id INTEGER NOT NULL REFERENCES users(id),created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),total INTEGER NOT NULL,cash INTEGER NOT NULL,qr INTEGER NOT NULL,card INTEGER NOT NULL,tendered INTEGER NOT NULL,change_due INTEGER NOT NULL,service TEXT NOT NULL,note TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'paid',void_reason TEXT);
    CREATE TABLE IF NOT EXISTS sale_lines(id INTEGER PRIMARY KEY,sale_id INTEGER REFERENCES sales(id),product_id INTEGER REFERENCES products(id),name TEXT NOT NULL,quantity INTEGER NOT NULL,price INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS movements(id INTEGER PRIMARY KEY,item_id INTEGER NOT NULL REFERENCES inventory(id),quantity INTEGER NOT NULL,kind TEXT NOT NULL,user_id INTEGER NOT NULL REFERENCES users(id),shift_id INTEGER REFERENCES shifts(id),sale_id INTEGER REFERENCES sales(id),note TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
    CREATE TABLE IF NOT EXISTS counts(shift_id INTEGER REFERENCES shifts(id),item_id INTEGER REFERENCES inventory(id),expected INTEGER NOT NULL,counted INTEGER NOT NULL,difference INTEGER NOT NULL,PRIMARY KEY(shift_id,item_id));
    CREATE TABLE IF NOT EXISTS shift_stock(shift_id INTEGER REFERENCES shifts(id),item_id INTEGER REFERENCES inventory(id),opening INTEGER NOT NULL,PRIMARY KEY(shift_id,item_id));
    CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY,user_id INTEGER REFERENCES users(id),action TEXT NOT NULL,detail TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
    CREATE TABLE IF NOT EXISTS reconciliations(shift_id INTEGER PRIMARY KEY REFERENCES shifts(id),expected_cash INTEGER NOT NULL,started_by INTEGER NOT NULL REFERENCES users(id),frozen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),approved_by INTEGER REFERENCES users(id),approved_at TEXT,approval_notes TEXT);
    CREATE TABLE IF NOT EXISTS reconciliation_items(shift_id INTEGER REFERENCES reconciliations(shift_id),item_id INTEGER REFERENCES inventory(id),name TEXT NOT NULL,unit TEXT NOT NULL,opening INTEGER NOT NULL,expected INTEGER NOT NULL,PRIMARY KEY(shift_id,item_id));
    CREATE TABLE IF NOT EXISTS declarations(id INTEGER PRIMARY KEY,shift_id INTEGER NOT NULL REFERENCES reconciliations(shift_id),version INTEGER NOT NULL,request_id TEXT UNIQUE NOT NULL,author_id INTEGER NOT NULL REFERENCES users(id),counted_cash INTEGER NOT NULL,notes TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),UNIQUE(shift_id,version));
    CREATE TABLE IF NOT EXISTS declaration_items(declaration_id INTEGER REFERENCES declarations(id),item_id INTEGER REFERENCES inventory(id),quantity INTEGER NOT NULL,PRIMARY KEY(declaration_id,item_id));
    CREATE TABLE IF NOT EXISTS recount_requests(id INTEGER PRIMARY KEY,shift_id INTEGER NOT NULL REFERENCES reconciliations(shift_id),version INTEGER NOT NULL,requested_by INTEGER NOT NULL REFERENCES users(id),reason TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),UNIQUE(shift_id,version));
    CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS customers(id INTEGER PRIMARY KEY,name TEXT NOT NULL,phone TEXT NOT NULL DEFAULT '',balance INTEGER NOT NULL DEFAULT 0 CHECK(balance>=0),active INTEGER NOT NULL DEFAULT 1,created_by INTEGER NOT NULL REFERENCES users(id),created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
    CREATE UNIQUE INDEX IF NOT EXISTS customers_name_idx ON customers(lower(name));
    CREATE TABLE IF NOT EXISTS credit_movements(id INTEGER PRIMARY KEY,customer_id INTEGER NOT NULL REFERENCES customers(id),amount INTEGER NOT NULL CHECK(amount<>0),kind TEXT NOT NULL,method TEXT NOT NULL,request_id TEXT UNIQUE,sale_id INTEGER REFERENCES sales(id),shift_id INTEGER REFERENCES shifts(id),user_id INTEGER NOT NULL REFERENCES users(id),note TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
  `);
  // Additive migration: legacy shifts, sales and approved counts are preserved.
  db.exec('BEGIN IMMEDIATE');
  try {
    const columns=db.prepare('PRAGMA table_info(shifts)').all().map(c=>c.name);
    if(!columns.includes('stage')) db.exec("ALTER TABLE shifts ADD COLUMN stage TEXT NOT NULL DEFAULT 'open'");
    if(!columns.includes('count_version')) db.exec('ALTER TABLE shifts ADD COLUMN count_version INTEGER NOT NULL DEFAULT 0');
    if(!columns.includes('opening_confirmed_at')) db.exec('ALTER TABLE shifts ADD COLUMN opening_confirmed_at TEXT');
    const productColumns=db.prepare('PRAGMA table_info(products)').all().map(c=>c.name);
    for(const [name,type] of [['menu_key','TEXT'],['group_name',"TEXT NOT NULL DEFAULT ''"],['variant',"TEXT NOT NULL DEFAULT ''"],['size',"TEXT NOT NULL DEFAULT ''"],['flavor',"TEXT NOT NULL DEFAULT ''"],['inventory_mode',"TEXT NOT NULL DEFAULT 'recipe'"]]){
      if(!productColumns.includes(name))db.exec(`ALTER TABLE products ADD COLUMN ${name} ${type}`);
    }
    const inventoryColumns=db.prepare('PRAGMA table_info(inventory)').all().map(c=>c.name);
    if(!inventoryColumns.includes('active'))db.exec('ALTER TABLE inventory ADD COLUMN active INTEGER NOT NULL DEFAULT 1');
    if(!inventoryColumns.includes('pack_size'))db.exec('ALTER TABLE inventory ADD COLUMN pack_size INTEGER NOT NULL DEFAULT 1 CHECK(pack_size>=1)');
    const saleColumns=db.prepare('PRAGMA table_info(sales)').all().map(c=>c.name);
    if(!saleColumns.includes('customer_id'))db.exec('ALTER TABLE sales ADD COLUMN customer_id INTEGER REFERENCES customers(id)');
    if(!saleColumns.includes('credit'))db.exec('ALTER TABLE sales ADD COLUMN credit INTEGER NOT NULL DEFAULT 0');
    if(!saleColumns.includes('change_credit'))db.exec('ALTER TABLE sales ADD COLUMN change_credit INTEGER NOT NULL DEFAULT 0');
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS unique_menu_key ON products(menu_key) WHERE menu_key IS NOT NULL');
    db.exec("UPDATE shifts SET stage='closed' WHERE closed_at IS NOT NULL AND stage='open'");
    db.exec('COMMIT');
  } catch(error) { db.exec('ROLLBACK'); db.close(); throw error; }
  const one = (sql, ...args) => db.prepare(sql).get(...args);
  const all = (sql, ...args) => db.prepare(sql).all(...args);
  const run = (sql, ...args) => db.prepare(sql).run(...args);
  function tx(fn) {
    db.exec('BEGIN IMMEDIATE');
    try { const value = fn(); db.exec('COMMIT'); return value; } catch (e) { db.exec('ROLLBACK'); throw e; }
  }
  function audit(user, action, detail) { run('INSERT INTO audit(user_id,action,detail) VALUES(?,?,?)', user.id, action, detail); }
  function admin(user) { assert(user.role === 'admin', 'Solo el propietario puede realizar esta acción.', 403); }
  function activeShift(user, requireOwner = true) {
    const shift = one('SELECT * FROM shifts WHERE closed_at IS NULL');
    assert(shift, 'Abre un turno antes de registrar ventas, reposiciones o mermas.', 409);
    if (requireOwner) assert(shift.user_id === user.id, 'El turno pertenece a otro cajero. Inicia sesión con su usuario o cierra el turno.', 403);
    return shift;
  }
  function operationsOpen(shift = one('SELECT * FROM shifts WHERE closed_at IS NULL')) {
    assert(!shift || shift.stage==='open','El turno está en arqueo. Ventas, reposiciones, mermas y anulaciones están pausadas hasta la aprobación.',409);
  }
  function specifiedShift(user,body) {
    const shift=activeShift(user,false);
    assert(body.shiftId===shift.id,'El turno cambió. Actualiza la pantalla.',409);
    return shift;
  }
  function validateCounts(counts,items) {
    assert(Array.isArray(counts)&&counts.length===items.length&&counts.every(c=>c&&typeof c==='object')&&new Set(counts.map(c=>c.id)).size===items.length,'Cuenta todos los productos e insumos una sola vez.');
    for(const item of items) {
      const count=counts.find(c=>c.id===item.item_id);
      assert(count,`Falta contar ${item.name}.`); integer(count.quantity,`Conteo de ${item.name}`);
    }
  }
  function move(itemId, quantity, kind, userId, shiftId, saleId, note) {
    const item = one('SELECT * FROM inventory WHERE id=?', itemId);
    assert(item && item.stock + quantity >= 0, `Stock insuficiente: ${item?.name ?? 'producto inexistente'}.`, 409);
    run('UPDATE inventory SET stock=stock+? WHERE id=?', quantity, itemId);
    run('INSERT INTO movements(item_id,quantity,kind,user_id,shift_id,sale_id,note) VALUES(?,?,?,?,?,?,?)', itemId, quantity, kind, userId, shiftId, saleId, note);
  }
  // ---- Saldo a favor: a ledger per customer plus a cached balance that never goes negative.
  const bs=v=>`Bs ${(v/100).toFixed(2).replace('.',',')}`;
  function creditMove(customerId,amount,kind,method,user,{saleId=null,shiftId=null,note='',requestId=null}={}) {
    const customer=one('SELECT * FROM customers WHERE id=?',customerId);
    assert(customer,'Cliente inexistente.',404);
    assert(customer.balance+amount>=0,kind==='void'?`${customer.name} ya usó ese saldo (le quedan ${bs(customer.balance)}). No se puede revertir.`:`Saldo insuficiente: ${customer.name} tiene ${bs(customer.balance)} a favor.`,409);
    run('UPDATE customers SET balance=balance+? WHERE id=?',amount,customerId);
    run('INSERT INTO credit_movements(customer_id,amount,kind,method,request_id,sale_id,shift_id,user_id,note) VALUES(?,?,?,?,?,?,?,?,?)',customerId,amount,kind,method,requestId,saleId,shiftId,user.id,note);
  }
  function addCustomer(user,body) {
    const name=str(body?.name,'Nombre del cliente',80),phone=typeof body?.phone==='string'?body.phone.trim().slice(0,30):'';
    assert(!one('SELECT id FROM customers WHERE lower(name)=lower(?)',name),'Ya existe un cliente con ese nombre. Búscalo en la lista.',409);
    const id=Number(run('INSERT INTO customers(name,phone,created_by) VALUES(?,?,?)',name,phone,user.id).lastInsertRowid);
    audit(user,'customer_created',`${id}: ${name}`);
    return {id,name,phone,balance:0,active:1};
  }
  function saleCustomer(user,body) {
    if(body.customerId!==undefined&&body.customerId!==null){
      integer(body.customerId,'Cliente',1);
      const customer=one('SELECT id FROM customers WHERE id=? AND active=1',body.customerId);
      assert(customer,'Cliente inexistente.',404); return customer.id;
    }
    return body.newCustomer?addCustomer(user,body.newCustomer).id:null;
  }
  // Cash in the drawer: opening fund + cash applied to valid sales + cash moved through customer balances.
  function expectedCash(shift) {
    return shift.opening_cash+one("SELECT COALESCE(SUM(cash),0) v FROM sales WHERE shift_id=? AND status='paid'",shift.id).v
      +one("SELECT COALESCE(SUM(amount),0) v FROM credit_movements WHERE shift_id=? AND method='cash'",shift.id).v;
  }
  function addUser(body, actor) {
    const name = str(body.name, 'Nombre');
    const username = loginIdentifier(body.username);
    const password = str(body.password, 'Contraseña', 128);
    assert(password.length >= 10, 'La contraseña debe tener al menos 10 caracteres.');
    assert(['admin','cashier'].includes(body.role), 'Rol inválido.');
    assert(!one('SELECT id FROM users WHERE username=?', username), 'Ese usuario ya existe.', 409);
    const id = Number(run('INSERT INTO users(name,username,password,role) VALUES(?,?,?,?)', name, username, passwordHash(password), body.role).lastInsertRowid);
    if (actor) audit(actor, 'user_created', username);
    return { id, name, username, role: body.role };
  }
  function seedCatalog(stock) {
    for (const [name,category,price,art,description] of products) {
      const id = Number(run('INSERT INTO products(name,category,price,art,description) VALUES(?,?,?,?,?)',name,category,price,art,description).lastInsertRowid);
      const item = Number(run('INSERT INTO inventory(name,stock,minimum) VALUES(?,?,?)', name, stock, 8).lastInsertRowid);
      run('INSERT INTO recipes VALUES(?,?,1)', id, item);
    }
    // Prepared burgers consume actual portions, not an imaginary finished burger stock.
    for (const [name,unit,quantity] of [['Pan de hamburguesa','ud',stock*3],['Carne de hamburguesa','porción',stock*3],['Queso','lonja',stock*3],['Vegetales y salsa','porción',stock*3],['Pollo crispy','porción',stock]]) {
      run('INSERT INTO inventory(name,unit,stock,minimum) VALUES(?,?,?,8)',name,unit,quantity);
    }
    run('DELETE FROM recipes WHERE product_id IN (1,2,3)');
    run('DELETE FROM inventory WHERE id IN (1,2,3)');
    for (const [p,i,q] of [[1,13,1],[1,14,1],[1,16,1],[2,13,1],[2,14,2],[2,15,2],[2,16,1],[3,13,1],[3,17,1],[3,16,1]]) run('INSERT INTO recipes VALUES(?,?,?)',p,i,q);
  }
  // Installs or upgrades the client menu. Runs once per menu version, only between shifts.
  // Products already created by a previous version keep the owner's edits (price, name,
  // active flag, configured recipes); only products still pending configuration change.
  function installClientMenu(stock) {
    const oldCatalog=all('SELECT * FROM products');
    const legacy=oldCatalog.length===products.length&&products.every(([name])=>oldCatalog.some(p=>p.name===name));
    if(legacy){run('UPDATE products SET active=0');run('UPDATE inventory SET active=0');}
    const actor=one("SELECT id FROM users WHERE role='admin' ORDER BY id LIMIT 1");
    for(const entry of clientMenu){
      let product=one('SELECT * FROM products WHERE menu_key=?',entry.key),configure=!product;
      if(product) configure=product.inventory_mode==='recipe'&&!one('SELECT 1 x FROM recipes WHERE product_id=?',product.id);
      else {
        const match=one('SELECT * FROM products WHERE menu_key IS NULL AND name=?',entry.name);
        if(match){run('UPDATE products SET name=?,category=?,price=?,art=?,description=?,active=1,menu_key=?,group_name=?,variant=?,size=?,flavor=? WHERE id=?',entry.name,entry.category,entry.price,entry.art,entry.description,entry.key,entry.group,entry.variant,entry.size||'',entry.flavor||'',match.id);run('DELETE FROM recipes WHERE product_id=?',match.id);product=match;}
        else product={id:Number(run('INSERT INTO products(name,category,price,art,description,menu_key,group_name,variant,size,flavor) VALUES(?,?,?,?,?,?,?,?,?,?)',entry.name,entry.category,entry.price,entry.art,entry.description,entry.key,entry.group,entry.variant,entry.size||'',entry.flavor||'').lastInsertRowid)};
      }
      if(!configure)continue;
      if(entry.stockKind==='untracked'){run("UPDATE products SET inventory_mode='untracked' WHERE id=?",product.id);continue;}
      run("UPDATE products SET inventory_mode='recipe' WHERE id=?",product.id);
      const name=entry.stockName||entry.name,packSize=entry.packSize||1;
      const sources=entry.mergeFrom?all(`SELECT DISTINCT i.* FROM inventory i JOIN recipes r ON r.item_id=i.id JOIN products p ON p.id=r.product_id WHERE p.menu_key IN (${entry.mergeFrom.map(()=>'?').join(',')}) AND i.name<>?`,...entry.mergeFrom,name):[];
      let inventory=one('SELECT * FROM inventory WHERE name=?',name);
      if(inventory)run('UPDATE inventory SET active=1,pack_size=? WHERE id=?',packSize,inventory.id);
      else inventory={id:Number(run('INSERT INTO inventory(name,unit,stock,minimum,pack_size) VALUES(?,?,?,?,?)',name,'ud',sources.length?0:stock,packSize>1?20:5,packSize).lastInsertRowid)};
      // Flavor stock moves into the type's single stock, with traceable movements.
      for(const source of sources.filter(s=>s.stock>0)){
        assert(actor,'No hay propietario para registrar el traspaso de stock.',409);
        move(source.id,-source.stock,'transfer',actor.id,null,null,`Unificado en ${name}`);
        move(inventory.id,source.stock,'transfer',actor.id,null,null,`Desde ${source.name}`);
      }
      run('INSERT INTO recipes VALUES(?,?,1)',product.id,inventory.id);
    }
    const keys=clientMenu.map(e=>e.key);
    run(`UPDATE products SET active=0 WHERE menu_key IS NOT NULL AND menu_key NOT IN (${keys.map(()=>'?').join(',')})`,...keys);
    // Stock that only served archived menu products leaves sales and counts.
    run('UPDATE inventory SET active=0 WHERE active=1 AND id IN (SELECT r.item_id FROM recipes r JOIN products p ON p.id=r.product_id WHERE p.active=0 AND p.menu_key IS NOT NULL) AND id NOT IN (SELECT r.item_id FROM recipes r JOIN products p ON p.id=r.product_id WHERE p.active=1)');
    run('INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)','client_menu_version',menuVersion);
  }
  const menuOutdated=()=>catalog==='client'&&one("SELECT value FROM settings WHERE key='client_menu_version'")?.value!==menuVersion;
  if (demo && !one('SELECT id FROM users LIMIT 1')) tx(() => {
    addUser({name:'Valentina',username:'admin',password:'Flamingo2026!',role:'admin'});
    addUser({name:'Camila',username:'camila',password:'Flamingo2026!',role:'cashier'});
    if(catalog==='legacy'){seedCatalog(35);run('UPDATE inventory SET stock=6 WHERE id=8');}
    else installClientMenu(35);
  });
  // An additive, one-time import; never change a running shift or reapply over edits.
  if(menuOutdated()&&one('SELECT id FROM users LIMIT 1')&&!one('SELECT id FROM shifts WHERE closed_at IS NULL'))tx(()=>installClientMenu(demo?35:0));

  const api = {
    db, categories,
    isSetup: () => !!one('SELECT id FROM users LIMIT 1'),
    setup(body) {
      assert(!api.isSetup(), 'El negocio ya está configurado.', 409);
      return tx(() => { const user=addUser({...body,role:'admin'}); if(catalog==='legacy')seedCatalog(0);else installClientMenu(0);return user; });
    },
    login(body) {
      const username = loginIdentifier(body.username);
      const password = str(body.password,'Contraseña',128);
      const user = one('SELECT * FROM users WHERE username=? AND active=1', username);
      assert(user && passwordMatches(password,user.password), 'Usuario o contraseña incorrectos.', 401);
      const token=randomBytes(32).toString('hex');
      run('DELETE FROM sessions WHERE expires<?', Date.now());
      run('INSERT INTO sessions VALUES(?,?,?)',hash(token),user.id,Date.now()+12*60*60*1000);
      return { token, user:{id:user.id,name:user.name,role:user.role,username:user.username} };
    },
    authenticate(token) { return token ? one('SELECT u.id,u.name,u.username,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>? AND u.active=1',hash(token),Date.now()) : null; },
    logout(token) { if(token) run('DELETE FROM sessions WHERE token=?',hash(token)); },
    snapshot(user) {
      const shift = one('SELECT s.*,u.name cashier FROM shifts s JOIN users u ON s.user_id=u.id WHERE closed_at IS NULL');
      const allInventory=all('SELECT * FROM inventory ORDER BY name'),inventory=allInventory.filter(i=>i.active);
      const recipes=all('SELECT * FROM recipes');
      const catalog=all('SELECT * FROM products ORDER BY id').map(p=>{
        const recipe=recipes.filter(r=>r.product_id===p.id);
        const available=p.inventory_mode==='untracked'?null:recipe.length ? Math.min(...recipe.map(r=>Math.floor(allInventory.find(i=>i.id===r.item_id)?.stock/r.quantity))) : 0;
        return {...p,recipe,available};
      });
      const sales = user.role==='admin' ? all('SELECT s.*,u.name cashier FROM sales s JOIN users u ON u.id=s.user_id ORDER BY s.id DESC LIMIT 500') : all('SELECT s.*,u.name cashier FROM sales s JOIN users u ON u.id=s.user_id WHERE s.user_id=? ORDER BY s.id DESC LIMIT 100',user.id);
      const shifts = user.role==='admin' ? all('SELECT s.*,u.name cashier FROM shifts s JOIN users u ON u.id=s.user_id ORDER BY s.id DESC LIMIT 60') : all('SELECT s.*,u.name cashier FROM shifts s JOIN users u ON u.id=s.user_id WHERE s.user_id=? ORDER BY s.id DESC LIMIT 30',user.id);
      const summaries=all("SELECT shift_id,COUNT(*) tickets,COALESCE(SUM(total),0) total,COALESCE(SUM(cash),0) cash,COALESCE(SUM(qr),0) qr,COALESCE(SUM(card),0) card,COALESCE(SUM(credit),0) credit FROM sales WHERE status='paid' GROUP BY shift_id");
      const enriched=shifts.map(s=>({...s,...summaries.find(v=>v.shift_id===s.id)}));
      const movements=user.role==='admin' ? all('SELECT m.*,i.name item,u.name actor FROM movements m JOIN inventory i ON m.item_id=i.id JOIN users u ON m.user_id=u.id ORDER BY m.id DESC LIMIT 100') : [];
      const blind=user.role!=='admin'&&!!shift&&shift.stage!=='open';
      const safeShift=s=>!s?null:blind&&s.id===shift.id?{id:s.id,user_id:s.user_id,cashier:s.cashier,stage:s.stage,count_version:s.count_version,opened_at:s.opened_at,closed_at:s.closed_at,opening_confirmed_at:s.opening_confirmed_at}:s;
      const visibleCategories=categories.filter(c=>catalog.some(p=>p.active&&p.category===c));
      return { user,categories:visibleCategories,products:blind?catalog.map(p=>({...p,available:null})):catalog,inventory:blind?inventory.map(({stock,...i})=>i):inventory,sales,shifts:enriched.map(safeShift),shift:safeShift(shift ? enriched.find(s=>s.id===shift.id) ?? shift : null),movements,users:user.role==='admin'?all('SELECT id,name,username,role,active FROM users'):[],customers:all('SELECT id,name,phone,balance,active FROM customers ORDER BY lower(name)'),demo,blind };
    },
    openShift(user, body) {
      assert(!one('SELECT id FROM shifts WHERE closed_at IS NULL'),'Ya hay un turno abierto. Ciérralo antes de abrir otro.',409);
      integer(body.openingCash,'Fondo de caja');
      return tx(()=>{
        assert(!one('SELECT id FROM shifts WHERE closed_at IS NULL'),'Ya hay un turno abierto. Ciérralo antes de abrir otro.',409);
        assert(body.confirmed===true,'Confirma que recibiste el inventario inicial.');
        const initial=all('SELECT id item_id,name,stock FROM inventory WHERE active=1');
        validateCounts(body.openingStock,initial);
        for(const item of initial) assert(body.openingStock.find(c=>c.id===item.item_id).quantity===item.stock,'El inventario inicial cambió. Actualiza y vuelve a confirmar la entrega.',409);
        const id=Number(run("INSERT INTO shifts(user_id,opening_cash,opening_confirmed_at) VALUES(?,?,strftime('%Y-%m-%dT%H:%M:%fZ','now'))",user.id,body.openingCash).lastInsertRowid);
        run('INSERT INTO shift_stock SELECT ?,id,stock FROM inventory WHERE active=1',id);
        audit(user,'shift_opened',String(id));
        return {id};
      });
    },
    sale(user, body) {
      const requestId=str(body.requestId,'Identificador',80);
      const previous=one('SELECT * FROM sales WHERE request_id=?',requestId);
      if(previous) { assert(previous.user_id===user.id,'Identificador usado.',409); return api.receipt(user,previous.id); }
      return tx(()=>{
        const shift=activeShift(user,user.role!=='admin');
        operationsOpen(shift);
        assert(Array.isArray(body.items)&&body.items.length>0&&body.items.length<=100,'Agrega productos a la orden.');
        const quantities=new Map();
        for(const item of body.items) { integer(item.id,'Producto',1); integer(item.quantity,'Cantidad',1,999); quantities.set(item.id,(quantities.get(item.id)??0)+item.quantity); }
        let total=0; const lines=[], consumption=new Map();
        for(const [id,quantity] of quantities) {
          integer(quantity,'Cantidad',1,999);
          const product=one('SELECT * FROM products WHERE id=? AND active=1',id);
          assert(product,'Producto no disponible.',409);
          const recipe=all('SELECT * FROM recipes WHERE product_id=?',id);
          assert(recipe.length||product.inventory_mode==='untracked','Configura los insumos de este producto.',409);
          total+=product.price*quantity; lines.push({...product,quantity});
          for(const r of recipe) consumption.set(r.item_id,(consumption.get(r.item_id)??0)+r.quantity*quantity);
        }
        integer(total,'Total',1);
        const cash=integer(body.cash??0,'Efectivo'), qr=integer(body.qr??0,'QR'), card=integer(body.card??0,'Tarjeta'), credit=integer(body.credit??0,'Saldo a favor');
        assert(cash+qr+card+credit===total,'Los pagos deben sumar el total exacto.');
        const tendered=integer(body.tendered??cash,'Efectivo recibido');
        assert(tendered>=cash && (cash>0 || tendered===0),'Efectivo recibido insuficiente o inválido.');
        assert(['local','takeaway'].includes(body.service),'Tipo de pedido inválido.');
        const note=typeof body.note==='string'?body.note.trim().slice(0,300):'';
        const changeCredit=body.changeToCredit===true?tendered-cash:0;
        assert(body.changeToCredit!==true||changeCredit>0,'No hay vuelto para guardar como saldo a favor.');
        const customerId=saleCustomer(user,body);
        assert((credit===0&&changeCredit===0)||customerId,'Elige el cliente del saldo a favor.');
        const id=Number(run('INSERT INTO sales(request_id,shift_id,user_id,total,cash,qr,card,tendered,change_due,service,note,customer_id,credit,change_credit) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',requestId,shift.id,user.id,total,cash,qr,card,tendered,tendered-cash,body.service,note,customerId,credit,changeCredit).lastInsertRowid);
        if(credit)creditMove(customerId,-credit,'sale','none',user,{saleId:id,shiftId:shift.id,note:`Venta #${id}`});
        // Change the customer leaves stays in the drawer as their balance.
        if(changeCredit)creditMove(customerId,changeCredit,'change','cash',user,{saleId:id,shiftId:shift.id,note:`Vuelto de la venta #${id}`});
        for(const line of lines) run('INSERT INTO sale_lines(sale_id,product_id,name,quantity,price) VALUES(?,?,?,?,?)',id,line.id,line.name,line.quantity,line.price);
        for(const [itemId,quantity] of consumption) move(itemId,-quantity,'sale',user.id,shift.id,id,`Venta #${id}`);
        return api.receipt(user,id);
      });
    },
    receipt(user,id) {
      const sale=one('SELECT s.*,u.name cashier,c.name customer,c.balance customer_balance FROM sales s JOIN users u ON s.user_id=u.id LEFT JOIN customers c ON c.id=s.customer_id WHERE s.id=?',id);
      assert(sale,'Venta no encontrada.',404);
      assert(user.role==='admin'||sale.user_id===user.id,'No puedes ver esta venta.',403);
      return {...sale,lines:all('SELECT * FROM sale_lines WHERE sale_id=?',id)};
    },
    voidSale(user,id,body) {
      admin(user); const reason=str(body.reason,'Motivo',300);
      return tx(()=>{
        const sale=one('SELECT * FROM sales WHERE id=?',id);
        assert(sale&&sale.status==='paid','Venta inexistente o ya anulada.',409);
        const shift=activeShift(user,false);
        operationsOpen(shift);
        assert(sale.shift_id===shift.id,'Solo se pueden anular ventas del turno abierto.',409);
        for(const m of all("SELECT * FROM movements WHERE sale_id=? AND kind='sale'",id)) move(m.item_id,-m.quantity,'void',user.id,shift.id,id,reason);
        // Balance used comes back; change kept as balance leaves with the voided sale's cash.
        for(const m of all("SELECT * FROM credit_movements WHERE sale_id=? AND kind IN ('sale','change') ORDER BY id DESC",id)) creditMove(m.customer_id,-m.amount,'void',m.method,user,{saleId:id,shiftId:shift.id,note:reason});
        run("UPDATE sales SET status='void',void_reason=? WHERE id=?",reason,id);
        audit(user,'sale_void',`${id}: ${reason}`);
        return {ok:true};
      });
    },
    stockMovement(user,body) {
      assert(['restock','waste'].includes(body.kind),'Tipo de movimiento inválido.');
      integer(body.itemId,'Insumo',1); integer(body.quantity,'Cantidad',1,100000);
      const note=str(body.note,'Motivo / referencia',300);
      // Only the owner writes stock off; workers can only add what physically arrives.
      if(body.kind==='waste')admin(user);
      return tx(()=>{
        const shift=user.role!=='admin'?activeShift(user):one('SELECT * FROM shifts WHERE closed_at IS NULL');
        operationsOpen(shift);
        const item=one('SELECT * FROM inventory WHERE id=? AND active=1',body.itemId);
        assert(item,'Insumo inexistente.',404);
        if(body.kind==='restock')assert(body.quantity%item.pack_size===0,`${item.name} se repone por paquete completo de ${item.pack_size} unidades.`);
        move(body.itemId,body.kind==='waste'?-body.quantity:body.quantity,body.kind,user.id,shift?.id??null,null,note); return {ok:true};
      });
    },
    startCount(user,body) {
      return tx(()=>{
        const shift=specifiedShift(user,body);
        assert(user.role==='admin'||user.id===shift.user_id,'Solo el responsable del turno o el propietario puede iniciar el arqueo.',403);
        if(shift.stage!=='open') return {id:shift.id,stage:shift.stage}; // Safe retry after a lost response.
        const expected=expectedCash(shift);
        run('INSERT INTO reconciliations(shift_id,expected_cash,started_by) VALUES(?,?,?)',shift.id,expected,user.id);
        run('INSERT INTO reconciliation_items SELECT ?,i.id,i.name,i.unit,ss.opening,i.stock FROM inventory i JOIN shift_stock ss ON ss.item_id=i.id AND ss.shift_id=?',shift.id,shift.id);
        run("UPDATE shifts SET stage='counting',count_version=1 WHERE id=?",shift.id);
        audit(user,'count_started',String(shift.id));return {id:shift.id,stage:'counting'};
      });
    },
    submitCount(user,body) {
      return tx(()=>{
        const requestId=str(body.requestId,'Identificador',80);
        const previous=one('SELECT * FROM declarations WHERE request_id=?',requestId);
        if(previous) {
          assert(previous.author_id===user.id&&previous.shift_id===body.shiftId&&previous.version===body.version,'Identificador ya utilizado.',409);
          return {id:previous.id,version:previous.version};
        }
        const shift=specifiedShift(user,body);
        // The owner may count in place of an absent worker so the register is never stuck.
        const onBehalf=shift.user_id!==user.id;
        assert(!onBehalf||user.role==='admin','Solo el trabajador responsable del turno puede enviar su declaración.',403);
        assert(shift.stage!=='open','Primero inicia el arqueo.',409);
        assert(['counting','recount'].includes(shift.stage),'La declaración ya fue enviada. El propietario debe pedir un reconteo para corregirla.',409);
        assert(body.version===shift.count_version,'La versión del conteo cambió. Actualiza la pantalla.',409);
        integer(body.countedCash,'Efectivo contado');
        const items=all('SELECT * FROM reconciliation_items WHERE shift_id=?',shift.id);
        validateCounts(body.counts,items);
        const notes=typeof body.notes==='string'?body.notes.trim().slice(0,500):'';
        if(shift.stage==='recount')str(notes,'Explicación del reconteo',500);
        if(onBehalf)str(notes,'Motivo por el que cuentas en lugar del responsable',500);
        const id=Number(run('INSERT INTO declarations(shift_id,version,request_id,author_id,counted_cash,notes) VALUES(?,?,?,?,?,?)',shift.id,body.version,requestId,user.id,body.countedCash,notes).lastInsertRowid);
        for(const c of body.counts)run('INSERT INTO declaration_items VALUES(?,?,?)',id,c.id,c.quantity);
        run("UPDATE shifts SET stage='review' WHERE id=?",shift.id);
        audit(user,onBehalf?'count_submitted_on_behalf':'count_submitted',`${shift.id}: declaración ${id}, versión ${body.version}`);
        return {id,version:body.version};
      });
    },
    requestRecount(user,body) {
      admin(user);const reason=str(body.reason,'Motivo del reconteo',500);
      return tx(()=>{
        const shift=specifiedShift(user,body);
        const latest=one('SELECT * FROM declarations WHERE shift_id=? ORDER BY version DESC LIMIT 1',shift.id);
        assert(shift.stage==='review'&&latest?.id===body.declarationId,'El arqueo cambió. Revisa la última declaración.',409);
        const version=shift.count_version+1;
        run('INSERT INTO recount_requests(shift_id,version,requested_by,reason) VALUES(?,?,?,?)',shift.id,version,user.id,reason);
        run("UPDATE shifts SET stage='recount',count_version=? WHERE id=?",version,shift.id);
        audit(user,'recount_requested',`${shift.id}: ${reason}`);return {version};
      });
    },
    approveCount(user,body) {
      admin(user);
      return tx(()=>{
        const shift=one('SELECT * FROM shifts WHERE id=?',body.shiftId??null);
        assert(shift,'Turno no encontrado.',404);
        const latest=one('SELECT * FROM declarations WHERE shift_id=? ORDER BY version DESC LIMIT 1',shift.id);
        assert(latest&&latest.id===body.declarationId,'Revisa la última declaración antes de aprobar.',409);
        const baseline=one('SELECT * FROM reconciliations WHERE shift_id=?',shift.id);
        if(shift.stage==='closed')return {id:shift.id,expectedCash:shift.expected_cash,difference:shift.cash_difference};
        assert(shift.stage==='review','Primero debe enviarse la declaración del trabajador.',409);
        const items=all('SELECT r.*,d.quantity,i.stock FROM reconciliation_items r JOIN declaration_items d ON d.item_id=r.item_id AND d.declaration_id=? JOIN inventory i ON i.id=r.item_id WHERE r.shift_id=?',latest.id,shift.id);
        assert(items.length===one('SELECT COUNT(*) n FROM inventory WHERE active=1').n,'El inventario cambió. Requiere revisión antes de aprobar.',409);
        for(const item of items)assert(item.expected===item.stock,'El inventario cambió después de iniciar el conteo. No se puede aprobar.',409);
        const expected=expectedCash(shift);
        assert(expected===baseline.expected_cash,'El efectivo esperado cambió después del corte.',409);
        const note=typeof body.notes==='string'?body.notes.trim().slice(0,500):'';
        if(items.some(i=>i.quantity!==i.expected)||latest.counted_cash!==expected)str(note,'Explica las diferencias antes de aprobar',500);
        for(const item of items){
          run('INSERT INTO counts VALUES(?,?,?,?,?)',shift.id,item.item_id,item.expected,item.quantity,item.quantity-item.expected);
          if(item.quantity!==item.expected)move(item.item_id,item.quantity-item.expected,'count',user.id,shift.id,null,note);
        }
        run("UPDATE reconciliations SET approved_by=?,approved_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),approval_notes=? WHERE shift_id=?",user.id,note,shift.id);
        run("UPDATE shifts SET stage='closed',closed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),expected_cash=?,counted_cash=?,cash_difference=?,notes=? WHERE id=?",expected,latest.counted_cash,latest.counted_cash-expected,note,shift.id);
        audit(user,'count_approved',`${shift.id}: declaración ${latest.id}`);
        // A menu update waiting for the shift to end is applied right after the closure.
        if(menuOutdated())installClientMenu(0);
        return {id:shift.id,expectedCash:expected,difference:latest.counted_cash-expected};
      });
    },
    // Keep the old endpoint safe: it can no longer submit counts and close in one step.
    closeShift(user,body) { return api.approveCount(user,body); },
    shiftDetail(user,id) {
      const shift=one('SELECT s.*,u.name cashier FROM shifts s JOIN users u ON u.id=s.user_id WHERE s.id=?',id); assert(shift,'Turno no encontrado.',404);
      assert(user.role==='admin'||user.id===shift.user_id,'No puedes consultar este turno.',403);
      const baseline=one('SELECT r.*,u.name approver FROM reconciliations r LEFT JOIN users u ON u.id=r.approved_by WHERE r.shift_id=?',id);
      const items=all('SELECT * FROM reconciliation_items WHERE shift_id=? ORDER BY name',id);
      const declarations=all('SELECT d.*,u.name author FROM declarations d JOIN users u ON u.id=d.author_id WHERE d.shift_id=? ORDER BY d.version DESC',id).map(d=>({...d,items:all('SELECT item_id,quantity FROM declaration_items WHERE declaration_id=?',d.id)}));
      const requests=all('SELECT r.*,u.name requester FROM recount_requests r JOIN users u ON u.id=r.requested_by WHERE r.shift_id=? ORDER BY version DESC',id);
      // Expected balances never cross the API boundary for workers during reconciliation.
      if(user.role!=='admin')return {id:shift.id,user_id:shift.user_id,cashier:shift.cashier,stage:shift.stage,count_version:shift.count_version,opened_at:shift.opened_at,closed_at:shift.closed_at,items:items.map(({item_id,name,unit})=>({item_id,name,unit})),declarations:declarations.map(({request_id,...d})=>d),requests,frozen_at:baseline?.frozen_at};
      return {...shift,baseline,items,declarations,requests,counts:all('SELECT c.*,i.name,i.unit,ss.opening FROM counts c JOIN inventory i ON i.id=c.item_id LEFT JOIN shift_stock ss ON ss.item_id=c.item_id AND ss.shift_id=c.shift_id WHERE c.shift_id=?',id)};
    },
    addInventory(user,body) {
      admin(user); const shift=one('SELECT * FROM shifts WHERE closed_at IS NULL');
      assert(!shift||shift.stage==='open','Espera a que se apruebe el arqueo para agregar insumos.',409);
      const name=str(body.name,'Nombre'),unit=str(body.unit,'Unidad',20); integer(body.minimum,'Mínimo',0,100000);
      const packSize=integer(body.packSize??1,'Unidades por paquete',1,10000);
      assert(!one('SELECT id FROM inventory WHERE name=? AND active=1',name),'Ya existe un insumo con ese nombre.',409);
      return tx(()=>{
        const id=Number(run('INSERT INTO inventory(name,unit,minimum,pack_size) VALUES(?,?,?,?)',name,unit,body.minimum,packSize).lastInsertRowid);
        // Created at zero mid-shift: the shift's arqueo expects opening 0 + restocks.
        if(shift)run('INSERT INTO shift_stock VALUES(?,?,0)',shift.id,id);
        audit(user,'inventory_created',name); return {id};
      });
    },
    saveProduct(user,body) {
      admin(user); operationsOpen(); const name=str(body.name,'Nombre'),description=typeof body.description==='string'?body.description.slice(0,200):'';
      assert(categories.includes(body.category),'Categoría inválida.'); integer(body.price,'Precio',1,10000000);
      const inventoryMode=body.inventoryMode||'recipe';assert(['recipe','untracked'].includes(inventoryMode),'Control de inventario inválido.');
      assert(Array.isArray(body.recipe)&&body.recipe.length<=30&&(inventoryMode==='untracked'?body.recipe.length===0:body.recipe.length>0),'Asigna al menos un insumo, o elige solo registrar ventas.');
      assert(new Set(body.recipe.map(r=>r.item_id)).size===body.recipe.length,'No repitas insumos en la receta.');
      for(const r of body.recipe) { integer(r.item_id,'Insumo',1); integer(r.quantity,'Cantidad',1,100000); assert(one('SELECT id FROM inventory WHERE id=? AND active=1',r.item_id),'Insumo inexistente.'); }
      const art=['burger','double','crispy','fries','cola','soda','water','icecream','chocolate','slush','yellow','nuggets','sandwich','empanada','brownie','cookie','coffee','shake','juice','bolo'].includes(body.art)?body.art:'burger';
      return tx(()=>{
        let id=body.id;
        if(id) { integer(id,'Producto',1); assert(one('SELECT id FROM products WHERE id=?',id),'Producto inexistente.',404); run('UPDATE products SET name=?,category=?,price=?,description=?,art=?,active=? WHERE id=?',name,body.category,body.price,description,art,body.active===false?0:1,id); run('DELETE FROM recipes WHERE product_id=?',id); }
        else id=Number(run('INSERT INTO products(name,category,price,description,art) VALUES(?,?,?,?,?)',name,body.category,body.price,description,art).lastInsertRowid);
        run('UPDATE products SET inventory_mode=? WHERE id=?',inventoryMode,id);
        for(const r of body.recipe) run('INSERT INTO recipes VALUES(?,?,?)',id,r.item_id,r.quantity);
        audit(user,'product_saved',`${id}: ${name}`); return {id};
      });
    },
    createUser(user,body) { admin(user); return addUser(body,user); },
    createCustomer(user,body) { return tx(()=>addCustomer(user,body)); },
    updateCustomer(user,id,body) {
      admin(user); const customer=one('SELECT * FROM customers WHERE id=?',id); assert(customer,'Cliente inexistente.',404);
      return tx(()=>{
        if(body.name!==undefined){const name=str(body.name,'Nombre del cliente',80);assert(!one('SELECT id FROM customers WHERE lower(name)=lower(?) AND id<>?',name,id),'Ya existe un cliente con ese nombre.',409);run('UPDATE customers SET name=? WHERE id=?',name,id);}
        if(typeof body.phone==='string')run('UPDATE customers SET phone=? WHERE id=?',body.phone.trim().slice(0,30),id);
        if(typeof body.active==='boolean'){assert(body.active||customer.balance===0,'Devuelve o ajusta el saldo antes de desactivar al cliente.',409);run('UPDATE customers SET active=? WHERE id=?',body.active?1:0,id);}
        audit(user,'customer_updated',String(id)); return {ok:true};
      });
    },
    customerDetail(user,id) {
      const customer=one('SELECT id,name,phone,balance,active,created_at FROM customers WHERE id=?',id); assert(customer,'Cliente inexistente.',404);
      return {...customer,movements:all('SELECT m.id,m.amount,m.kind,m.method,m.sale_id,m.note,m.created_at,u.name actor FROM credit_movements m JOIN users u ON u.id=m.user_id WHERE m.customer_id=? ORDER BY m.id DESC LIMIT 100',id)};
    },
    // deposit: the customer leaves money (cash, QR, card). refund: money goes back (from the register or outside it).
    // adjust: owner correction with a reason. Cash movements belong to the open shift and its arqueo.
    creditOperation(user,id,body) {
      assert(['deposit','refund','adjust'].includes(body.kind),'Operación de saldo inválida.');
      if(body.kind!=='deposit')admin(user);
      const requestId=str(body.requestId,'Identificador',80);
      const previous=one('SELECT * FROM credit_movements WHERE request_id=?',requestId);
      if(previous){assert(previous.user_id===user.id&&previous.customer_id===id,'Identificador ya utilizado.',409);return {balance:one('SELECT balance FROM customers WHERE id=?',id).balance};}
      const methods={deposit:['cash','qr','card'],refund:['cash','none'],adjust:['none']}[body.kind],method=body.kind==='adjust'?'none':body.method;
      assert(methods.includes(method),'Medio inválido.');
      const amount=body.kind==='adjust'?integer(body.amount,'Monto',-10000000,10000000):integer(body.amount,'Monto',1,10000000);
      assert(amount!==0,'Monto: valor inválido.');
      const note=body.kind==='deposit'?(typeof body.note==='string'?body.note.trim().slice(0,300):''):str(body.note,'Motivo',300);
      return tx(()=>{
        assert(one('SELECT id FROM customers WHERE id=? AND active=1',id),'Cliente inexistente o inactivo.',404);
        let shift=one('SELECT * FROM shifts WHERE closed_at IS NULL');
        // Workers act only inside their own shift; cash always needs an open register.
        if(user.role!=='admin'||method==='cash')shift=activeShift(user,user.role!=='admin');
        operationsOpen(shift??null);
        creditMove(id,body.kind==='deposit'?amount:body.kind==='refund'?-amount:amount,body.kind,method,user,{shiftId:shift?.id??null,note,requestId});
        audit(user,`credit_${body.kind}`,`${id}: ${amount}`);
        return {balance:one('SELECT balance FROM customers WHERE id=?',id).balance};
      });
    },
    changeOwnPassword(user,body,token) {
      const saved=one('SELECT password FROM users WHERE id=?',user.id);
      assert(passwordMatches(str(body.current,'Contraseña actual',128),saved.password),'La contraseña actual no es correcta.',403);
      const pwd=str(body.password,'Contraseña nueva',128); assert(pwd.length>=10,'Usa al menos 10 caracteres.');
      return tx(()=>{
        run('UPDATE users SET password=? WHERE id=?',passwordHash(pwd),user.id);
        // Other devices must sign in again; this one stays signed in.
        run('DELETE FROM sessions WHERE user_id=? AND token<>?',user.id,hash(token||''));
        audit(user,'password_changed',String(user.id)); return {ok:true};
      });
    },
    updateUser(user,id,body) {
      admin(user); assert(id!==user.id,'Para tu propia cuenta usa «Cambiar mi contraseña». No puedes desactivarte.');
      assert(one('SELECT id FROM users WHERE id=?',id),'Usuario inexistente.',404);
      if(body.active===false)assert(!one('SELECT id FROM shifts WHERE user_id=? AND closed_at IS NULL',id),'Este cajero tiene un turno abierto. Haz su arqueo (puedes contar en su lugar) y luego desactívalo.',409);
      if(body.password!==undefined) { const pwd=str(body.password,'Contraseña',128); assert(pwd.length>=10,'Usa al menos 10 caracteres.'); run('UPDATE users SET password=? WHERE id=?',passwordHash(pwd),id); }
      if(typeof body.active==='boolean') run('UPDATE users SET active=? WHERE id=?',body.active?1:0,id);
      run('DELETE FROM sessions WHERE user_id=?',id); audit(user,'user_updated',String(id)); return {ok:true};
    },
    report(user,from,to) {
      admin(user);
      assert(/^\d{4}-\d{2}-\d{2}$/.test(from)&&/^\d{4}-\d{2}-\d{2}$/.test(to)&&from<=to,'Rango de fechas inválido.');
      // Bolivia (UTC-4), no daylight-saving time. Sales are stored in UTC.
      const start=`${from}T04:00:00.000Z`, end=new Date(`${to}T04:00:00.000Z`); assert(!isNaN(end),'Fecha inválida.'); end.setUTCDate(end.getUTCDate()+1);
      const endIso=end.toISOString();
      const totals=one("SELECT COUNT(*) tickets,COALESCE(SUM(total),0) total,COALESCE(SUM(cash),0) cash,COALESCE(SUM(qr),0) qr,COALESCE(SUM(card),0) card,COALESCE(SUM(credit),0) credit FROM sales WHERE status='paid' AND created_at>=? AND created_at<?",start,endIso);
      const top=all("SELECT l.name,SUM(l.quantity) quantity,SUM(l.price*l.quantity) total FROM sale_lines l JOIN sales s ON s.id=l.sale_id WHERE s.status='paid' AND s.created_at>=? AND s.created_at<? GROUP BY l.product_id,l.name ORDER BY total DESC LIMIT 6",start,endIso);
      const hours=all("SELECT strftime('%H',created_at,'-4 hours') hour,SUM(total) total FROM sales WHERE status='paid' AND created_at>=? AND created_at<? GROUP BY hour",start,endIso);
      const cashiers=all("SELECT u.name,COUNT(*) tickets,SUM(s.total) total FROM sales s JOIN users u ON u.id=s.user_id WHERE s.status='paid' AND s.created_at>=? AND s.created_at<? GROUP BY u.id ORDER BY total DESC",start,endIso);
      const credit=one('SELECT COALESCE(SUM(balance),0) owed,COUNT(*) FILTER (WHERE balance>0) customers FROM customers');
      return {totals,top,hours,cashiers,from,to,credit};
    },
    close:()=>db.close()
  };
  return api;
}
