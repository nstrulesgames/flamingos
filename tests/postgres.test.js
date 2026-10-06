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
test('PostgreSQL: connection URL cannot disable TLS certificate verification', () => {
  const options = postgresConnectionOptions('postgresql://app:example@db.example.com/postgres?ssl=0&sslmode=disable');
  assert.deepEqual(options.ssl, { rejectUnauthorized: true });
  assert.equal(new URL(options.connectionString).searchParams.has('ssl'), false);
  assert.equal(new URL(options.connectionString).searchParams.has('sslmode'), false);
  assert.throws(() => postgresConnectionOptions('https://example.com'), /PostgreSQL válida/);
});
async function fixture(t, setup = true) {
  const db = new PGlite();
  await db.exec(schema);
  await db.exec(menuSeed);
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
  assert.equal(state.products.length, 60);
  assert.equal(state.inventory.length, 37);
  assert(state.inventory.every(i => i.stock === 0));
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
  assert.equal(state.products.length, 60);
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
  assert.equal(backup.tables.products.length, 60);
  assert.equal('sessions' in backup.tables, false);
});
