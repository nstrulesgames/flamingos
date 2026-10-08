import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { clientMenu, menuVersion } from './menu.js';
import { assert, integer, str, categories, loginIdentifier } from './store.js';
import { createPostgresDatabase } from './postgres-db.js';
const hash = value => createHash('sha256').update(value).digest('hex');
function passwordHash(password) {
    const salt = randomBytes(16).toString('hex');
    return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
function passwordMatches(password, saved) {
    const [salt, digest] = saved.split(':');
    return timingSafeEqual(scryptSync(password, salt, 64), Buffer.from(digest, 'hex'));
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
    async function addUser(body, actor) {
        const name = str(body.name, 'Nombre');
        const username = loginIdentifier(body.username);
        const password = str(body.password, 'Contraseña', 128);
        assert(password.length >= 10, 'La contraseña debe tener al menos 10 caracteres.');
        assert(['admin', 'cashier'].includes(body.role), 'Rol inválido.');
        assert(!(await one('SELECT id FROM users WHERE username=?', username)), 'Ese usuario ya existe.', 409);
        const id = Number((await run("INSERT INTO users(name,username,password,role) VALUES(?,?,?,?) RETURNING id", name, username, passwordHash(password), body.role)).lastInsertRowid);
        if (actor)
            (await audit(actor, 'user_created', username));
        return { id, name, username, role: body.role };
    }
    async function installClientMenu(stock) {
        for (const entry of clientMenu) {
            const existing = (await one('SELECT * FROM products WHERE menu_key=? OR name=? ORDER BY menu_key IS NOT NULL DESC LIMIT 1', entry.key, entry.name));
            const mode = 'recipe';
            let id;
            if (existing) {
                id = existing.id;
                (await run('UPDATE products SET name=?,category=?,price=?,art=?,description=?,active=1,menu_key=?,group_name=?,variant=?,size=?,flavor=?,inventory_mode=? WHERE id=?', entry.name, entry.category, entry.price, entry.art, entry.description, entry.key, entry.group, entry.variant, entry.size || '', entry.flavor || '', mode, id));
                (await run('DELETE FROM recipes WHERE product_id=?', id));
            }
            else
                id = Number((await run("INSERT INTO products(name,category,price,art,description,menu_key,group_name,variant,size,flavor,inventory_mode) VALUES(?,?,?,?,?,?,?,?,?,?,?) RETURNING id", entry.name, entry.category, entry.price, entry.art, entry.description, entry.key, entry.group, entry.variant, entry.size || '', entry.flavor || '', mode)).lastInsertRowid);
            // The printed menu does not define ingredient quantities for made-to-order food.
            // These products remain visible but require the owner to configure a recipe.
            if (entry.stockKind === 'prepared')
                continue;
            const isMix = entry.stockKind === 'escarcha', name = isMix ? `Mezcla de escarcha · ${entry.flavor}` : entry.name, unit = isMix ? 'ml' : 'ud';
            let inventory = (await one('SELECT * FROM inventory WHERE name=?', name));
            if (!inventory) {
                const itemId = Number((await run("INSERT INTO inventory(name,unit,stock,minimum) VALUES(?,?,?,?) RETURNING id", name, unit, isMix ? stock * 500 : stock, isMix ? 1000 : 5)).lastInsertRowid);
                inventory = { id: itemId };
            }
            else
                (await run('UPDATE inventory SET active=1 WHERE id=?', inventory.id));
            (await run('INSERT INTO recipes VALUES(?,?,?)', id, inventory.id, isMix ? entry.ml : 1));
        }
        (await run('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value', 'client_menu_version', menuVersion));
    }
    const api = {
        categories,
        isSetup: async () => !!(await one('SELECT id FROM users LIMIT 1')),
        async setup(body) {
            assert(!(await api.isSetup()), 'El negocio ya está configurado.', 409);
            return (await tx(async () => {
                const user = await addUser({ ...body, role: 'admin' });
                if (!(await one("SELECT value FROM settings WHERE key='client_menu_version'"))) await installClientMenu(0);
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
            return { token, user: { id: user.id, name: user.name, role: user.role, username: user.username } };
        },
        async authenticate(token) { return token ? (await one('SELECT u.id,u.name,u.username,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>? AND u.active=1', hash(token), Date.now())) : null; },
        async loginGoogle({ email }) {
            const username = loginIdentifier(email);
            assert(username.includes('@'), 'El correo de Google no es válido.', 403);
            const user = await one('SELECT id,name,username,role FROM users WHERE username=? AND active=1', username);
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
            const catalog = (await all('SELECT * FROM products ORDER BY id')).map(p => {
                const recipe = recipes.filter(r => r.product_id === p.id);
                const available = p.inventory_mode === 'untracked' ? null : recipe.length ? Math.min(...recipe.map(r => Math.floor(allInventory.find(i => i.id === r.item_id)?.stock / r.quantity))) : 0;
                return { ...p, recipe, available };
            });
            const sales = user.role === 'admin' ? (await all('SELECT s.*,u.name cashier FROM sales s JOIN users u ON u.id=s.user_id ORDER BY s.id DESC LIMIT 500')) : (await all('SELECT s.*,u.name cashier FROM sales s JOIN users u ON u.id=s.user_id WHERE s.user_id=? ORDER BY s.id DESC LIMIT 100', user.id));
            const shifts = user.role === 'admin' ? (await all('SELECT s.*,u.name cashier FROM shifts s JOIN users u ON u.id=s.user_id ORDER BY s.id DESC LIMIT 60')) : (await all('SELECT s.*,u.name cashier FROM shifts s JOIN users u ON u.id=s.user_id WHERE s.user_id=? ORDER BY s.id DESC LIMIT 30', user.id));
            const summaries = (await all("SELECT shift_id,COUNT(*) tickets,COALESCE(SUM(total),0) total,COALESCE(SUM(cash),0) cash,COALESCE(SUM(qr),0) qr,COALESCE(SUM(card),0) card FROM sales WHERE status='paid' GROUP BY shift_id"));
            const enriched = shifts.map(s => ({ ...s, ...summaries.find(v => v.shift_id === s.id) }));
            const movements = user.role === 'admin' ? (await all('SELECT m.*,i.name item,u.name actor FROM movements m JOIN inventory i ON m.item_id=i.id JOIN users u ON m.user_id=u.id ORDER BY m.id DESC LIMIT 100')) : [];
            const blind = user.role !== 'admin' && !!shift && shift.stage !== 'open';
            const safeShift = s => !s ? null : blind && s.id === shift.id ? { id: s.id, user_id: s.user_id, cashier: s.cashier, stage: s.stage, count_version: s.count_version, opened_at: s.opened_at, closed_at: s.closed_at, opening_confirmed_at: s.opening_confirmed_at } : s;
            const visibleCategories = categories.filter(c => catalog.some(p => p.active && p.category === c));
            return { user, categories: visibleCategories, products: blind ? catalog.map(p => ({ ...p, available: null })) : catalog, inventory: blind ? inventory.map(({ stock, ...i }) => i) : inventory, sales, shifts: enriched.map(safeShift), shift: safeShift(shift ? enriched.find(s => s.id === shift.id) ?? shift : null), movements, users: user.role === 'admin' ? (await all('SELECT id,name,username,role,active FROM users')) : [], demo, blind };
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
                const shift = (await activeShift(user));
                (await operationsOpen(shift));
                assert(Array.isArray(body.items) && body.items.length > 0 && body.items.length <= 100, 'Agrega productos a la orden.');
                const quantities = new Map();
                for (const item of body.items) {
                    integer(item.id, 'Producto', 1);
                    integer(item.quantity, 'Cantidad', 1, 999);
                    quantities.set(item.id, (quantities.get(item.id) ?? 0) + item.quantity);
                }
                let total = 0;
                const lines = [], consumption = new Map();
                for (const [id, quantity] of quantities) {
                    integer(quantity, 'Cantidad', 1, 999);
                    const product = (await one('SELECT * FROM products WHERE id=? AND active=1', id));
                    assert(product, 'Producto no disponible.', 409);
                    const recipe = (await all('SELECT * FROM recipes WHERE product_id=?', id));
                    assert(recipe.length || product.inventory_mode === 'untracked', 'Configura los insumos de este producto.', 409);
                    total += product.price * quantity;
                    lines.push({ ...product, quantity });
                    for (const r of recipe)
                        consumption.set(r.item_id, (consumption.get(r.item_id) ?? 0) + r.quantity * quantity);
                }
                integer(total, 'Total', 1);
                const cash = integer(body.cash ?? 0, 'Efectivo'), qr = integer(body.qr ?? 0, 'QR'), card = integer(body.card ?? 0, 'Tarjeta');
                assert(cash + qr + card === total, 'Los pagos deben sumar el total exacto.');
                const tendered = integer(body.tendered ?? cash, 'Efectivo recibido');
                assert(tendered >= cash && (cash > 0 || tendered === 0), 'Efectivo recibido insuficiente o inválido.');
                assert(['local', 'takeaway'].includes(body.service), 'Tipo de pedido inválido.');
                const note = typeof body.note === 'string' ? body.note.trim().slice(0, 300) : '';
                const id = Number((await run("INSERT INTO sales(request_id,shift_id,user_id,total,cash,qr,card,tendered,change_due,service,note) VALUES(?,?,?,?,?,?,?,?,?,?,?) RETURNING id", requestId, shift.id, user.id, total, cash, qr, card, tendered, tendered - cash, body.service, note)).lastInsertRowid);
                for (const line of lines)
                    (await run("INSERT INTO sale_lines(sale_id,product_id,name,quantity,price) VALUES(?,?,?,?,?) RETURNING id", id, line.id, line.name, line.quantity, line.price));
                for (const [itemId, quantity] of consumption)
                    (await move(itemId, -quantity, 'sale', user.id, shift.id, id, `Venta #${id}`));
                return (await api.receipt(user, id));
            }));
        },
        async receipt(user, id) {
            const sale = (await one('SELECT s.*,u.name cashier FROM sales s JOIN users u ON s.user_id=u.id WHERE s.id=?', id));
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
            return (await tx(async () => {
                const shift = user.role !== 'admin' || body.kind === 'waste' ? (await activeShift(user, user.role !== 'admin')) : (await one('SELECT * FROM shifts WHERE closed_at IS NULL'));
                (await operationsOpen(shift));
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
                const expected = shift.opening_cash + (await one("SELECT COALESCE(SUM(cash),0) cash FROM sales WHERE shift_id=? AND status='paid'", shift.id)).cash;
                (await run('INSERT INTO reconciliations(shift_id,expected_cash,started_by) VALUES(?,?,?)', shift.id, expected, user.id));
                (await run('INSERT INTO reconciliation_items SELECT ?,i.id,i.name,i.unit,ss.opening,i.stock FROM inventory i JOIN shift_stock ss ON ss.item_id=i.id AND ss.shift_id=?', shift.id, shift.id));
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
                assert(shift.user_id === user.id, 'Solo el trabajador responsable del turno puede enviar su declaración.', 403);
                assert(['counting', 'recount'].includes(shift.stage), 'La declaración ya fue enviada. El propietario debe pedir un reconteo para corregirla.', 409);
                assert(body.version === shift.count_version, 'La versión del conteo cambió. Actualiza la pantalla.', 409);
                integer(body.countedCash, 'Efectivo contado');
                const items = (await all('SELECT * FROM reconciliation_items WHERE shift_id=?', shift.id));
                validateCounts(body.counts, items);
                const notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 500) : '';
                if (shift.stage === 'recount')
                    str(notes, 'Explicación del reconteo', 500);
                const id = Number((await run("INSERT INTO declarations(shift_id,version,request_id,author_id,counted_cash,notes) VALUES(?,?,?,?,?,?) RETURNING id", shift.id, body.version, requestId, user.id, body.countedCash, notes)).lastInsertRowid);
                for (const c of body.counts)
                    (await run('INSERT INTO declaration_items VALUES(?,?,?)', id, c.id, c.quantity));
                (await run("UPDATE shifts SET stage='review' WHERE id=?", shift.id));
                (await audit(user, 'count_submitted', `${shift.id}: declaración ${id}, versión ${body.version}`));
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
                const expected = shift.opening_cash + (await one("SELECT COALESCE(SUM(cash),0) cash FROM sales WHERE shift_id=? AND status='paid'", shift.id)).cash;
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
            assert(!(await one('SELECT id FROM shifts WHERE closed_at IS NULL')), 'Agrega insumos entre turnos para conservar el conteo inicial.', 409);
            const name = str(body.name, 'Nombre'), unit = str(body.unit, 'Unidad', 20);
            integer(body.minimum, 'Mínimo', 0, 100000);
            const id = Number((await run("INSERT INTO inventory(name,unit,minimum) VALUES(?,?,?) RETURNING id", name, unit, body.minimum)).lastInsertRowid);
            (await audit(user, 'inventory_created', name));
            return { id };
        },
        async saveProduct(user, body) {
            admin(user);
            (await operationsOpen());
            const name = str(body.name, 'Nombre'), description = typeof body.description === 'string' ? body.description.slice(0, 200) : '';
            assert(categories.includes(body.category), 'Categoría inválida.');
            integer(body.price, 'Precio', 1, 10000000);
            const inventoryMode = body.inventoryMode || 'recipe';
            assert(['recipe', 'untracked'].includes(inventoryMode), 'Control de inventario inválido.');
            assert(Array.isArray(body.recipe) && body.recipe.length <= 30 && (inventoryMode === 'untracked' ? body.recipe.length === 0 : body.recipe.length > 0), 'Asigna al menos un insumo, o elige solo registrar ventas.');
            assert(new Set(body.recipe.map(r => r.item_id)).size === body.recipe.length, 'No repitas insumos en la receta.');
            for (const r of body.recipe) {
                integer(r.item_id, 'Insumo', 1);
                integer(r.quantity, 'Cantidad', 1, 100000);
                assert((await one('SELECT id FROM inventory WHERE id=? AND active=1', r.item_id)), 'Insumo inexistente.');
            }
            const art = ['burger', 'double', 'crispy', 'fries', 'cola', 'soda', 'water', 'icecream', 'chocolate', 'slush', 'yellow', 'nuggets', 'sandwich', 'empanada', 'brownie', 'cookie', 'coffee', 'shake', 'juice', 'bolo'].includes(body.art) ? body.art : 'burger';
            return (await tx(async () => {
                let id = body.id;
                if (id) {
                    integer(id, 'Producto', 1);
                    assert((await one('SELECT id FROM products WHERE id=?', id)), 'Producto inexistente.', 404);
                    (await run('UPDATE products SET name=?,category=?,price=?,description=?,art=?,active=? WHERE id=?', name, body.category, body.price, description, art, body.active === false ? 0 : 1, id));
                    (await run('DELETE FROM recipes WHERE product_id=?', id));
                }
                else
                    id = Number((await run("INSERT INTO products(name,category,price,description,art) VALUES(?,?,?,?,?) RETURNING id", name, body.category, body.price, description, art)).lastInsertRowid);
                (await run('UPDATE products SET inventory_mode=? WHERE id=?', inventoryMode, id));
                for (const r of body.recipe)
                    (await run('INSERT INTO recipes VALUES(?,?,?)', id, r.item_id, r.quantity));
                (await audit(user, 'product_saved', `${id}: ${name}`));
                return { id };
            }));
        },
        async createUser(user, body) { admin(user); return (await addUser(body, user)); },
        async updateUser(user, id, body) {
            admin(user);
            assert(id !== user.id, 'No puedes desactivar tu propia cuenta.');
            assert((await one('SELECT id FROM users WHERE id=?', id)), 'Usuario inexistente.', 404);
            assert(!(await one('SELECT id FROM shifts WHERE user_id=? AND closed_at IS NULL', id)), 'Cierra el turno de este cajero primero.', 409);
            if (body.password !== undefined) {
                const pwd = str(body.password, 'Contraseña', 128);
                assert(pwd.length >= 10, 'Usa al menos 10 caracteres.');
                (await run('UPDATE users SET password=? WHERE id=?', passwordHash(pwd), id));
            }
            if (typeof body.active === 'boolean')
                (await run('UPDATE users SET active=? WHERE id=?', body.active ? 1 : 0, id));
            (await run('DELETE FROM sessions WHERE user_id=?', id));
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
            const totals = (await one("SELECT COUNT(*) tickets,COALESCE(SUM(total),0) total,COALESCE(SUM(cash),0) cash,COALESCE(SUM(qr),0) qr,COALESCE(SUM(card),0) card FROM sales WHERE status='paid' AND created_at>=? AND created_at<?", start, endIso));
            const top = (await all("SELECT l.name,SUM(l.quantity) quantity,SUM(l.price*l.quantity) total FROM sale_lines l JOIN sales s ON s.id=l.sale_id WHERE s.status='paid' AND s.created_at>=? AND s.created_at<? GROUP BY l.product_id,l.name ORDER BY total DESC LIMIT 6", start, endIso));
            const hours = (await all("SELECT to_char(created_at AT TIME ZONE 'America/La_Paz','HH24') AS \"hour\",SUM(total) total FROM sales WHERE status='paid' AND created_at>=? AND created_at<? GROUP BY 1", start, endIso));
            const cashiers = (await all("SELECT u.name,COUNT(*) tickets,SUM(s.total) total FROM sales s JOIN users u ON u.id=s.user_id WHERE s.status='paid' AND s.created_at>=? AND s.created_at<? GROUP BY u.id ORDER BY total DESC", start, endIso));
            return { totals, top, hours, cashiers, from, to };
        },
        close: () => database.close()
    };
    const readMethods = new Set(['isSetup', 'authenticate', 'snapshot', 'receipt', 'shiftDetail', 'report']);
    const wrapped = { categories, backend: 'postgres' };
    for (const [name, method] of Object.entries(api)) {
        if (typeof method !== 'function')
            continue;
        wrapped[name] = name === 'close' ? method : (...args) => database.transaction(async () => {
            if (!['isSetup', 'setup', 'login', 'loginGoogle', 'authenticate', 'logout'].includes(name)) {
                const actor = await one('SELECT id,name,username,role FROM users WHERE id=? AND active=1', args[0]?.id ?? null);
                assert(actor, 'Inicia sesión para continuar.', 401);
                args[0] = actor;
            }
            return method(...args);
        }, readMethods.has(name));
    }
    try {
        await database.transaction(async () => {
            const version = await one("SELECT value FROM settings WHERE key='schema_version'");
            assert(version?.value === '1', 'Aplica las migraciones de Flamingo antes de iniciar el servidor.', 503);
        }, true);
    }
    catch (error) {
        await database.close();
        throw error;
    }
    return wrapped;
}
