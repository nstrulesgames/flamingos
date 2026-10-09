// Customer balance in their favor (saldo a favor): ledger, payments and arqueo cash.
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
  const sale = (who, name, pay) => store.sale(who, { requestId: randomUUID(), items: [{ id: product(name).id, quantity: 1 }], service: 'local', ...pay });
  const balance = id => snap().customers.find(c => c.id === id).balance;
  const credit = (who, id, body) => store.creditOperation(who, id, { requestId: randomUUID(), ...body });
  const expected = () => { const s = snap(); store.startCount(owner, { shiftId: s.shift.id }); return store.shiftDetail(owner, s.shift.id).baseline.expected_cash; };
  return { store, owner, cashier, snap, product, open, sale, balance, credit, expected };
}

test('change left as balance stays in the drawer and pays a later purchase', t => {
  const { store, cashier, open, sale, balance, expected } = fixture(t);
  open(cashier);
  // Escarcha 250 ml is Bs 5; the customer pays Bs 10 and leaves the change.
  const first = sale(cashier, 'Escarcha 250 ml', { cash: 500, tendered: 1000, changeToCredit: true, newCustomer: { name: 'Doña Rosa', phone: '71234567' } });
  assert.equal(first.change_credit, 500); assert.equal(first.customer, 'Doña Rosa'); assert.equal(first.customer_balance, 500);
  const rosa = first.customer_id; assert.equal(balance(rosa), 500);
  // Bolo de agua Bs 2,50 paid fully with balance; Bolo de leche Bs 4 mixes balance and cash.
  const second = sale(cashier, 'Bolo de agua', { credit: 250, customerId: rosa });
  assert.equal(second.cash, 0); assert.equal(balance(rosa), 250);
  assert.throws(() => sale(cashier, 'Bolo de leche', { credit: 400, customerId: rosa }), /Saldo insuficiente: Doña Rosa tiene Bs 2,50/);
  sale(cashier, 'Bolo de leche', { credit: 250, cash: 150, tendered: 150, customerId: rosa });
  assert.equal(balance(rosa), 0);
  // Drawer: fund 100 + 5 (escarcha) + 5 (change kept) + 1,50 cash. Balance payments bring no cash.
  assert.equal(expected(), 10000 + 500 + 500 + 150);
  assert.equal(store.report(store.login({ username: 'admin', password: 'Flamingo2026!' }).user, '2026-01-01', '2030-01-01').totals.credit, 500);
});

test('payments must name a customer and add up exactly', t => {
  const { cashier, open, sale } = fixture(t);
  open(cashier);
  assert.throws(() => sale(cashier, 'Bolo de agua', { credit: 250 }), /Elige el cliente/);
  assert.throws(() => sale(cashier, 'Bolo de agua', { cash: 250, tendered: 250, changeToCredit: true, newCustomer: { name: 'X' } }), /No hay vuelto/);
  assert.throws(() => sale(cashier, 'Bolo de agua', { credit: 100, cash: 100, tendered: 100, newCustomer: { name: 'Y' } }), /sumar el total/);
});

test('deposits: cashier in their shift; cash enters the arqueo, QR does not; retries are idempotent', t => {
  const { store, owner, cashier, open, balance, credit, expected } = fixture(t);
  const ana = store.createCustomer(cashier, { name: 'Ana' }).id;
  assert.throws(() => store.createCustomer(owner, { name: '  ana ' }), /Ya existe/);
  assert.throws(() => credit(cashier, ana, { kind: 'deposit', amount: 2000, method: 'cash' }), /Abre un turno/);
  open(cashier);
  const requestId = randomUUID();
  credit(cashier, ana, { kind: 'deposit', amount: 2000, method: 'cash', requestId });
  credit(cashier, ana, { kind: 'deposit', amount: 2000, method: 'cash', requestId });
  credit(cashier, ana, { kind: 'deposit', amount: 1000, method: 'qr' });
  assert.equal(balance(ana), 3000);
  assert.equal(expected(), 10000 + 2000);
  // During the arqueo every balance operation is paused.
  assert.throws(() => credit(cashier, ana, { kind: 'deposit', amount: 100, method: 'qr' }), /pausadas/);
});

