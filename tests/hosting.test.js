import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createHostedHandler } from '../server.js';

async function serve(t, options) {
  const server = http.createServer(createHostedHandler(options));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return `http://127.0.0.1:${server.address().port}`;
}
const headers = { 'Content-Type': 'application/json', 'X-Flamingo-Request': '1' };
const environment = { FLAMINGO_DATABASE_URL: 'test-connection' };
const quiet = { error() {} };

test('hosting: missing database configuration returns 503 without opening SQLite', async t => {
  let connected = false;
  const base = await serve(t, { environment: {}, logger: quiet, storeFactory: () => { connected = true; } });
  const response = await fetch(`${base}/api/status`);
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /FLAMINGO_DATABASE_URL/);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(connected, false);
});

test('hosting: simultaneous cold requests share initialization and prefer the limited database login', async t => {
  let connections = 0, supplied;
  const base = await serve(t, {
    environment: { ...environment, DATABASE_URL: 'administrative-connection' }, logger: quiet,
    storeFactory: async value => {
      connections++; supplied = value;
      await new Promise(resolve => setTimeout(resolve, 20));
      return { backend: 'postgres', isSetup: async () => true };
    }
  });
  const responses = await Promise.all(Array.from({ length: 4 }, () => fetch(`${base}/api/status`)));
  for (const response of responses) {
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { setup: true, setupAllowed: false, demo: false, database: 'postgres', google: false });
  }
  assert.equal(connections, 1);
  assert.equal(supplied, environment.FLAMINGO_DATABASE_URL);
});

test('hosting: login accepts streamed JSON and issues an HTTPS session cookie', async t => {
  const base = await serve(t, {
    environment, logger: quiet,
    storeFactory: async () => ({ login: async body => {
      assert.deepEqual(body, { username: 'owner', password: 'test-password' });
      return { token: 'test-session', user: { id: 1, role: 'admin' } };
    } })
  });
  const response = await fetch(`${base}/api/login`, { method: 'POST', headers, body: JSON.stringify({ username: 'owner', password: 'test-password' }) });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('set-cookie'), /HttpOnly/);
  assert.match(response.headers.get('set-cookie'), /; Secure$/);
});

test('hosting: owner bootstrap is disabled even when the platform forwards over loopback', async t => {
  let setupCalled = false;
  const base = await serve(t, { environment, logger: quiet, storeFactory: async () => ({ isSetup: async () => false, setup() { setupCalled = true; } }) });
  const status = await fetch(`${base}/api/status`);
  assert.equal((await status.json()).setupAllowed, false);
  const response = await fetch(`${base}/api/setup`, { method: 'POST', headers, body: '{}' });
  assert.equal(response.status, 403);
  assert.equal(setupCalled, false);
});

test('hosting: initialization recovers after a transient failure without exposing driver secrets', async t => {
  let connections = 0;
  const logged = [];
  const secret = 'driver-message-with-sensitive-connection';
  const base = await serve(t, {
    environment, logger: { error: (...args) => logged.push(args) },
    storeFactory: async () => {
      if (++connections === 1) throw Object.assign(new Error(secret), { code: 'ECONNREFUSED' });
      return { backend: 'postgres', isSetup: async () => true };
    }
  });
  const failed = await fetch(`${base}/api/status`);
  assert.equal(failed.status, 503);
  assert.equal((await failed.text()).includes(secret), false);
  assert.equal(JSON.stringify(logged).includes(secret), false);
  assert.match(JSON.stringify(logged), /ECONNREFUSED/);
  assert.equal((await fetch(`${base}/api/status`)).status, 200);
  assert.equal(connections, 2);
});
