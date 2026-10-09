import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { createPostgresStore } from '../lib/postgres-store.js';
import { createApp } from '../server.js';
import { createPostgresDatabase, postgresConnectionOptions } from '../lib/postgres-db.js';
import { exportPostgresBackup } from '../lib/postgres-backup.js';

const schema = await readFile(new URL('../supabase/migrations/202610060001_flamingo_initial.sql', import.meta.url), 'utf8');
const menuSeed = await readFile(new URL('../supabase/migrations/202610060002_client_menu.sql', import.meta.url), 'utf8');
const unitsMigration = await readFile(new URL('../supabase/migrations/202610090001_units_and_packages.sql', import.meta.url), 'utf8');
const creditMigration = await readFile(new URL('../supabase/migrations/202610090002_customer_credit.sql', import.meta.url), 'utf8');
test('PostgreSQL: connection URL cannot disable TLS certificate verification', () => {
  const options = postgresConnectionOptions('postgresql://app:example@db.example.com/postgres?ssl=0&sslmode=disable');
  assert.deepEqual(options.ssl, { rejectUnauthorized: true });
  assert.equal(new URL(options.connectionString).searchParams.has('ssl'), false);
  assert.equal(new URL(options.connectionString).searchParams.has('sslmode'), false);
  assert.throws(() => postgresConnectionOptions('https://example.com'), /PostgreSQL válida/);
});
async function fixture(t, setup = true, prepareV1) {
  const db = new PGlite();
  await db.exec(schema);
  await db.exec(menuSeed);
  // Data as production had it under schema 1 / menu v1, before the units migration.
  if (prepareV1) await prepareV1(db);
  await db.exec(unitsMigration);
  await db.exec(creditMigration);
  await db.exec('CREATE ROLE flamingo_test LOGIN IN ROLE flamingo_app; SET ROLE flamingo_test');
  // PGlite has one session. Lease it for whole transactions, like a pool of size 1.
  let tail = Promise.resolve();
  const pool = {
    async connect() {
      const previous = tail; let release;
      tail = new Promise(resolve => { release = resolve; });
      await previous;
      return { query: async (sql, args) => {
        const result = await db.query(sql, args);
        return { ...result, rowCount: result.affectedRows };
      }, release };
    },
    end: () => db.close(),
  };
  const store = await createPostgresStore(undefined, { pool });
  t.after(() => store.close());
  if (!setup) return { store, db, pool };
  const owner = await store.setup({ name: 'Propietaria', username: 'owner', password: 'ClaveDePrueba2026!' });
  const worker = await store.createUser(owner, { name: 'Cajera', username: 'caja', password: 'OtraClave2026!', role: 'cashier' });
  const state = await store.snapshot(owner);
  const product = state.products.find(p => p.name === 'Coca-Cola 300 ml');
  const itemId = product.recipe[0].item_id;
  const open = async () => store.openShift(worker, {
    openingCash: 10000, confirmed: true,
    openingStock: (await store.snapshot(owner)).inventory.map(i => ({ id: i.id, quantity: i.stock })),
  });
  const sale = (overrides = {}) => ({ requestId: randomUUID(), items: [{ id: product.id, quantity: 1 }], cash: product.price, tendered: 1000, service: 'local', ...overrides });
  return { store, db, pool, owner, worker, product, itemId, open, sale };
}

test('PostgreSQL: email owner and workers can log in without duplicating differently-cased identifiers', async t => {
  const {store}=await fixture(t,false);
  const email='Owner.Name+POS@flamingos-establecimiento.example',password='ClaveDePrueba2026!';
  const owner=await store.setup({name:'Propietaria',username:email,password});
  assert.equal(owner.username,email.toLowerCase());
  assert.equal((await store.login({username:` ${email.toUpperCase()} `,password})).user.id,owner.id);
  const worker=await store.createUser(owner,{name:'Cajera',username:'Caja@flamingos.example',password,role:'cashier'});
  assert.equal((await store.login({username:'CAJA@FLAMINGOS.EXAMPLE',password})).user.id,worker.id);
  await assert.rejects(store.createUser(owner,{name:'Duplicada',username:email.toUpperCase(),password,role:'cashier'}),/ya existe/);
  await assert.rejects(store.createUser(owner,{name:'Inválida',username:'persona@correo..com',password,role:'cashier'}),/correo electrónico válido/);
});