test('only the owner refunds or adjusts, always with a reason; balances never go negative', t => {
  const { store, owner, cashier, open, balance, credit, expected } = fixture(t);
  const luis = store.createCustomer(owner, { name: 'Luis' }).id;
  open(cashier);
  credit(cashier, luis, { kind: 'deposit', amount: 3000, method: 'cash' });
  assert.throws(() => credit(cashier, luis, { kind: 'refund', amount: 1000, method: 'cash', note: 'x' }), /Solo el propietario/);
  assert.throws(() => credit(cashier, luis, { kind: 'adjust', amount: -100, note: 'x' }), /Solo el propietario/);
  assert.throws(() => credit(owner, luis, { kind: 'refund', amount: 1000, method: 'cash' }), /Motivo/);
  credit(owner, luis, { kind: 'refund', amount: 1000, method: 'cash', note: 'Lo pidió en efectivo' });
  credit(owner, luis, { kind: 'refund', amount: 500, method: 'none', note: 'Transferencia de la dueña' });
  credit(owner, luis, { kind: 'adjust', amount: -500, note: 'Error de registro' });
  assert.throws(() => credit(owner, luis, { kind: 'adjust', amount: -1001, note: 'x' }), /Saldo insuficiente/);
  assert.equal(balance(luis), 1000);
  assert.throws(() => store.updateCustomer(owner, luis, { active: false }), /Devuelve o ajusta/);
  // Only the cash refund leaves the drawer.
  assert.equal(expected(), 10000 + 3000 - 1000);
  const history = store.customerDetail(cashier, luis).movements.map(m => [m.kind, m.amount]);
  assert.deepEqual(history, [['adjust', -500], ['refund', -500], ['refund', -1000], ['deposit', 3000]]);
});

test('voiding a sale returns used balance and removes change kept; spent change blocks the void', t => {
  const { owner, cashier, open, sale, balance, store, expected } = fixture(t);
  open(cashier);
  const kept = sale(cashier, 'Escarcha 300 ml', { cash: 700, tendered: 1000, changeToCredit: true, newCustomer: { name: 'Pedro' } });
  const pedro = kept.customer_id; assert.equal(balance(pedro), 300);
  const paid = sale(cashier, 'Bolo de agua', { credit: 250, customerId: pedro });
  assert.throws(() => store.voidSale(owner, kept.id, { reason: 'Error' }), /ya usó ese saldo/);
  store.voidSale(owner, paid.id, { reason: 'Se arrepintió' });
  assert.equal(balance(pedro), 300);
  store.voidSale(owner, kept.id, { reason: 'Error' });
  assert.equal(balance(pedro), 0);
  assert.equal(expected(), 10000);
});

test('the full arqueo approves with no difference when the drawer matches', t => {
  const { store, owner, cashier, snap, open, sale, credit } = fixture(t);
  open(cashier);
  const r = sale(cashier, 'Brownie', { cash: 800, tendered: 1000, changeToCredit: true, newCustomer: { name: 'Mía' } });
  credit(cashier, r.customer_id, { kind: 'deposit', amount: 500, method: 'cash' });
  const s = snap(); store.startCount(cashier, { shiftId: s.shift.id });
  const d = store.submitCount(cashier, { shiftId: s.shift.id, version: 1, requestId: randomUUID(), countedCash: 10000 + 800 + 200 + 500, counts: s.inventory.map(i => ({ id: i.id, quantity: i.stock })), notes: '' });
  assert.equal(store.approveCount(owner, { shiftId: s.shift.id, declarationId: d.id }).difference, 0);
});

test('HTTP: customers and balance operations go through the API with the same permissions', async t => {
  const { server, store } = createApp({ database: ':memory:', demo: true });
  t.after(() => new Promise(r => server.close(() => { store.close(); r(); })));
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const call = (path, body, cookie, method = body ? 'POST' : 'GET') => fetch(base + path, { method, headers: { 'Content-Type': 'application/json', 'X-Flamingo-Request': '1', Cookie: cookie }, body: body && JSON.stringify(body) });
  const login = async u => (await call('/login', { username: u, password: 'Flamingo2026!' }, '')).headers.get('set-cookie').split(';')[0];
  const owner = await login('admin'), cashier = await login('camila');
  const created = await (await call('/customers', { name: 'Cliente HTTP' }, cashier)).json();
  assert.equal((await call(`/customers/${created.id}/credit`, { requestId: randomUUID(), kind: 'adjust', amount: 100, note: 'x' }, cashier)).status, 403);
  assert.equal((await call(`/customers/${created.id}/credit`, { requestId: randomUUID(), kind: 'adjust', amount: 100, note: 'Saldo inicial' }, owner)).status, 201);
  assert.equal((await (await call(`/customers/${created.id}`, undefined, cashier)).json()).balance, 100);
  assert.equal((await call(`/customers/${created.id}`, { phone: '700' }, cashier, 'PATCH')).status, 403);
  assert.equal((await call(`/customers/${created.id}`, { phone: '700' }, owner, 'PATCH')).status, 200);
  const state = await (await call('/state', undefined, cashier)).json();
  assert.equal(state.customers.find(c => c.id === created.id).phone, '700');
});
