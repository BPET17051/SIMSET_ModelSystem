// Run: node --test scripts/verify-worker-cache-offline.cjs
// No network: the real handler runs in a VM with only fixture fetch/cache APIs.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../cloudflare-worker/worker.js'), 'utf8');
const env = { SUPABASE_URL: 'https://upstream.invalid', SUPABASE_KEY: 'fixture-public-key' };
const endpoint = 'https://worker.invalid/rest/v1/equipments?select=id';

function harness({ stale = false, status = 200, throws = false } = {}) {
  const calls = [];
  const cacheCalls = [];
  const stored = new Map();
  const pending = [];
  if (stale) stored.set(endpoint, new Response('private-user-A'));
  const context = vm.createContext({
    Request, Response, Headers, URL,
    caches: { get default() {
      cacheCalls.push('default');
      return {
        async match(key) {
          cacheCalls.push('match');
          return stored.get(key.url)?.clone();
        },
        async put(key, response) {
          cacheCalls.push('put');
          stored.set(key.url, response.clone());
        },
      };
    } },
    fetch: async (url, options) => {
      assert.equal(new URL(url).origin, env.SUPABASE_URL, 'Unexpected upstream');
      calls.push({ url, ...options });
      if (throws) throw new Error('fixture transport failure');
      return new Response(options.headers.get('Authorization'), {
        status,
        headers: { 'Cache-Control': 'public, max-age=3600', 'Content-Type': 'text/plain', 'X-Fixture': 'preserved' },
      });
    },
  });
  // Only adapt the module export; handler logic is unchanged.
  new vm.Script(source.replace('export default {', 'globalThis.worker = {'), {
    filename: 'cloudflare-worker/worker.js',
  }).runInContext(context);
  return {
    calls, cacheCalls,
    async request(headers = {}, method = 'GET', url = endpoint) {
      const response = await context.worker.fetch(new Request(url, {
        method, headers,
        ...(method === 'POST' ? { body: '{"fixture":true}' } : {}),
      }), env, { waitUntil(promise) { pending.push(promise); } });
      await Promise.all(pending);
      return response;
    },
  };
}

test('A, B and Guest always receive their own upstream response at the same URL', async () => {
  const h = harness();
  for (const [authorization, expected] of [
    ['Bearer fixture-A', 'Bearer fixture-A'],
    ['Bearer fixture-B', 'Bearer fixture-B'],
    ['Bearer worker-managed-key', 'Bearer fixture-public-key'],
    [null, 'Bearer fixture-public-key'],
    ['Bearer fixture-A', 'Bearer fixture-A'],
  ]) {
    const response = await h.request(authorization ? { Authorization: authorization } : {});
    assert.equal(await response.text(), expected);
  }
  assert.equal(h.calls.length, 5);
  assert.deepEqual(h.cacheCalls, []);
});

test('stale private cache is ignored for both B and Guest', async () => {
  const h = harness({ stale: true });
  for (const [authorization, expected] of [
    ['Bearer fixture-B', 'Bearer fixture-B'],
    ['Bearer worker-managed-key', 'Bearer fixture-public-key'],
  ]) {
    assert.equal(await (await h.request({ Authorization: authorization })).text(), expected);
  }
  assert.deepEqual(h.cacheCalls, []);
});

for (const [method, status] of [['GET', 200], ['POST', 201], ['GET', 401], ['GET', 500], ['POST', 400], ['GET', 302]]) {
  test(`${method} upstream ${status} is preserved and cannot be cached`, async () => {
    const h = harness({ status });
    const response = await h.request({ Authorization: 'Bearer fixture-A' }, method);
    assert.equal(response.status, status);
    assert.equal(await response.text(), 'Bearer fixture-A');
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.equal(response.headers.get('X-Fixture'), 'preserved');
    assert.deepEqual(h.cacheCalls, []);
  });
}

test('transport failure returns non-cacheable 502', async () => {
  const h = harness({ throws: true });
  const response = await h.request();
  assert.equal(response.status, 502);
  assert.equal(await response.text(), 'Bad Gateway');
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(h.cacheCalls, []);
});

test('JWT, SDK headers, body, query and legacy catalog routing are preserved', async () => {
  const h = harness();
  await h.request({
    Authorization: 'Bearer fixture-B', apikey: 'worker-managed-key',
    'Content-Type': 'application/json', Prefer: 'return=representation',
    'x-client-info': 'fixture-sdk', 'content-profile': 'public', Range: '0-9',
    Origin: 'http://localhost:8788', 'CF-Connecting-IP': '192.0.2.1',
  }, 'POST', 'https://worker.invalid/rest/v1/rpc/get_my_borrow_requests?fixture=1');
  const call = h.calls[0];
  assert.equal(call.url, 'https://upstream.invalid/rest/v1/rpc/get_my_borrow_requests?fixture=1');
  assert.equal(call.headers.get('Authorization'), 'Bearer fixture-B');
  assert.equal(call.headers.get('apikey'), 'fixture-public-key');
  for (const [name, value] of Object.entries({ 'Content-Type': 'application/json', Prefer: 'return=representation', 'x-client-info': 'fixture-sdk', 'content-profile': 'public', Range: '0-9' })) {
    assert.equal(call.headers.get(name), value);
  }
  assert.equal(call.headers.has('CF-Connecting-IP'), false);
  assert.equal(call.method, 'POST');
  assert.equal(call.redirect, 'manual');
  assert.equal(Buffer.from(call.body).toString(), '{"fixture":true}');
  const catalog = await h.request({}, 'GET', 'https://worker.invalid/api/public_manikins?select=id');
  assert.equal(h.calls[1].url, 'https://upstream.invalid/rest/v1/public_manikins?select=id');
  assert.equal(catalog.status, 200);
  assert.equal(await catalog.text(), 'Bearer fixture-public-key');
  assert.equal(catalog.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(h.cacheCalls, []);
});
