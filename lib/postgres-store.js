import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { clientMenu, menuVersion } from './menu.js';
import { assert, integer, str, categories, loginIdentifier } from './store.js';
import { createPostgresDatabase } from './postgres-db.js';
import { servingPrice } from '../public/pricing.js';
import {productStockItem} from './product-stock.js';
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
export async function createPostgresStore(connectionString, { pool } = {}) {
    const database = createPostgresDatabase(connectionString, pool);
    const { one, all, run, transaction: tx } = database;
    const demo = false;
    async function audit(user, action, detail) { (await run("INSERT INTO audit(user_id,action,detail) VALUES(?,?,?) RETURNING id", user.id, action, detail)); }
    function admin(user) { assert(user.role === 'admin', 'Solo el propietario puede realizar esta acción.', 403); }
    async function activeShift(user, requireOwner = true) {
        const shift = (await one('SELECT * FROM shifts WHERE closed_at IS NULL'));
        assert(shift, 'Abre un turno antes de registrar ventas, reposiciones o mermas.', 409);
        if (requireOwner)
            assert(shift.user_id === user.id, 'El turno pertenece a otro cajero. Inicia sesión con su usuario o cierra el turno.', 403);
        return shift;
    }
    async function operationsOpen(shift) {
        if (shift === undefined)
            shift = (await one('SELECT * FROM shifts WHERE closed_at IS NULL'));
        assert(!shift || shift.stage === 'open', 'El turno está en arqueo. Ventas, reposiciones, mermas y anulaciones están pausadas hasta la aprobación.', 409);
    }
    async function specifiedShift(user, body) {
        const shift = (await activeShift(user, false));
        assert(body.shiftId === shift.id, 'El turno cambió. Actualiza la pantalla.', 409);
        return shift;
    }
    function validateCounts(counts, items) {
        assert(Array.isArray(counts) && counts.length === items.length && counts.every(c => c && typeof c === 'object') && new Set(counts.map(c => c.id)).size === items.length, 'Cuenta todos los productos e insumos una sola vez.');
        for (const item of items) {
            const count = counts.find(c => c.id === item.item_id);
            assert(count, `Falta contar ${item.name}.`);
            integer(count.quantity, `Conteo de ${item.name}`);
        }
    }
    async function move(itemId, quantity, kind, userId, shiftId, saleId, note) {
        const item = (await one('SELECT * FROM inventory WHERE id=?', itemId));
        assert(item && item.stock + quantity >= 0, `Stock insuficiente: ${item?.name ?? 'producto inexistente'}.`, 409);
        (await run('UPDATE inventory SET stock=stock+? WHERE id=?', quantity, itemId));
        (await run("INSERT INTO movements(item_id,quantity,kind,user_id,shift_id,sale_id,note) VALUES(?,?,?,?,?,?,?) RETURNING id", itemId, quantity, kind, userId, shiftId, saleId, note));
    }
    // Signed customer ledger (mirrors lib/store.js).
    const bs = v => `Bs ${(v / 100).toFixed(2).replace('.', ',')}`;
    async function creditMove(customerId,amount,kind,method,user,{saleId=null,shiftId=null,note='',requestId=null,reversalOf=null}={}) {
    const customer=(await one('SELECT * FROM customers WHERE id=? FOR UPDATE',customerId));
    assert(customer,'Cliente inexistente.',404);
    const next=customer.balance+amount;
    integer(next,'Saldo resultante',-100000000,100000000);
    const canDecrease=['debt','opening_debt','reversal'].includes(kind);
    assert(next>=0||amount>0||canDecrease,kind==='void'?
      customer.name+' ya usó ese saldo. No se puede revertir.':'Saldo insuficiente: '+customer.name+' tiene '+bs(customer.balance)+' a favor.',409);
    if(kind==='debt'){
      const actor=(await one('SELECT role,can_fiado FROM users WHERE id=? AND active=1',user.id));
      assert(actor&&(actor.role==='admin'||actor.can_fiado===1),'No tienes permiso para vender fiado.',403);
      assert(customer.allow_fiado===1,'La propietaria debe habilitar el fiado para este cliente.',409);
      assert(next>=-customer.credit_limit,'Esta venta supera el límite de fiado del cliente.',409);
    }
    const debtPart=['deposit','payment'].includes(kind)?Math.min(amount,Math.max(0,-customer.balance)):0;
    (await run("UPDATE customers SET balance=?,debt_since=CASE WHEN ?>=0 THEN NULL WHEN balance>=0 THEN strftime('%Y-%m-%dT%H:%M:%fZ','now') ELSE debt_since END WHERE id=?",next,next,customerId));
    (await run('INSERT INTO credit_movements(customer_id,amount,kind,method,request_id,sale_id,shift_id,user_id,note,reversal_of,debt_part) VALUES(?,?,?,?,?,?,?,?,?,?,?)',customerId,amount,kind,method,requestId,saleId,shiftId,user.id,note,reversalOf,debtPart));
  }
    async function addCustomer(user, body) {
        const name = str(body?.name, 'Nombre del cliente', 80), phone = typeof body?.phone === 'string' ? body.phone.trim().slice(0, 30) : '';
        assert(!(await one('SELECT id FROM customers WHERE lower(name)=lower(?)', name)), 'Ya existe un cliente con ese nombre. Búscalo en la lista.', 409);
        const id = Number((await run('INSERT INTO customers(name,phone,created_by) VALUES(?,?,?) RETURNING id', name, phone, user.id)).lastInsertRowid);
        await audit(user, 'customer_created', `${id}: ${name}`);
        return { id, name, phone, balance: 0, active: 1 };
    }
    async function saleCustomer(user, body) {
        if (body.customerId !== undefined && body.customerId !== null) {
            integer(body.customerId, 'Cliente', 1);
            const customer = await one('SELECT id FROM customers WHERE id=? AND active=1', body.customerId);
            assert(customer, 'Cliente inexistente.', 404);
            return customer.id;
        }
        return body.newCustomer ? (await addCustomer(user, body.newCustomer)).id : null;
    }
    async function expectedCash(shift) {
        return shift.opening_cash + (await one("SELECT COALESCE(SUM(cash),0) v FROM sales WHERE shift_id=? AND status='paid'", shift.id)).v
            + (await one("SELECT COALESCE(SUM(amount),0) v FROM credit_movements WHERE shift_id=? AND method='cash'", shift.id)).v;
    }
    async function addUser(body, actor) {
        const name = str(body.name, 'Nombre');
        const username = loginIdentifier(body.username);
        const password = str(body.password, 'Contraseña', 128);
        assert(password.length >= 10, 'La contraseña debe tener al menos 10 caracteres.');
        assert(['admin', 'cashier'].includes(body.role), 'Rol inválido.');
        assert(!(await one('SELECT id FROM users WHERE username=?', username)), 'Ese usuario ya existe.', 409);
        const id = Number((await run("INSERT INTO users(name,username,password,role) VALUES(?,?,?,?) RETURNING id", name, username, passwordHash(password), body.role)).lastInsertRowid);
        if(actor&&body.canFiado===true)await run('UPDATE users SET can_fiado=1 WHERE id=?',id);
        if (actor)
            (await audit(actor, 'user_created', username));
        return { id, name, username, role: body.role };
    }
    // Mirrors lib/store.js: one-time menu install/upgrade between shifts, keeping owner edits.
    async function installClientMenu(stock) {
        const actor = await one("SELECT id FROM users WHERE role='admin' ORDER BY id LIMIT 1");
        for (const entry of clientMenu) {
            let product = await one('SELECT * FROM products WHERE menu_key=?', entry.key), configure = !product;
            if (product) configure = product.inventory_mode === 'recipe' && !(await one('SELECT 1 x FROM recipes WHERE product_id=?', product.id));
            else {
                const match = await one('SELECT * FROM products WHERE menu_key IS NULL AND name=?', entry.name);
                if (match) {
                    await run('UPDATE products SET name=?,category=?,price=?,art=?,description=?,active=1,menu_key=?,group_name=?,variant=?,size=?,flavor=? WHERE id=?', entry.name, entry.category, entry.price, entry.art, entry.description, entry.key, entry.group, entry.variant, entry.size || '', entry.flavor || '', match.id);
                    await run('DELETE FROM recipes WHERE product_id=?', match.id);
                    product = match;
                }
                else product = { id: Number((await run('INSERT INTO products(name,category,price,art,description,menu_key,group_name,variant,size,flavor) VALUES(?,?,?,?,?,?,?,?,?,?) RETURNING id', entry.name, entry.category, entry.price, entry.art, entry.description, entry.key, entry.group, entry.variant, entry.size || '', entry.flavor || '')).lastInsertRowid) };
            }
            if (!configure) continue;
            if(entry.manualPrice)await run("UPDATE products SET allow_manual_price=1,pricing_mode='unit' WHERE id=?",product.id);
            if (entry.stockKind === 'untracked') { await run("UPDATE products SET inventory_mode='untracked' WHERE id=?", product.id); continue; }
            await run("UPDATE products SET inventory_mode='recipe' WHERE id=?", product.id);
            const name = entry.stockName || entry.name, packSize = entry.packSize || 1;
            const sources = entry.mergeFrom ? await all(`SELECT DISTINCT i.* FROM inventory i JOIN recipes r ON r.item_id=i.id JOIN products p ON p.id=r.product_id WHERE p.menu_key IN (${entry.mergeFrom.map(() => '?').join(',')}) AND i.name<>? ORDER BY i.id`, ...entry.mergeFrom, name) : [];
            let inventory = await one('SELECT * FROM inventory WHERE name=?', name);
            if (inventory) await run('UPDATE inventory SET active=1,pack_size=? WHERE id=?', packSize, inventory.id);
            else inventory = { id: Number((await run('INSERT INTO inventory(name,unit,stock,minimum,pack_size) VALUES(?,?,?,?,?) RETURNING id', name, 'ud', sources.length ? 0 : stock, packSize > 1 ? 20 : 5, packSize)).lastInsertRowid) };
            for (const source of sources.filter(s => s.stock > 0)) {
                assert(actor, 'No hay propietario para registrar el traspaso de stock.', 409);
                await move(source.id, -source.stock, 'transfer', actor.id, null, null, `Unificado en ${name}`);
                await move(inventory.id, source.stock, 'transfer', actor.id, null, null, `Desde ${source.name}`);
            }
            await run('INSERT INTO recipes VALUES(?,?,1)', product.id, inventory.id);
        }
        const keys = clientMenu.map(e => e.key);
        await run(`UPDATE products SET active=0 WHERE menu_key IS NOT NULL AND menu_key NOT IN (${keys.map(() => '?').join(',')})`, ...keys);
        await run('UPDATE inventory SET active=0 WHERE active=1 AND id IN (SELECT r.item_id FROM recipes r JOIN products p ON p.id=r.product_id WHERE p.active=0 AND p.menu_key IS NOT NULL) AND id NOT IN (SELECT r.item_id FROM recipes r JOIN products p ON p.id=r.product_id WHERE p.active=1)');
        await run('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value', 'client_menu_version', menuVersion);
    }
    const menuOutdated = async () => (await one("SELECT value FROM settings WHERE key='client_menu_version'"))?.value !== menuVersion;
    const api = {
        categories,
        isSetup: async () => !!(await one('SELECT id FROM users LIMIT 1')),
        async setup(body) {
            assert(!(await api.isSetup()), 'El negocio ya está configurado.', 409);
            return (await tx(async () => {
                const user = await addUser({ ...body, role: 'admin' });
                if (await menuOutdated()) await installClientMenu(0);
                return user;
            }));
        },
        async login(body) {
            const username = loginIdentifier(body.username);
            const password = str(body.password, 'Contraseña', 128);
            const user = (await one('SELECT * FROM users WHERE username=? AND active=1', username));
            assert(user && passwordMatches(password, user.password), 'Usuario o contraseña incorrectos.', 401);
            const token = randomBytes(32).toString('hex');
            (await run('DELETE FROM sessions WHERE expires<?', Date.now()));
            (await run('INSERT INTO sessions VALUES(?,?,?)', hash(token), user.id, Date.now() + 12 * 60 * 60 * 1000));
            return { token, user: { id: user.id, name: user.name, role: user.role, can_fiado: user.can_fiado, username: user.username } };
        },
        async authenticate(token) { return token ? (await one('SELECT u.id,u.name,u.username,u.role,u.can_fiado FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>? AND u.active=1', hash(token), Date.now())) : null; },
        async loginGoogle({ email }) {
            const username = loginIdentifier(email);
            assert(username.includes('@'), 'El correo de Google no es válido.', 403);
            const user = await one('SELECT id,name,username,role,can_fiado FROM users WHERE username=? AND active=1', username);
            assert(user, 'Este correo no tiene acceso al negocio. Pide al propietario que lo registre en Equipo.', 403);
            const token = randomBytes(32).toString('hex');
            await run('DELETE FROM sessions WHERE expires<?', Date.now());
            await run('INSERT INTO sessions VALUES(?,?,?)', hash(token), user.id, Date.now() + 12 * 60 * 60 * 1000);
            await audit(user, 'google_login', username);
            return { token, user };
        },
        async logout(token) { if (token)
            (await run('DELETE FROM sessions WHERE token=?', hash(token))); },
        async snapshot(user) {
            const shift = (await one('SELECT s.*,u.name cashier FROM shifts s JOIN users u ON s.user_id=u.id WHERE closed_at IS NULL'));
            const allInventory = (await all('SELECT * FROM inventory ORDER BY name')), inventory = allInventory.filter(i => i.active);
            const recipes = (await all('SELECT * FROM recipes'));
            const productRows=await all('SELECT * FROM products ORDER BY id');
            const catalog = productRows.map(p => {
                const recipe = recipes.filter(r => r.product_id === p.id);
                const available = p.inventory_mode === 'untracked' ? null : recipe.length ? Math.min(...recipe.map(r => Math.floor(allInventory.find(i => i.id === r.item_id)?.stock / r.quantity))) : 0;
                const stock=productStockItem(p,productRows,recipes,allInventory);
                return {...p,recipe,available,stock_mode:p.inventory_mode==='untracked'?'untracked':stock?'unit':'linked',stock_item_id:stock?.id??null};
            });
            const sales = user.role === 'admin' ? (await all('SELECT s.*,u.name cashier FROM sales s JOIN users u ON u.id=s.user_id ORDER BY s.id DESC LIMIT 500')) : (await all('SELECT s.*,u.name cashier FROM sales s JOIN users u ON u.id=s.user_id WHERE s.user_id=? ORDER BY s.id DESC LIMIT 100', user.id));
            const shifts = user.role === 'admin' ? (await all('SELECT s.*,u.name cashier FROM shifts s JOIN users u ON u.id=s.user_id ORDER BY s.id DESC LIMIT 60')) : (await all('SELECT s.*,u.name cashier FROM shifts s JOIN users u ON u.id=s.user_id WHERE s.user_id=? ORDER BY s.id DESC LIMIT 30', user.id));
            const summaries = (await all("SELECT shift_id,COUNT(*) tickets,COALESCE(SUM(total),0) total,COALESCE(SUM(cash),0) cash,COALESCE(SUM(qr),0) qr,COALESCE(SUM(card),0) card,COALESCE(SUM(credit),0) credit,COALESCE(SUM(debt),0) debt FROM sales WHERE status='paid' GROUP BY shift_id"));
            const enriched = shifts.map(s => ({ ...s, ...summaries.find(v => v.shift_id === s.id) }));
            const movements = user.role === 'admin' ? (await all('SELECT m.*,i.name item,u.name actor FROM movements m JOIN inventory i ON m.item_id=i.id JOIN users u ON m.user_id=u.id ORDER BY m.id DESC LIMIT 100')) : [];
            const blind = user.role !== 'admin' && !!shift && shift.stage !== 'open';
            const safeShift = s => !s ? null : blind && s.id === shift.id ? { id: s.id, user_id: s.user_id, cashier: s.cashier, stage: s.stage, count_version: s.count_version, opened_at: s.opened_at, closed_at: s.closed_at, opening_confirmed_at: s.opening_confirmed_at } : s;
            const visibleCategories = categories.filter(c => catalog.some(p => p.active && p.category === c));
            return { user, categories: visibleCategories, products: blind ? catalog.map(p => ({ ...p, available: null })) : catalog, archivedInventory:user.role==='admin'?allInventory.filter(i=>!i.active):[], inventory: blind ? inventory.map(({ stock, ...i }) => i) : inventory, sales, shifts: enriched.map(safeShift), shift: safeShift(shift ? enriched.find(s => s.id === shift.id) ?? shift : null), movements, users: user.role === 'admin' ? (await all('SELECT id,name,username,role,active,can_fiado FROM users')) : [], customers: await all('SELECT id,name,phone,balance,active,allow_fiado,credit_limit,debt_since FROM customers ORDER BY lower(name)'), productsOnlyPending:false,demo, blind };
        },
        async openShift(user, body) {
            assert(!(await one('SELECT id FROM shifts WHERE closed_at IS NULL')), 'Ya hay un turno abierto. Ciérralo antes de abrir otro.', 409);
            integer(body.openingCash, 'Fondo de caja');
            return (await tx(async () => {
                assert(!(await one('SELECT id FROM shifts WHERE closed_at IS NULL')), 'Ya hay un turno abierto. Ciérralo antes de abrir otro.', 409);
                assert(body.confirmed === true, 'Confirma que recibiste el inventario inicial.');
                const initial = (await all('SELECT id item_id,name,stock FROM inventory WHERE active=1'));
                validateCounts(body.openingStock, initial);
                for (const item of initial)
                    assert(body.openingStock.find(c => c.id === item.item_id).quantity === item.stock, 'El inventario inicial cambió. Actualiza y vuelve a confirmar la entrega.', 409);
                const id = Number((await run("INSERT INTO shifts(user_id,opening_cash,opening_confirmed_at) VALUES(?,?,strftime('%Y-%m-%dT%H:%M:%fZ','now')) RETURNING id", user.id, body.openingCash)).lastInsertRowid);
                (await run('INSERT INTO shift_stock SELECT ?,id,stock FROM inventory WHERE active=1', id));
                (await audit(user, 'shift_opened', String(id)));
                return { id };
            }));
        },
        async sale(user, body) {
            const requestId = str(body.requestId, 'Identificador', 80);
            const previous = (await one('SELECT * FROM sales WHERE request_id=?', requestId));
            if (previous) {
                assert(previous.user_id === user.id, 'Identificador usado.', 409);
                return (await api.receipt(user, previous.id));
            }
            return (await tx(async () => {
                const shift = (await activeShift(user, user.role !== 'admin'));
                (await operationsOpen(shift));
                assert(Array.isArray(body.items) && body.items.length > 0 && body.items.length <= 100, 'Agrega productos a la orden.');
                const quantities = new Map(), productQuantities = new Map();
                for (const item of body.items) {
                    assert(item && typeof item === 'object', 'Producto inválido.');
                    integer(item.id, 'Producto', 1);
                    integer(item.quantity, 'Cantidad', 1, 999);
                    const weight=item.weightGrams??null;if(weight!==null)integer(weight,'Peso en gramos',1,100000);
                    const unitPrice=item.unitPrice??null;if(unitPrice!==null)integer(unitPrice,'Importe de la porción',1,10000000);
                    const key=`${item.id}:${weight??0}:${unitPrice??''}`,line=quantities.get(key);
                    quantities.set(key,{id:item.id,quantity:(line?.quantity??0)+item.quantity,weight,unitPrice});
                    productQuantities.set(item.id,(productQuantities.get(item.id)??0)+item.quantity);
                    integer(productQuantities.get(item.id),'Cantidad',1,999);
                }
                let total = 0;
                const lines = [], consumption = new Map();
                for (const {id,quantity,weight,unitPrice} of quantities.values()) {
                    integer(quantity, 'Cantidad', 1, 999);
                    const product = (await one('SELECT * FROM products WHERE id=? AND active=1', id));
                    assert(product, 'Producto no disponible.', 409);
                    assert(product.allow_manual_price?unitPrice!==null:unitPrice===null,product.allow_manual_price?'Ingresa el importe a cobrar por esta porción.':'Este producto no permite precio libre.',409);
                    assert(product.pricing_mode==='weight'?weight!==null:weight===null,'El tipo de cobro cambió o falta el peso. Actualiza el pedido.',409);
                    const price=servingPrice(product,weight,unitPrice);integer(price,'Importe de la porción',1,100000000);
                    const recipe = (await all('SELECT * FROM recipes WHERE product_id=?', id));
                    assert(recipe.length || product.inventory_mode === 'untracked', 'Configura los insumos de este producto.', 409);
                    total += price * quantity;
                    lines.push({ ...product,price,quantity,manual_price:product.allow_manual_price?1:0,weight_grams:weight,weight_price:weight!==null?product.price:null,weight_basis_grams:weight!==null?product.weight_basis_grams:null });
                    for (const r of recipe)
                        consumption.set(r.item_id, (consumption.get(r.item_id) ?? 0) + r.quantity * quantity);
                }
                integer(total, 'Total', 1);
                const cash = integer(body.cash ?? 0, 'Efectivo'), qr = integer(body.qr ?? 0, 'QR'), card = integer(body.card ?? 0, 'Tarjeta'), credit = integer(body.credit ?? 0, 'Saldo a favor');
        const debt=integer(body.debt??0,'Fiado');
                assert(cash + qr + card + credit + debt === total, 'Los pagos deben sumar el total exacto.');
                const tendered = integer(body.tendered ?? cash, 'Efectivo recibido');
                assert(tendered >= cash && (cash > 0 || tendered === 0), 'Efectivo recibido insuficiente o inválido.');
                assert(['local', 'takeaway'].includes(body.service), 'Tipo de pedido inválido.');
                const note = typeof body.note === 'string' ? body.note.trim().slice(0, 300) : '';
                const changeCredit = body.changeToCredit === true ? tendered - cash : 0;
                assert(body.changeToCredit !== true || changeCredit > 0, 'No hay vuelto para guardar como saldo a favor.');
                const customerId = await saleCustomer(user, body);
                assert((credit === 0 && changeCredit === 0 && debt === 0) || customerId, 'Elige el cliente del saldo a favor.');
                const id = Number((await run("INSERT INTO sales(request_id,shift_id,user_id,total,cash,qr,card,tendered,change_due,service,note,customer_id,credit,change_credit,debt) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id", requestId, shift.id, user.id, total, cash, qr, card, tendered, tendered - cash, body.service, note, customerId, credit, changeCredit, debt)).lastInsertRowid);
                assert(!debt||!changeCredit,'No guardes vuelto en una venta fiada.');
                if (credit) await creditMove(customerId, -credit, 'sale', 'none', user, { saleId: id, shiftId: shift.id, note: `Venta #${id}` });
                if (changeCredit) await creditMove(customerId, changeCredit, 'change', 'cash', user, { saleId: id, shiftId: shift.id, note: `Vuelto de la venta #${id}` });
                if(debt)await creditMove(customerId,-debt,'debt','none',user,{saleId:id,shiftId:shift.id,note:'Fiado de la venta #'+id});
                for (const line of lines)
                    (await run("INSERT INTO sale_lines(sale_id,product_id,name,quantity,price,weight_grams,weight_price,weight_basis_grams,manual_price) VALUES(?,?,?,?,?,?,?,?,?) RETURNING id", id, line.id, line.name, line.quantity, line.price,line.weight_grams,line.weight_price,line.weight_basis_grams,line.manual_price));
                for (const [itemId, quantity] of consumption)
                    (await move(itemId, -quantity, 'sale', user.id, shift.id, id, `Venta #${id}`));
                return (await api.receipt(user, id));
            }));
        },
        async receipt(user, id) {
            const sale = (await one('SELECT s.*,u.name cashier,c.name customer,c.balance customer_balance FROM sales s JOIN users u ON s.user_id=u.id LEFT JOIN customers c ON c.id=s.customer_id WHERE s.id=?', id));
            assert(sale, 'Venta no encontrada.', 404);
            assert(user.role === 'admin' || sale.user_id === user.id, 'No puedes ver esta venta.', 403);
            return { ...sale, lines: (await all('SELECT * FROM sale_lines WHERE sale_id=?', id)) };
        },
        async voidSale(user, id, body) {
            admin(user);
            const reason = str(body.reason, 'Motivo', 300);
            return (await tx(async () => {
                const sale = (await one('SELECT * FROM sales WHERE id=?', id));
                assert(sale && sale.status === 'paid', 'Venta inexistente o ya anulada.', 409);
                const shift = (await activeShift(user, false));
                (await operationsOpen(shift));
                assert(sale.shift_id === shift.id, 'Solo se pueden anular ventas del turno abierto.', 409);
                for (const m of (await all("SELECT * FROM movements WHERE sale_id=? AND kind='sale'", id)))
                    (await move(m.item_id, -m.quantity, 'void', user.id, shift.id, id, reason));
                for (const m of (await all("SELECT * FROM credit_movements WHERE sale_id=? AND kind IN ('sale','change','debt') ORDER BY id DESC", id)))
                    await creditMove(m.customer_id, -m.amount, 'void', m.method, user, { saleId: id, shiftId: shift.id, note: reason });
                (await run("UPDATE sales SET status='void',void_reason=? WHERE id=?", reason, id));
                (await audit(user, 'sale_void', `${id}: ${reason}`));
                return { ok: true };
            }));
        },
        async stockMovement(user, body) {
            assert(['restock', 'waste'].includes(body.kind), 'Tipo de movimiento inválido.');
            integer(body.itemId, 'Insumo', 1);
            integer(body.quantity, 'Cantidad', 1, 100000);
            const note = str(body.note, 'Motivo / referencia', 300);
            // Only the owner writes stock off; workers can only add what physically arrives.
            if (body.kind === 'waste') admin(user);
            return (await tx(async () => {
                const shift = user.role !== 'admin' ? (await activeShift(user)) : (await one('SELECT * FROM shifts WHERE closed_at IS NULL'));
                (await operationsOpen(shift ?? null));
                const item = await one('SELECT * FROM inventory WHERE id=? AND active=1', body.itemId);
                assert(item, 'Insumo inexistente.', 404);
                if (body.kind === 'restock') assert(body.quantity % item.pack_size === 0, `${item.name} se repone por paquete completo de ${item.pack_size} unidades.`);
                (await move(body.itemId, body.kind === 'waste' ? -body.quantity : body.quantity, body.kind, user.id, shift?.id ?? null, null, note));
                return { ok: true };
            }));
        },
        async startCount(user, body) {
            return (await tx(async () => {
                const shift = (await specifiedShift(user, body));
                assert(user.role === 'admin' || user.id === shift.user_id, 'Solo el responsable del turno o el propietario puede iniciar el arqueo.', 403);
                if (shift.stage !== 'open')
                    return { id: shift.id, stage: shift.stage }; // Safe retry after a lost response.
                const expected = await expectedCash(shift);
                (await run('INSERT INTO reconciliations(shift_id,expected_cash,started_by) VALUES(?,?,?)', shift.id, expected, user.id));
                (await run('INSERT INTO reconciliation_items SELECT ?,i.id,i.name,i.unit,ss.opening,i.stock FROM inventory i JOIN shift_stock ss ON ss.item_id=i.id AND ss.shift_id=?', shift.id, shift.id));
        if(await one("SELECT value FROM settings WHERE key='products_only_version'"))await run("UPDATE reconciliation_items SET name=COALESCE((SELECT MIN(p.name) FROM products p JOIN recipes r ON r.product_id=p.id WHERE r.item_id=reconciliation_items.item_id AND p.active=1 HAVING COUNT(*)=1 AND MIN(r.quantity)=1),name) WHERE shift_id=?",shift.id);
                (await run("UPDATE shifts SET stage='counting',count_version=1 WHERE id=?", shift.id));
                (await audit(user, 'count_started', String(shift.id)));
                return { id: shift.id, stage: 'counting' };
            }));
        },
        async submitCount(user, body) {
            return (await tx(async () => {
                const requestId = str(body.requestId, 'Identificador', 80);
                const previous = (await one('SELECT * FROM declarations WHERE request_id=?', requestId));
                if (previous) {
                    assert(previous.author_id === user.id && previous.shift_id === body.shiftId && previous.version === body.version, 'Identificador ya utilizado.', 409);
                    return { id: previous.id, version: previous.version };
                }
                const shift = (await specifiedShift(user, body));
                // The owner may count in place of an absent worker so the register is never stuck.
                const onBehalf = shift.user_id !== user.id;
                assert(!onBehalf || user.role === 'admin', 'Solo el trabajador responsable del turno puede enviar su declaración.', 403);
                assert(shift.stage !== 'open', 'Primero inicia el arqueo.', 409);
                assert(['counting', 'recount'].includes(shift.stage), 'La declaración ya fue enviada. El propietario debe pedir un reconteo para corregirla.', 409);
                assert(body.version === shift.count_version, 'La versión del conteo cambió. Actualiza la pantalla.', 409);
                integer(body.countedCash, 'Efectivo contado');
                const items = (await all('SELECT * FROM reconciliation_items WHERE shift_id=?', shift.id));
                validateCounts(body.counts, items);
                const notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 500) : '';
                if (shift.stage === 'recount')
                    str(notes, 'Explicación del reconteo', 500);
                if (onBehalf) str(notes, 'Motivo por el que cuentas en lugar del responsable', 500);
                const id = Number((await run("INSERT INTO declarations(shift_id,version,request_id,author_id,counted_cash,notes) VALUES(?,?,?,?,?,?) RETURNING id", shift.id, body.version, requestId, user.id, body.countedCash, notes)).lastInsertRowid);
                for (const c of body.counts)
                    (await run('INSERT INTO declaration_items VALUES(?,?,?)', id, c.id, c.quantity));
                (await run("UPDATE shifts SET stage='review' WHERE id=?", shift.id));
                (await audit(user, onBehalf ? 'count_submitted_on_behalf' : 'count_submitted', `${shift.id}: declaración ${id}, versión ${body.version}`));
                return { id, version: body.version };
            }));
        },
        async requestRecount(user, body) {
            admin(user);
            const reason = str(body.reason, 'Motivo del reconteo', 500);
            return (await tx(async () => {
                const shift = (await specifiedShift(user, body));
                const latest = (await one('SELECT * FROM declarations WHERE shift_id=? ORDER BY version DESC LIMIT 1', shift.id));
                assert(shift.stage === 'review' && latest?.id === body.declarationId, 'El arqueo cambió. Revisa la última declaración.', 409);
                const version = shift.count_version + 1;
                (await run("INSERT INTO recount_requests(shift_id,version,requested_by,reason) VALUES(?,?,?,?) RETURNING id", shift.id, version, user.id, reason));
                (await run("UPDATE shifts SET stage='recount',count_version=? WHERE id=?", version, shift.id));
                (await audit(user, 'recount_requested', `${shift.id}: ${reason}`));
                return { version };
            }));
        },
        async approveCount(user, body) {
            admin(user);
            return (await tx(async () => {
                const shift = (await one('SELECT * FROM shifts WHERE id=?', body.shiftId ?? null));
                assert(shift, 'Turno no encontrado.', 404);
                const latest = (await one('SELECT * FROM declarations WHERE shift_id=? ORDER BY version DESC LIMIT 1', shift.id));
                assert(latest && latest.id === body.declarationId, 'Revisa la última declaración antes de aprobar.', 409);
                const baseline = (await one('SELECT * FROM reconciliations WHERE shift_id=?', shift.id));
                if (shift.stage === 'closed')
                    return { id: shift.id, expectedCash: shift.expected_cash, difference: shift.cash_difference };
                assert(shift.stage === 'review', 'Primero debe enviarse la declaración del trabajador.', 409);
                const items = (await all('SELECT r.*,d.quantity,i.stock FROM reconciliation_items r JOIN declaration_items d ON d.item_id=r.item_id AND d.declaration_id=? JOIN inventory i ON i.id=r.item_id WHERE r.shift_id=?', latest.id, shift.id));
                assert(items.length === (await one('SELECT COUNT(*) n FROM inventory WHERE active=1')).n, 'El inventario cambió. Requiere revisión antes de aprobar.', 409);
                for (const item of items)
                    assert(item.expected === item.stock, 'El inventario cambió después de iniciar el conteo. No se puede aprobar.', 409);
                const expected = await expectedCash(shift);
                assert(expected === baseline.expected_cash, 'El efectivo esperado cambió después del corte.', 409);
                const note = typeof body.notes === 'string' ? body.notes.trim().slice(0, 500) : '';
                if (items.some(i => i.quantity !== i.expected) || latest.counted_cash !== expected)
                    str(note, 'Explica las diferencias antes de aprobar', 500);
                for (const item of items) {
                    (await run('INSERT INTO counts VALUES(?,?,?,?,?)', shift.id, item.item_id, item.expected, item.quantity, item.quantity - item.expected));
                    if (item.quantity !== item.expected)
                        (await move(item.item_id, item.quantity - item.expected, 'count', user.id, shift.id, null, note));
                }
                (await run("UPDATE reconciliations SET approved_by=?,approved_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),approval_notes=? WHERE shift_id=?", user.id, note, shift.id));
                (await run("UPDATE shifts SET stage='closed',closed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),expected_cash=?,counted_cash=?,cash_difference=?,notes=? WHERE id=?", expected, latest.counted_cash, latest.counted_cash - expected, note, shift.id));
                (await audit(user, 'count_approved', `${shift.id}: declaración ${latest.id}`));
                // A menu update waiting for the shift to end is applied right after the closure.
                if (await menuOutdated()) await installClientMenu(0);
                return { id: shift.id, expectedCash: expected, difference: latest.counted_cash - expected };
            }));
        },
        // Keep the old endpoint safe: it can no longer submit counts and close in one step.
        async closeShift(user, body) { return (await api.approveCount(user, body)); },
        async shiftDetail(user, id) {
            const shift = (await one('SELECT s.*,u.name cashier FROM shifts s JOIN users u ON u.id=s.user_id WHERE s.id=?', id));
            assert(shift, 'Turno no encontrado.', 404);
            assert(user.role === 'admin' || user.id === shift.user_id, 'No puedes consultar este turno.', 403);
            const baseline = (await one('SELECT r.*,u.name approver FROM reconciliations r LEFT JOIN users u ON u.id=r.approved_by WHERE r.shift_id=?', id));
            const items = (await all('SELECT * FROM reconciliation_items WHERE shift_id=? ORDER BY name', id));
            const declarations = await Promise.all((await all('SELECT d.*,u.name author FROM declarations d JOIN users u ON u.id=d.author_id WHERE d.shift_id=? ORDER BY d.version DESC', id)).map(async (d) => ({ ...d, items: (await all('SELECT item_id,quantity FROM declaration_items WHERE declaration_id=?', d.id)) })));
            const requests = (await all('SELECT r.*,u.name requester FROM recount_requests r JOIN users u ON u.id=r.requested_by WHERE r.shift_id=? ORDER BY version DESC', id));
            // Expected balances never cross the API boundary for workers during reconciliation.
            if (user.role !== 'admin')
                return { id: shift.id, user_id: shift.user_id, cashier: shift.cashier, stage: shift.stage, count_version: shift.count_version, opened_at: shift.opened_at, closed_at: shift.closed_at, items: items.map(({ item_id, name, unit }) => ({ item_id, name, unit })), declarations: declarations.map(({ request_id, ...d }) => d), requests, frozen_at: baseline?.frozen_at };
            return { ...shift, baseline, items, declarations, requests, counts: (await all('SELECT c.*,i.name,i.unit,ss.opening FROM counts c JOIN inventory i ON i.id=c.item_id LEFT JOIN shift_stock ss ON ss.item_id=c.item_id AND ss.shift_id=c.shift_id WHERE c.shift_id=?', id)) };
        },
        async addInventory(user, body) {
            admin(user);
            const shift = await one('SELECT * FROM shifts WHERE closed_at IS NULL');
            assert(!shift || shift.stage === 'open', 'Espera a que se apruebe el arqueo para agregar insumos.', 409);
            const name = str(body.name, 'Nombre'), unit = str(body.unit, 'Unidad', 20);
            integer(body.minimum, 'Mínimo', 0, 100000);
            const packSize = integer(body.packSize ?? 1, 'Unidades por paquete', 1, 10000);
            assert(!(await one('SELECT id FROM inventory WHERE name=? AND active=1', name)), 'Ya existe un insumo con ese nombre.', 409);
            const id = Number((await run("INSERT INTO inventory(name,unit,minimum,pack_size) VALUES(?,?,?,?) RETURNING id", name, unit, body.minimum, packSize)).lastInsertRowid);
            // Created at zero mid-shift: the shift's arqueo expects opening 0 + restocks.
            if (shift) await run('INSERT INTO shift_stock VALUES(?,?,0)', shift.id, id);
            (await audit(user, 'inventory_created', name));
            return { id };
        },
    async setProductActive(user,id,body) {
      admin(user);integer(id,'Producto',1);assert(typeof body.active==='boolean','Estado inválido.');
      return tx(async()=>{
        (await operationsOpen());const product=(await one('SELECT * FROM products WHERE id=?',id));assert(product,'Producto inexistente.',404);
        const stock=productStockItem(product,(await all('SELECT * FROM products')),(await all('SELECT * FROM recipes')),(await all('SELECT * FROM inventory')));
        if(stock&&Number(body.active)!==product.active){
          assert(!(await one('SELECT id FROM shifts WHERE closed_at IS NULL')),'Archiva o restaura productos con unidades entre turnos, después del arqueo.',409);
          if(body.active)assert(!(await one('SELECT p.id FROM products p JOIN recipes r ON r.product_id=p.id WHERE r.item_id=? AND p.active=1 AND p.id<>?',stock.id,id)),'Estas unidades ya pertenecen a otro producto activo.',409);
          await run('UPDATE inventory SET active=? WHERE id=?',body.active?1:0,stock.id);
        }

        if(body.active)assert(!(await one('SELECT r.item_id FROM recipes r JOIN inventory i ON i.id=r.item_id WHERE r.product_id=? AND i.active=0',id)),'Elige el control del producto y guárdalo antes de restaurarlo.',409);
        (await run('UPDATE products SET active=? WHERE id=?',body.active?1:0,id));(await audit(user,body.active?'product_restored':'product_archived',id+': '+product.name));return {ok:true};
      });
    },
    async updateInventory(user,id,body) {
      admin(user);integer(id,'Insumo',1);
      return tx(async()=>{
        (await operationsOpen());const item=(await one('SELECT * FROM inventory WHERE id=?',id));assert(item,'Insumo inexistente.',404);
        if(typeof body.active==='boolean'&&Number(body.active)!==item.active){
          assert(!(await one('SELECT id FROM shifts WHERE closed_at IS NULL')),'Archiva o restaura insumos entre turnos, después de aprobar el arqueo.',409);
          if(body.active)assert(!(await one('SELECT id FROM inventory WHERE lower(name)=lower(?) AND active=1 AND id<>?',item.name,id)),'Ya existe un insumo activo con ese nombre. Corrige el nombre antes de restaurarlo.',409);
          if(!body.active){assert(item.stock===0,'Este insumo todavía tiene existencias. Registra su salida o merma antes de archivarlo.',409);assert(!(await one('SELECT p.id FROM recipes r JOIN products p ON p.id=r.product_id WHERE r.item_id=? AND p.active=1',id)),'Este insumo se usa en un producto activo. Cambia su receta o archiva primero el producto.',409);}
          (await run('UPDATE inventory SET active=? WHERE id=?',body.active?1:0,id));
        }
        if(body.name!==undefined){const name=str(body.name,'Nombre');assert(!(await one('SELECT id FROM inventory WHERE lower(name)=lower(?) AND id<>? AND active=1',name,id)),'Ya existe un insumo con ese nombre.',409);(await run('UPDATE inventory SET name=? WHERE id=?',name,id));}
        if(body.unit!==undefined&&body.unit!==item.unit){assert(item.stock===0&&!(await one('SELECT id FROM movements WHERE item_id=? LIMIT 1',id))&&!(await one('SELECT product_id FROM recipes WHERE item_id=? LIMIT 1',id)),'La unidad de un insumo con historial o recetas no se puede cambiar. Crea un insumo con la unidad correcta.',409);(await run('UPDATE inventory SET unit=? WHERE id=?',str(body.unit,'Unidad',20),id));}
        if(body.minimum!==undefined)(await run('UPDATE inventory SET minimum=? WHERE id=?',integer(body.minimum,'Mínimo',0,100000),id));
        if(body.packSize!==undefined)(await run('UPDATE inventory SET pack_size=? WHERE id=?',integer(body.packSize,'Unidades por paquete',1,10000),id));
        (await audit(user,'inventory_updated',id+': '+JSON.stringify(body)));return {ok:true};
      });
    },
        async saveProduct(user, body) {
            admin(user);
            (await operationsOpen());
            const name = str(body.name, 'Nombre'), description = typeof body.description === 'string' ? body.description.slice(0, 200) : '';
            assert(categories.includes(body.category), 'Categoría inválida.');
            const unitMode=body.inventoryMode==='unit',inventoryMode=unitMode?'recipe':body.inventoryMode||'recipe';
            if(body.minimum!==undefined)integer(body.minimum,'Stock mínimo',0,100000);if(body.packSize!==undefined)integer(body.packSize,'Unidades por paquete',1,10000);
            let recipe=unitMode?[]:body.recipe;
            assert(['recipe', 'untracked'].includes(inventoryMode), 'Control de inventario inválido.');
            const pricingMode=body.pricingMode||'unit',weightBasis=body.weightBasisGrams??100;
            assert(['unit','weight','free'].includes(pricingMode),'Tipo de cobro inválido.');assert([1,100,1000].includes(weightBasis),'Unidad de precio por peso inválida.');
            const catalogPrice=body.price??(pricingMode==='free'?(body.id?(await one('SELECT price FROM products WHERE id=?',body.id))?.price:100):undefined);integer(catalogPrice,'Precio',1,10000000);
            if(!unitMode)assert(Array.isArray(recipe) && recipe.length <= 30 && (inventoryMode === 'untracked' ? recipe.length === 0 : recipe.length > 0), 'Asigna al menos un insumo, o elige solo registrar ventas.');
            assert(new Set(recipe.map(r => r.item_id)).size === recipe.length, 'No repitas insumos en la receta.');
            for (const r of recipe) {
                integer(r.item_id, 'Insumo', 1);
                integer(r.quantity, 'Cantidad', 1, 100000);
                assert((await one('SELECT id FROM inventory WHERE id=? AND active=1', r.item_id)), 'Insumo inexistente.');
            }
            const art = ['burger', 'double', 'crispy', 'fries', 'cola', 'soda', 'water', 'icecream', 'chocolate', 'slush', 'yellow', 'nuggets', 'sandwich', 'empanada', 'brownie', 'cookie', 'coffee', 'shake', 'juice', 'bolo'].includes(body.art) ? body.art : 'burger';
            return (await tx(async () => {
        const oldProduct=body.id?(await one('SELECT * FROM products WHERE id=?',body.id)):null;
        const allProducts=(await all('SELECT * FROM products')),allRecipes=(await all('SELECT * FROM recipes')),allInventory=(await all('SELECT * FROM inventory'));
        const oldStock=oldProduct?productStockItem(oldProduct,allProducts,allRecipes,allInventory):null;
        const shift=(await one('SELECT * FROM shifts WHERE closed_at IS NULL'));
        if(!unitMode&&inventoryMode==='recipe'&&oldProduct){const prior=allRecipes.filter(r=>r.product_id===oldProduct.id);const changed=oldProduct.inventory_mode!=='recipe'||prior.length!==recipe.length||prior.some(r=>!recipe.some(n=>n.item_id===r.item_id&&n.quantity===r.quantity));if(changed)assert(!shift,'Cambia el stock asociado entre turnos, después de aprobar el arqueo.',409);}
        if(unitMode&&oldStock&&Number(body.active!==false)!==oldProduct.active)assert(!shift,'Archiva o restaura productos con unidades entre turnos, después del arqueo.',409);
        if((unitMode&&!oldStock&&oldProduct)||(inventoryMode==='untracked'&&oldProduct&&oldProduct.inventory_mode!=='untracked')){
          assert(!shift,'Cambia el control de unidades entre turnos, después de aprobar el arqueo.',409);
          if(inventoryMode==='untracked'&&oldStock){(await run('UPDATE inventory SET active=0 WHERE id=?',oldStock.id));}
        }

                let id = body.id;
                if (id) {
                    integer(id, 'Producto', 1);
                    assert((await one('SELECT id FROM products WHERE id=?', id)), 'Producto inexistente.', 404);
                    (await run('UPDATE products SET name=?,category=?,price=?,description=?,art=?,active=? WHERE id=?', name, body.category, catalogPrice, description, art, body.active === false ? 0 : 1, id));
                    (await run('DELETE FROM recipes WHERE product_id=?', id));
                }
                else
                    id = Number((await run("INSERT INTO products(name,category,price,description,art) VALUES(?,?,?,?,?) RETURNING id", name, body.category, catalogPrice, description, art)).lastInsertRowid);
        if(unitMode){
          let item=oldStock;
          if(!item){
            const candidates=allInventory.filter(i=>i.name.toLowerCase()===name.toLowerCase()&&['ud','unidad','unidades'].includes(i.unit.toLowerCase().trim())&&!allRecipes.some(r=>r.item_id===i.id&&allProducts.some(p=>p.id===r.product_id&&p.active&&p.id!==id)));
            if(candidates.length===1)item=candidates[0];
          }
          if(!item){const itemId=Number((await run('INSERT INTO inventory(name,unit,stock,minimum,pack_size) VALUES(?,?,?,?,?) RETURNING id',name,'ud',0,body.minimum??5,body.packSize??1)).lastInsertRowid);item={id:itemId,stock:0};}
          if(shift&&body.active!==false&&!(await one('SELECT item_id FROM shift_stock WHERE shift_id=? AND item_id=?',shift.id,item.id))){
            assert(item.stock===0,'Recupera las existencias anteriores de este producto entre turnos.',409);
            (await run('INSERT INTO shift_stock VALUES(?,?,0)',shift.id,item.id));
          }
          (await run('UPDATE inventory SET name=?,active=?,minimum=?,pack_size=? WHERE id=?',name,body.active===false?0:1,body.minimum??allInventory.find(i=>i.id===item.id)?.minimum??5,body.packSize??allInventory.find(i=>i.id===item.id)?.pack_size??1,item.id));
          recipe=[{item_id:item.id,quantity:1}];
        }
                (await run('UPDATE products SET inventory_mode=?,pricing_mode=?,weight_basis_grams=?,allow_manual_price=? WHERE id=?', inventoryMode,pricingMode==='free'?'unit':pricingMode,weightBasis,pricingMode==='free'?1:0, id));
                for (const r of recipe)
                    (await run('INSERT INTO recipes VALUES(?,?,?)', id, r.item_id, r.quantity));
                (await audit(user, 'product_saved', `${id}: ${name}`));
                return { id };
            }));
        },
        async createUser(user, body) { admin(user); return (await addUser(body, user)); },
        async createCustomer(user, body) { return addCustomer(user, body); },
    async updateCustomer(user,id,body) {
      admin(user);return tx(async()=>{
        (await operationsOpen());const customer=(await one('SELECT * FROM customers WHERE id=?',id));assert(customer,'Cliente inexistente.',404);
        if(body.name!==undefined){const name=str(body.name,'Nombre del cliente',80);assert(!(await one('SELECT id FROM customers WHERE lower(name)=lower(?) AND id<>?',name,id)),'Ya existe un cliente con ese nombre.',409);(await run('UPDATE customers SET name=? WHERE id=?',name,id));}
        if(typeof body.phone==='string')(await run('UPDATE customers SET phone=? WHERE id=?',body.phone.trim().slice(0,30),id));
        if(typeof body.active==='boolean'){assert(body.active||customer.balance===0,'Devuelve o ajusta el saldo y liquida la deuda antes de desactivar al cliente.',409);(await run('UPDATE customers SET active=? WHERE id=?',body.active?1:0,id));}
        const limit=body.creditLimit===undefined?customer.credit_limit:integer(body.creditLimit,'Límite de fiado',0,10000000),enabled=body.allowFiado===undefined?customer.allow_fiado:body.allowFiado===true?1:0;
        if(enabled)assert(limit>0&&limit>=Math.max(0,-customer.balance),'El límite debe cubrir la deuda actual y ser mayor a cero.');
        (await run('UPDATE customers SET allow_fiado=?,credit_limit=? WHERE id=?',enabled,limit,id));(await audit(user,'customer_updated',String(id)));return {ok:true};
      });
    },
        async customerDetail(user, id) {
            const customer = await one('SELECT id,name,phone,balance,active,created_at,allow_fiado,credit_limit,debt_since FROM customers WHERE id=?', id);
            assert(customer, 'Cliente inexistente.', 404);
            return { ...customer, movements: await all('SELECT m.id,m.amount,m.kind,m.method,m.sale_id,m.shift_id,m.reversal_of,m.note,m.created_at,u.name actor FROM credit_movements m JOIN users u ON u.id=m.user_id WHERE m.customer_id=? ORDER BY m.id DESC LIMIT 100', id) };
        },
    async creditOperation(user,id,body) {
      assert(['deposit','payment','opening_debt','refund','adjust','reversal'].includes(body.kind),'Operación de saldo inválida.');
      if(!['deposit','payment'].includes(body.kind))admin(user);
      const requestId=str(body.requestId,'Identificador',80);
      return tx(async()=>{
        const previous=(await one('SELECT * FROM credit_movements WHERE request_id=?',requestId));
        if(previous){assert(previous.user_id===user.id&&previous.customer_id===id,'Identificador ya utilizado.',409);return {balance:(await one('SELECT balance FROM customers WHERE id=?',id)).balance,movement:(await one('SELECT id,amount,method,kind,created_at FROM credit_movements WHERE request_id=?',requestId))};}
        const customer=(await one('SELECT * FROM customers WHERE id=? AND active=1',id));assert(customer,'Cliente inexistente o inactivo.',404);
        let method=body.method,amount,note=typeof body.note==='string'?body.note.trim().slice(0,300):'',reversalOf=null;
        if(body.kind==='reversal'){
          integer(body.movementId,'Abono',1);
          const original=(await one('SELECT * FROM credit_movements WHERE id=? AND customer_id=?',body.movementId,id));
          assert(original&&['payment','deposit'].includes(original.kind),'Solo puedes anular abonos o recargas.',409);
          assert(!(await one('SELECT id FROM credit_movements WHERE reversal_of=?',original.id)),'Este abono ya fue anulado.',409);
          assert(customer.balance-original.amount>=-original.debt_part,'El cliente ya usó el saldo de este abono. Revisa sus movimientos antes de anularlo.',409);
          method=original.method;amount=-original.amount;reversalOf=original.id;str(note,'Motivo',300);
        }else{
          amount=body.kind==='adjust'?integer(body.amount,'Monto',-10000000,10000000):integer(body.amount,'Monto',1,10000000);
          assert(amount!==0,'Monto: valor inválido.');
          if(['adjust','opening_debt'].includes(body.kind))method='none';
          const methods={deposit:['cash','qr','card'],payment:['cash','qr','card'],refund:['cash','none'],adjust:['none'],opening_debt:['none']}[body.kind];
          assert(methods.includes(method),'Medio inválido.');
          if(body.kind==='payment'){
            assert(customer.balance<0,'Este cliente no tiene una deuda pendiente. Usa Cargar saldo.',409);
            assert(amount<=-customer.balance||body.allowExcess===true,'Confirma que el excedente quedará como saldo a favor.');
          }
          if(['refund','adjust','opening_debt'].includes(body.kind))str(note,'Motivo',300);
          if(body.kind==='refund'||body.kind==='opening_debt')amount=-amount;
        }
        let shift=(await one('SELECT * FROM shifts WHERE closed_at IS NULL'));
        if(user.role!=='admin'||method==='cash')shift=(await activeShift(user,user.role!=='admin'));
        (await operationsOpen(shift??null));
        if(reversalOf){const original=(await one('SELECT shift_id FROM credit_movements WHERE id=?',reversalOf));assert(original.shift_id===null||original.shift_id===shift?.id,'El abono pertenece a un turno cerrado. Conserva ese cierre y registra un ajuste con motivo.',409);}
        (await creditMove(id,amount,body.kind,method,user,{shiftId:shift?.id??null,note,requestId,reversalOf}));
        (await audit(user,'credit_'+body.kind,id+': '+amount));
        return {balance:(await one('SELECT balance FROM customers WHERE id=?',id)).balance,movement:(await one('SELECT id,amount,method,kind,created_at FROM credit_movements WHERE request_id=?',requestId))};
      });
    },
        async changeOwnPassword(user, body, token) {
            const saved = await one('SELECT password FROM users WHERE id=?', user.id);
            assert(passwordMatches(str(body.current, 'Contraseña actual', 128), saved.password), 'La contraseña actual no es correcta.', 403);
            const pwd = str(body.password, 'Contraseña nueva', 128);
            assert(pwd.length >= 10, 'Usa al menos 10 caracteres.');
            await run('UPDATE users SET password=? WHERE id=?', passwordHash(pwd), user.id);
            // Other devices must sign in again; this one stays signed in.
            await run('DELETE FROM sessions WHERE user_id=? AND token<>?', user.id, hash(token || ''));
            await audit(user, 'password_changed', String(user.id));
            return { ok: true };
        },
        async updateUser(user, id, body) {
            admin(user);
            assert(id !== user.id, 'Para tu propia cuenta usa «Cambiar mi contraseña». No puedes desactivarte.');
            assert((await one('SELECT id FROM users WHERE id=?', id)), 'Usuario inexistente.', 404);
            if (body.active === false) assert(!(await one('SELECT id FROM shifts WHERE user_id=? AND closed_at IS NULL', id)), 'Este cajero tiene un turno abierto. Haz su arqueo (puedes contar en su lugar) y luego desactívalo.', 409);
            if (body.password !== undefined) {
                const pwd = str(body.password, 'Contraseña', 128);
                assert(pwd.length >= 10, 'Usa al menos 10 caracteres.');
                (await run('UPDATE users SET password=? WHERE id=?', passwordHash(pwd), id));
            }
            if(typeof body.canFiado==='boolean')await run('UPDATE users SET can_fiado=? WHERE id=?',body.canFiado?1:0,id);
            if (typeof body.active === 'boolean')
                (await run('UPDATE users SET active=? WHERE id=?', body.active ? 1 : 0, id));
            if(body.password!==undefined||typeof body.active==='boolean')(await run('DELETE FROM sessions WHERE user_id=?', id));
            (await audit(user, 'user_updated', String(id)));
            return { ok: true };
        },
        async report(user, from, to) {
            admin(user);
            assert(/^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to) && from <= to, 'Rango de fechas inválido.');
            // Bolivia (UTC-4), no daylight-saving time. Sales are stored in UTC.
            const start = `${from}T04:00:00.000Z`, end = new Date(`${to}T04:00:00.000Z`);
            assert(!isNaN(end), 'Fecha inválida.');
            end.setUTCDate(end.getUTCDate() + 1);
            const endIso = end.toISOString();
            const totals = (await one("SELECT COUNT(*) tickets,COALESCE(SUM(total),0) total,COALESCE(SUM(cash),0) cash,COALESCE(SUM(qr),0) qr,COALESCE(SUM(card),0) card,COALESCE(SUM(credit),0) credit,COALESCE(SUM(debt),0) debt FROM sales WHERE status='paid' AND created_at>=? AND created_at<?", start, endIso));
            const top = (await all("SELECT l.name,SUM(l.quantity) quantity,SUM(l.price*l.quantity) total FROM sale_lines l JOIN sales s ON s.id=l.sale_id WHERE s.status='paid' AND s.created_at>=? AND s.created_at<? GROUP BY l.product_id,l.name ORDER BY total DESC LIMIT 6", start, endIso));
            const hours = (await all("SELECT to_char(created_at AT TIME ZONE 'America/La_Paz','HH24') AS \"hour\",SUM(total) total FROM sales WHERE status='paid' AND created_at>=? AND created_at<? GROUP BY 1", start, endIso));
            const cashiers = (await all("SELECT u.name,COUNT(*) tickets,SUM(s.total) total FROM sales s JOIN users u ON u.id=s.user_id WHERE s.status='paid' AND s.created_at>=? AND s.created_at<? GROUP BY u.id ORDER BY total DESC", start, endIso));
            const credit = await one('SELECT COALESCE(SUM(CASE WHEN balance>0 THEN balance ELSE 0 END),0) owed,COUNT(*) FILTER (WHERE balance>0) customers,COALESCE(SUM(CASE WHEN balance<0 THEN -balance ELSE 0 END),0) receivable,COUNT(*) FILTER (WHERE balance<0) debtors FROM customers');
            const collections=await one("SELECT COALESCE(SUM(CASE WHEN method='cash' THEN amount ELSE 0 END),0) cash,COALESCE(SUM(CASE WHEN method='qr' THEN amount ELSE 0 END),0) qr,COALESCE(SUM(CASE WHEN method='card' THEN amount ELSE 0 END),0) card FROM credit_movements WHERE kind IN ('payment','deposit','reversal') AND created_at>=? AND created_at<?",start,endIso);
      return {totals,top,hours,cashiers,from,to,credit,collections};
        },
        close: () => database.close()
    };
    const readMethods = new Set(['isSetup', 'authenticate', 'snapshot', 'receipt', 'shiftDetail', 'report', 'customerDetail']);
    const wrapped = { categories, backend: 'postgres' };
    for (const [name, method] of Object.entries(api)) {
        if (typeof method !== 'function')
            continue;
        wrapped[name] = name === 'close' ? method : (...args) => database.transaction(async () => {
            if (!['isSetup', 'setup', 'login', 'loginGoogle', 'authenticate', 'logout'].includes(name)) {
                const actor = await one('SELECT id,name,username,role,can_fiado FROM users WHERE id=? AND active=1', args[0]?.id ?? null);
                assert(actor, 'Inicia sesión para continuar.', 401);
                args[0] = actor;
            }
            return method(...args);
        }, readMethods.has(name));
    }
    try {
        await database.transaction(async () => {
            const version = await one("SELECT value FROM settings WHERE key='schema_version'");
            assert(version?.value === '6', 'Aplica las migraciones de Flamingo antes de iniciar el servidor.', 503);
        }, true);
        // Menu upgrades never touch a running shift; otherwise they apply after its approval.
        await database.transaction(async () => {
            if (await menuOutdated() && await one('SELECT id FROM users LIMIT 1') && !(await one('SELECT id FROM shifts WHERE closed_at IS NULL'))) await installClientMenu(0);
            if(!(await menuOutdated())&&await one('SELECT id FROM users LIMIT 1')&&!(await one("SELECT id FROM products WHERE menu_key='helado-de-acai'"))){
                const match=await one("SELECT id FROM products WHERE menu_key IS NULL AND name IN ('Helado de Açaí','Helado de Acai','Acai','Açaí') LIMIT 1");
                if(match)await run("UPDATE products SET menu_key='helado-de-acai' WHERE id=?",match.id);
                else await run("INSERT INTO products(name,category,price,art,description,menu_key,inventory_mode,allow_manual_price) VALUES('Helado de Açaí','Helados',100,'icecream','','helado-de-acai','untracked',1)");
            }
        });
    }
    catch (error) {
        await database.close();
        throw error;
    }
    return wrapped;
}
