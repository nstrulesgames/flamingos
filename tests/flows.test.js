// End-to-end owner and cashier flows: no situation may leave the register stuck.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createStore } from '../lib/store.js';
import { createApp } from '../server.js';

function fixture(t) {
  const store = createStore(':memory:', { demo: true });
  t.after(() => store.close());
  const owner = store.login({ username: 'admin', password: 'Flamingo2026!' }).user;
  const cashier = store.login({ username: 'camila', password: 'Flamingo2026!' }).user;
  const snap = () => store.snapshot(owner);
  const product = name => snap().products.find(p => p.name === name);
  const open = who => store.openShift(who, { openingCash: 10000, confirmed: true, openingStock: snap().inventory.map(i => ({ id: i.id, quantity: i.stock })) });
  const sell = (who, name, quantity = 1) => { const p = product(name); return store.sale(who, { requestId: randomUUID(), items: [{ id: p.id, quantity }], cash: p.price * quantity, tendered: p.price * quantity, service: 'local' }); };
  const declare = (who, extra = {}) => { const s = snap(); return store.submitCount(who, { shiftId: s.shift.id, version: s.shift.count_version, requestId: randomUUID(), countedCash: s.shift.opening_cash + (s.shift.cash ?? 0), counts: s.inventory.map(i => ({ id: i.id, quantity: i.stock })), notes: '', ...extra }); };
  return { store, owner, cashier, snap, product, open, sell, declare };
}

test('cashier leaves without counting: owner counts in their place, approves, and the next shift opens', t => {
  const { store, owner, cashier, snap, open, sell, declare } = fixture(t);
  open(cashier); sell(cashier, 'Bolo de agua', 2);
  store.startCount(owner, { shiftId: snap().shift.id });
  assert.throws(() => declare(owner), /Motivo/);
  const d = declare(owner, { notes: 'Camila se retiró sin contar' });
  store.approveCount(owner, { shiftId: snap().shift.id, declarationId: d.id });
  assert.equal(snap().shift, null);
  // The owner can now deactivate the worker and the register is free for the next person.
  store.updateUser(owner, cashier.id, { active: false });
  open(owner); assert.equal(snap().shift.user_id, owner.id);
  assert(store.db.prepare("SELECT 1 FROM audit WHERE action='count_submitted_on_behalf'").get());
});

test('a recount requested while the cashier is away can also be completed by the owner', t => {
  const { store, owner, cashier, snap, open, declare } = fixture(t);
  open(cashier); store.startCount(cashier, { shiftId: snap().shift.id });
  const first = declare(cashier);
  store.requestRecount(owner, { shiftId: snap().shift.id, declarationId: first.id, reason: 'Revisar bolos' });
  const second = declare(owner, { notes: 'Recontado por la propietaria' });
  store.approveCount(owner, { shiftId: snap().shift.id, declarationId: second.id });
  assert.equal(snap().shift, null);
});

test('owner can sell during the cashier\'s shift; the cash belongs to the same register', t => {
  const { store, owner, cashier, snap, open, sell } = fixture(t);
  open(cashier); sell(cashier, 'Brownie'); sell(owner, 'Brownie');
  const other = store.createUser(owner, { name: 'Luis', username: 'luis', password: 'ClaveLuis2026!', role: 'cashier' });
  assert.throws(() => sell(other, 'Brownie'), /otro cajero/);
  store.startCount(cashier, { shiftId: snap().shift.id });
  const shift = snap().shift;
  assert.equal(store.shiftDetail(owner, shift.id).baseline.expected_cash, 10000 + 1600);
});

test('owner adds a loose ingredient mid-shift; the arqueo still approves', t => {
  const { store, owner, cashier, snap, open, declare } = fixture(t);
  open(cashier);
  const ham = store.addInventory(owner, { name: 'Jamón', unit: 'paquete', minimum: 1 }).id;
  store.stockMovement(cashier, { kind: 'restock', itemId: ham, quantity: 3, note: 'Supermercado' });
  store.startCount(cashier, { shiftId: snap().shift.id });
  assert.throws(() => store.addInventory(owner, { name: 'Huevo', unit: 'ud', minimum: 6 }), /arqueo/);
  const d = declare(cashier);
  store.approveCount(owner, { shiftId: snap().shift.id, declarationId: d.id });
  const detail = store.shiftDetail(owner, snap().shifts[0].id);
  assert.equal(detail.counts.find(c => c.item_id === ham).expected, 3);
});

test('a forgotten cashier password can be reset mid-shift without closing it', t => {
  const { store, owner, cashier, snap, open, sell } = fixture(t);
  open(cashier);
  store.updateUser(owner, cashier.id, { password: 'NuevaClave2026!' });
  const again = store.login({ username: 'camila', password: 'NuevaClave2026!' }).user;
  sell(again, 'Alfajor'); assert.equal(snap().shift.user_id, cashier.id);
});

test('everyone changes their own password over HTTP; other devices are signed out', async t => {
  const { server, store } = createApp({ database: ':memory:', demo: true });
  t.after(() => new Promise(r => server.close(() => { store.close(); r(); })));
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const post = (path, body, cookie) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Flamingo-Request': '1', ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) });
  const login = async (username, password) => (await post('/login', { username, password })).headers.get('set-cookie')?.split(';')[0];
  for (const [username, password] of [['admin', 'Flamingo2026!'], ['camila', 'Flamingo2026!']]) {
    const phone = await login(username, password), tablet = await login(username, password);
    assert.equal((await post('/me/password', { current: 'equivocada', password: 'OtraClave2026!' }, phone)).status, 403);
    assert.equal((await post('/me/password', { current: password, password: 'OtraClave2026!' }, phone)).status, 200);
    assert.equal((await fetch(base + '/state', { headers: { Cookie: phone } })).status, 200);
    assert.equal((await fetch(base + '/state', { headers: { Cookie: tablet } })).status, 401);
    assert(await login(username, 'OtraClave2026!'));
  }
});

test('owner cannot lock themselves out', t => {
  const { store, owner } = fixture(t);
  assert.throws(() => store.updateUser(owner, owner.id, { active: false }), /No puedes desactivarte/);
});