test('PostgreSQL: Google only grants existing active accounts and ignores claimed roles', async t => {
  const {store,owner}=await fixture(t);
  await assert.rejects(store.loginGoogle({email:'stranger@example.com',role:'admin'}),/no tiene acceso/);
  const worker=await store.createUser(owner,{name:'Google cashier',username:'Cashier@example.com',password:'ClaveSegura2026!',role:'cashier'});
  const session=await store.loginGoogle({email:'CASHIER@EXAMPLE.COM',role:'admin'});
  assert.equal(session.user.id,worker.id);assert.equal(session.user.role,'cashier');
  assert.equal((await store.authenticate(session.token)).role,'cashier');
  await store.updateUser(owner,worker.id,{active:false});
  assert.equal(await store.authenticate(session.token),undefined);
  await assert.rejects(store.loginGoogle({email:'cashier@example.com'}),/no tiene acceso/);
});

test('PostgreSQL: initial setup, catalog, password sessions and minimum database privileges', async t => {
  const { store, db } = await fixture(t, false);
  assert.equal(await store.isSetup(), false);
  const owner = await store.setup({ name: 'Dueña', username: 'admin', password: 'ClaveSegura2026!' });
  await assert.rejects(store.setup({}), /ya está configurado/);
  const state = await store.snapshot(owner);
  // The SQL seed holds menu v1; setup upgrades it to v2 and archives the flavor variants.
  assert.equal(state.products.length, 66);
  assert.equal(state.products.filter(p => p.active).length, 38);
  assert.equal(state.inventory.length, 29);
  assert(state.inventory.every(i => i.stock === 0));
  assert(state.products.filter(p => p.active).every(p => p.inventory_mode === 'untracked' || p.recipe.length === 1));
  await assert.rejects(store.login({ username: 'admin', password: 'incorrecta' }), /incorrectos/);
  const login = await store.login({ username: 'admin', password: 'ClaveSegura2026!' });
  assert.equal((await store.authenticate(login.token)).id, owner.id);
  assert.equal(await store.authenticate('invalid'), undefined);
  await store.logout(login.token);
  assert.equal(await store.authenticate(login.token), undefined);
  await assert.rejects(db.query('SELECT * FROM flamingo.users; DROP TABLE flamingo.users'), /multiple commands|owner|permission/);
  await assert.rejects(db.query('DELETE FROM flamingo.audit'), /permission denied/);
  const roles = await db.query("SELECT has_schema_privilege('public','flamingo','USAGE') AS exposed");
  assert.equal(roles.rows[0].exposed, false);
});

test('PostgreSQL: cashier restocks are attributed to their own open shift and freeze at the count', async t => {
  const {store,owner,worker,itemId,open}=await fixture(t);
  const movement={kind:'restock',itemId,quantity:12,note:'Entrega del proveedor'};
  await assert.rejects(store.stockMovement(worker,movement),/Abre un turno/);
  await store.stockMovement(owner,{...movement,quantity:1});
  assert.equal((await store.snapshot(owner)).movements[0].shift_id,null);
  const shift=await open();
  const other=await store.createUser(owner,{name:'Otro cajero',username:'otro',password:'ClaveSegura2026!',role:'cashier'});
  await assert.rejects(store.stockMovement(other,movement),/otro cajero/);
  await assert.rejects(store.stockMovement({...other,role:'admin'},movement),/otro cajero/);
  await store.stockMovement(worker,{...movement,userId:owner.id,user_id:owner.id,shiftId:999,shift_id:999});
  const snapshot=await store.snapshot(owner),entry=snapshot.movements[0];
  assert.equal(snapshot.inventory.find(i=>i.id===itemId).stock,13);
  assert.equal(entry.user_id,worker.id);assert.equal(entry.actor,worker.name);
  assert.equal(entry.shift_id,shift.id);assert.equal(entry.kind,'restock');assert.equal(entry.note,movement.note);
  for(const body of [{quantity:0},{quantity:1.5},{quantity:-1},{note:''}])await assert.rejects(store.stockMovement(worker,{...movement,...body}));
  await store.startCount(worker,{shiftId:shift.id});
  assert.equal((await store.shiftDetail(owner,shift.id)).items.find(i=>i.item_id===itemId).expected,13);
  for(const user of [worker,owner])await assert.rejects(store.stockMovement(user,movement),/pausadas/);
  assert.equal((await store.snapshot(owner)).inventory.find(i=>i.id===itemId).stock,13);
});

