import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../lib/studio/private-business/client.ts', import.meta.url), 'utf8');
const workspace = '00000000-0000-4000-8000-000000000001';
const id = '00000000-0000-4000-8000-000000000002';
const page = { books: [], page: 0, pageSize: 50, total: 0 };
// Node's fetch and arrow mocks do not enforce the browser Web IDL receiver check.
// Model that check before transport, in the same realm as the production client.
function browserClient(transport, code = source) {
  const context = vm.createContext({ exports: {}, crypto: webcrypto, URL, URLSearchParams, Response, Error, AbortController, setTimeout, clearTimeout, transport });
  vm.runInContext('globalThis.fetch = function (url, init) { "use strict"; if (this !== globalThis) throw new TypeError("Illegal invocation"); return transport(url, init); };', context);
  vm.runInContext(ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return new context.exports.PrivateBusinessClient(workspace, id);
}

test('default browser fetch uses its global receiver and preserves private read safeguards', async () => {
  const requests = [];
  const client = browserClient(async (url, init) => { requests.push({ url, init }); return Response.json(page); });
  assert.equal((await client.read({ q: 'Private search' })).total, 0);
  assert.equal(requests.length, 1);
  const { url, init } = requests[0];
  assert.equal(url, '/api/studio/private-business');
  assert.equal(init.credentials, 'same-origin');
  assert.equal(init.cache, 'no-store');
  assert.equal(init.redirect, 'error');
  assert.equal(init.referrerPolicy, 'no-referrer');
  assert.deepEqual(JSON.parse(init.body), { action: 'read', workspaceId: workspace, expectedUserId: id, query: 'Private search' });
});

test('default browser fetch sends writes and replays exactly one uncertain envelope', async () => {
  const bodies = [];
  const client = browserClient(async (_url, init) => { bodies.push(init.body); if (bodies.length === 1) throw new Error('connection interrupted'); return Response.json({ data: { book: { id } } }); });
  await assert.rejects(client.mutate('createBook', { title: 'Private register' }), error => error.code === 'NETWORK' && error.uncertain);
  assert.equal(bodies.length, 1);
  assert.equal(client.uncertain, true);
  assert.equal((await client.retry()).book.id, id);
  assert.equal(bodies.length, 2);
  assert.equal(bodies[0], bodies[1]);
  assert.equal(client.uncertain, false);
});

test('default browser transport keeps explicit access denials fail-closed', async () => {
  let calls = 0;
  const client = browserClient(async () => { calls++; if (calls === 1) throw new Error('uncertain'); return Response.json({ error: 'Denied', code: 'FORBIDDEN' }, { status: 403 }); });
  await assert.rejects(client.mutate('createBook', { title: 'Private register' }));
  assert.equal(client.uncertain, true);
  await assert.rejects(client.read(), error => error.status === 403 && error.accessLost);
  assert.equal(calls, 2);
  assert.equal(client.uncertain, false);
});

test('default browser transport preserves read aborts rather than masking them', async () => {
  const aborted = new Error('Aborted'); aborted.name = 'AbortError';
  let signal;
  const client = browserClient(async (_url, init) => { signal = init.signal; throw aborted; });
  const controller = new AbortController(); controller.abort();
  await assert.rejects(client.read({}, controller.signal), error => error === aborted);
  assert.equal(signal.aborted, true);
});

test('legacy default reproduces the reported immediate error before any request', async () => {
  let calls = 0;
  const legacy = source.replace('private readonly fetcher: typeof fetch = (input, init) => globalThis.fetch(input, init)', 'private readonly fetcher: typeof fetch = fetch');
  const client = browserClient(async () => { calls++; return Response.json(page); }, legacy);
  await assert.rejects(client.read(), error => error.code === 'NETWORK' && error.status === 0 && error.message === 'Could not connect. Check your connection and refresh.');
  assert.equal(calls, 0);
});