test('PostgreSQL: saving a prepared product as sales only enables it without stock deductions', async t => {
  const {store,owner,worker,open}=await fixture(t);
  const coffee=(await store.snapshot(owner)).products.find(p=>p.name==='Café americano');
  assert.equal(coffee.available,null);
  await assert.rejects(store.saveProduct(worker,{...coffee,inventoryMode:'untracked',recipe:[]}),/Solo el propietario/);
  await store.saveProduct(owner,{...coffee,inventoryMode:'untracked',recipe:[]});
  const configured=(await store.snapshot(owner)).products.find(p=>p.id===coffee.id);
  assert.equal(configured.inventory_mode,'untracked');assert.equal(configured.available,null);assert.deepEqual(configured.recipe,[]);
  await open();
  const before=(await store.snapshot(owner)).inventory;
  const sale=await store.sale(worker,{requestId:randomUUID(),items:[{id:coffee.id,quantity:2}],cash:coffee.price*2,tendered:coffee.price*2,service:'local'});
  assert.equal(sale.total,coffee.price*2);
  assert.deepEqual((await store.snapshot(owner)).inventory,before);
});

test('PostgreSQL: sale and stock commit together; retries do not duplicate payments', async t => {
  const { store, owner, worker, itemId, open, sale } = await fixture(t);
  await store.stockMovement(owner, { itemId, quantity: 2, kind: 'restock', note: 'Stock de ensayo' });
  const shift = await open();
  const request = sale();
  const receipts = await Promise.all([store.sale(worker, request), store.sale(worker, request)]);
  assert.equal(receipts[0].id, receipts[1].id);
  assert.equal(receipts[0].change_due, 500);
  assert.match(receipts[0].created_at, /Z$/);
  let state = await store.snapshot(owner);
  assert.equal(state.inventory.find(i => i.id === itemId).stock, 1);
  assert.equal(state.sales.length, 1);
  const results = await Promise.allSettled([store.sale(worker, sale()), store.sale(worker, sale())]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  state = await store.snapshot(owner);
  assert.equal(state.inventory.find(i => i.id === itemId).stock, 0);
  assert.equal(state.sales.length, 2);
  assert.equal(state.shift.id, shift.id);
  await store.voidSale(owner, receipts[0].id, { reason: 'Anulación de prueba' });
  assert.equal((await store.snapshot(owner)).inventory.find(i => i.id === itemId).stock, 1);
  await assert.rejects(store.voidSale(owner, receipts[0].id, { reason: 'Duplicado' }), /ya anulada/);
});

test('PostgreSQL: failed multi-item sale rolls back payment, lines and all stock deductions', async t => {
  const { store, owner, worker, product, itemId, open, sale } = await fixture(t);
  await store.stockMovement(owner, { itemId, quantity: 3, kind: 'restock', note: 'Stock' });
  const second = (await store.snapshot(owner)).products.find(p => p.name === 'Coca-Cola 500 ml');
  await open();
  await assert.rejects(store.sale(worker, sale({ items: [{ id: product.id, quantity: 1 }, { id: second.id, quantity: 1 }], cash: product.price + second.price, tendered: 2000 })), /Stock insuficiente/);
  const state = await store.snapshot(owner);
  assert.equal(state.sales.length, 0);
  assert.equal(state.inventory.find(i => i.id === itemId).stock, 3);
  assert.equal(state.movements.filter(m => m.kind === 'sale').length, 0);
});

test('PostgreSQL: blind declaration, frozen inventory, recount history and approval', async t => {
  const { store, owner, worker, itemId, open, sale } = await fixture(t);
  await store.stockMovement(owner, { itemId, quantity: 5, kind: 'restock', note: 'Stock' });
  const shift = await open();
  await store.sale(worker, sale());
  await store.startCount(worker, { shiftId: shift.id });
  const blind = await store.snapshot(worker);
  assert(blind.blind);
  assert(blind.inventory.every(i => !('stock' in i)));
  assert(!('opening_cash' in blind.shift));
  const detail = await store.shiftDetail(worker, shift.id);
  assert(!('baseline' in detail));
  assert(detail.items.every(i => !('expected' in i)));
  await assert.rejects(store.sale(worker, sale()), /pausadas/);
  await assert.rejects(store.stockMovement(owner, { itemId, quantity: 1, kind: 'restock', note: 'No' }), /pausadas/);
  const counts = (await store.snapshot(owner)).inventory.map(i => ({ id: i.id, quantity: i.stock }));
  counts.find(i => i.id === itemId).quantity--;
  const declaration = { shiftId: shift.id, version: 1, requestId: randomUUID(), countedCash: 10500, counts, notes: '' };
  const first = await store.submitCount(worker, declaration);
  assert.equal((await store.submitCount(worker, declaration)).id, first.id);
  await assert.rejects(store.approveCount(worker, { shiftId: shift.id, declarationId: first.id }), /Solo el propietario/);
  await assert.rejects(store.approveCount(owner, { shiftId: shift.id, declarationId: first.id }), /Explica las diferencias/);
  await store.requestRecount(owner, { shiftId: shift.id, declarationId: first.id, reason: 'Volver a contar' });
  counts.find(i => i.id === itemId).quantity++;
  const second = await store.submitCount(worker, { ...declaration, requestId: randomUUID(), version: 2, notes: 'Revisado' });
  assert.equal((await store.shiftDetail(owner, shift.id)).declarations.length, 2);
  const approval = { shiftId: shift.id, declarationId: second.id, notes: '' };
  assert.equal((await store.approveCount(owner, approval)).difference, 0);
  assert.equal((await store.approveCount(owner, approval)).difference, 0);
  assert.equal((await store.snapshot(owner)).shift, null);
});

test('PostgreSQL: reports use Bolivia dates and current roles cannot be forged', async t => {
  const { store, db, owner, worker, itemId, open, sale } = await fixture(t);
  await assert.rejects(store.createUser({ ...worker, role: 'admin' }, { name: 'X' }), /Solo el propietario/);
  await store.stockMovement(owner, { itemId, quantity: 2, kind: 'restock', note: 'Stock' });
  await open();
  const first = await store.sale(worker, sale());
  const second = await store.sale(worker, sale());
  await db.query("UPDATE flamingo.sales SET created_at='2026-10-06T03:59:59Z' WHERE id=$1", [first.id]);
  await db.query("UPDATE flamingo.sales SET created_at='2026-10-06T04:00:00Z' WHERE id=$1", [second.id]);
  const report = await store.report(owner, '2026-10-06', '2026-10-06');
  assert.equal(report.totals.tickets, 1);
  assert.equal(report.totals.total, 500);
  assert.equal(report.hours[0].hour, '00');
  assert.equal(report.cashiers[0].name, worker.name);
});

test('PostgreSQL: HTTP routes await storage and keep sessions in HttpOnly cookies', async t => {
  const { store } = await fixture(t, false);
  const { server } = createApp({ store });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}`;
  const send = (path, body, cookie = '') => fetch(url + path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-flamingo-request': '1', cookie }, body: JSON.stringify(body) });
  assert.equal((await (await fetch(url + '/api/status')).json()).setup, false);
  assert.equal((await send('/api/setup', { name: 'Dueña', username: 'admin', password: 'ClaveSegura2026!' })).status, 201);
  const login = await send('/api/login', { username: 'admin', password: 'ClaveSegura2026!' });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly/);
  const state = await (await fetch(url + '/api/state', { headers: { cookie: cookie.split(';')[0] } })).json();
  assert.equal(state.products.filter(p => p.active).length, 38);
  assert.equal(state.user.role, 'admin');
  assert.equal((await fetch(url + '/api/state')).status, 401);
});

test('PostgreSQL: backup exports consistent business data and excludes login sessions', async t => {
  const { store, pool, owner, worker, itemId, open, sale } = await fixture(t);
  await store.stockMovement(owner, { itemId, quantity: 2, kind: 'restock', note: 'Stock' });
  await open();
  await store.sale(worker, sale());
  await store.login({ username: 'caja', password: 'OtraClave2026!' });
  const backup = await exportPostgresBackup(createPostgresDatabase(undefined, pool));
  assert.equal(backup.format, 'flamingo-postgres-data-v1');
  assert.equal(backup.tables.sales.length, 1);
  assert.equal(backup.tables.inventory.find(i => i.id === itemId).stock, 1);
  assert.equal(backup.tables.products.length, 66);
  assert.equal('sessions' in backup.tables, false);
});

test('PostgreSQL: production upgrade merges loaded bolo flavors and waits for the open shift', async t => {
  let ownerId;
  const loadV1 = async db => {
    ownerId = (await db.query("INSERT INTO flamingo.users(name,username,password,role) VALUES('Dueña','duena','x:y','admin') RETURNING id")).rows[0].id;
    for (const [name, stock] of [['Bolo de agua · Grosella', 15], ['Bolo de fruta · Copoazú', 9], ['Bolo de leche · Chocolate', 7]])
      await db.query('UPDATE flamingo.inventory SET stock=$1 WHERE name=$2', [stock, name]);
  };
  const { store } = await fixture(t, false, loadV1), owner = { id: ownerId };
  const s = await store.snapshot(owner), inv = name => s.inventory.find(i => i.name === name);
  assert.equal(inv('Bolo de agua').stock, 15); assert.equal(inv('Bolo de fruta').stock, 9); assert.equal(inv('Bolo de leche').stock, 7);
  assert.equal(s.inventory.length, 29); assert(!s.inventory.some(i => i.unit === 'ml' || i.name.includes('·')));
  assert.equal(inv('Vaso de escarcha 500 ml').pack_size, 50);
  assert.equal(s.products.filter(p => p.active).length, 38);
  assert.equal(s.movements.filter(m => m.kind === 'transfer').length, 6);
  await assert.rejects(store.stockMovement(owner, { kind: 'restock', itemId: inv('Vaso de escarcha 250 ml').id, quantity: 10, note: 'x' }), /paquete completo de 100/);
  await store.stockMovement(owner, { kind: 'restock', itemId: inv('Vaso de escarcha 250 ml').id, quantity: 200, note: 'Dos paquetes' });
});

test('PostgreSQL: an open shift defers the menu upgrade until its arqueo is approved', async t => {
  let ownerId;
  const loadV1 = async db => {
    ownerId = (await db.query("INSERT INTO flamingo.users(name,username,password,role) VALUES('Dueña','duena','x:y','admin') RETURNING id")).rows[0].id;
    await db.query("UPDATE flamingo.inventory SET stock=4 WHERE name='Bolo de leche · Coco'");
    await db.query('INSERT INTO flamingo.shifts(user_id,opening_cash) VALUES($1,0)', [ownerId]);
    await db.query('INSERT INTO flamingo.shift_stock SELECT 1,id,stock FROM flamingo.inventory');
  };
  const { store } = await fixture(t, false, loadV1), owner = { id: ownerId };
  let s = await store.snapshot(owner);
  assert(s.inventory.some(i => i.name === 'Bolo de leche · Coco')); assert(!s.inventory.some(i => i.name === 'Bolo de leche'));
  const cashier = await store.createUser(owner, { name: 'Caja', username: 'caja', password: 'ClaveSegura2026!', role: 'cashier' });
  await assert.rejects(store.stockMovement(cashier, { kind: 'waste', itemId: s.inventory[0].id, quantity: 1, note: 'x' }), /Solo el propietario/);
  await store.startCount(owner, { shiftId: s.shift.id });
  const d = await store.submitCount(owner, { shiftId: s.shift.id, version: 1, requestId: randomUUID(), countedCash: 0, counts: s.inventory.map(i => ({ id: i.id, quantity: i.stock })), notes: '' });
  await store.approveCount(owner, { shiftId: s.shift.id, declarationId: d.id });
  s = await store.snapshot(owner);
  assert.equal(s.inventory.find(i => i.name === 'Bolo de leche').stock, 4); assert.equal(s.shift, null);
});

test('PostgreSQL: nothing stuck — owner sells, adds items mid-shift, counts for an absent cashier, resets passwords', async t => {
  const { store, owner, worker, open, product, itemId } = await fixture(t);
  await open();
  const shiftId = (await store.snapshot(owner)).shift.id;
  await store.stockMovement(owner, { kind: 'restock', itemId, quantity: 1, note: 'Stock' });
  const ownerSale = await store.sale(owner, { requestId: randomUUID(), items: [{ id: product.id, quantity: 1 }], cash: product.price, tendered: product.price, service: 'local' });
  assert.equal(ownerSale.shift_id, shiftId);
  const ham = (await store.addInventory(owner, { name: 'Jamón', unit: 'ud', minimum: 1 })).id;
  await store.stockMovement(worker, { kind: 'restock', itemId: ham, quantity: 2, note: 'Compra' });
  await store.updateUser(owner, worker.id, { password: 'ClaveNueva2026!' });
  assert.equal((await store.login({ username: 'caja', password: 'ClaveNueva2026!' })).user.id, worker.id);
  await assert.rejects(store.updateUser(owner, worker.id, { active: false }), /turno abierto/);
  await store.startCount(owner, { shiftId });
  const s = await store.snapshot(owner);
  const body = { shiftId, version: 1, requestId: randomUUID(), countedCash: 10000 + product.price, counts: s.inventory.map(i => ({ id: i.id, quantity: i.stock })) };
  await assert.rejects(store.submitCount(owner, { ...body, notes: '' }), /Motivo/);
  const d = await store.submitCount(owner, { ...body, notes: 'La cajera se fue' });
  await store.approveCount(owner, { shiftId, declarationId: d.id });
  await store.updateUser(owner, worker.id, { active: false });
  assert.equal((await store.snapshot(owner)).shift, null);
  await assert.rejects(store.changeOwnPassword(owner, { current: 'mala', password: 'OtraClave2026!' }, ''), /actual no es correcta/);
  await store.changeOwnPassword(owner, { current: 'ClaveDePrueba2026!', password: 'OtraClave2026!' }, '');
  assert((await store.login({ username: 'owner', password: 'OtraClave2026!' })).token);
});

test('PostgreSQL: saldo a favor — change kept, payment, deposit, refund, void and arqueo cash', async t => {
  const { store, owner, worker, open, product, itemId } = await fixture(t);
  await store.stockMovement(owner, { kind: 'restock', itemId, quantity: 5, note: 'Stock' });
  await open();
  const shiftId = (await store.snapshot(owner)).shift.id;
  const pay = extra => store.sale(worker, { requestId: randomUUID(), items: [{ id: product.id, quantity: 1 }], service: 'local', ...extra });
  const kept = await pay({ cash: product.price, tendered: product.price + 500, changeToCredit: true, newCustomer: { name: 'Rosa' } });
  const rosa = kept.customer_id;
  assert.equal(kept.customer_balance, 500);
  await assert.rejects(pay({ credit: product.price + 100, customerId: rosa }), /sumar el total/);
  const used = await pay({ credit: 500, cash: product.price - 500, tendered: product.price - 500, customerId: rosa });
  await store.creditOperation(worker, rosa, { requestId: randomUUID(), kind: 'deposit', amount: 1000, method: 'cash' });
  await assert.rejects(store.creditOperation(worker, rosa, { requestId: randomUUID(), kind: 'refund', amount: 100, method: 'cash', note: 'x' }), /Solo el propietario/);
  await store.creditOperation(owner, rosa, { requestId: randomUUID(), kind: 'refund', amount: 300, method: 'cash', note: 'Pidió efectivo' });
  await store.voidSale(owner, used.id, { reason: 'Error' });
  const customer = await store.customerDetail(owner, rosa);
  assert.equal(customer.balance, 500 - 500 + 1000 - 300 + 500);
  await store.startCount(worker, { shiftId });
  const detail = await store.shiftDetail(owner, shiftId);
  // fund + first sale cash + change kept + cash deposit − cash refund (the voided sale's cash is excluded)
  assert.equal(detail.baseline.expected_cash, 10000 + product.price + 500 + 1000 - 300);
  await assert.rejects(store.creditOperation(worker, rosa, { requestId: randomUUID(), kind: 'deposit', amount: 100, method: 'qr' }), /pausadas/);
  const report = await store.report(owner, '2026-01-01', '2030-01-01');
  assert.equal(report.credit.owed, 1200); assert.equal(report.credit.customers, 1);
});
