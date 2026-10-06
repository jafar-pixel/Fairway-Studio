import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import ts from 'typescript';

const workspaceId = '10000000-0000-4000-8000-000000000001';
const userId = '20000000-0000-4000-8000-000000000001';
const otherUserId = '30000000-0000-4000-8000-000000000001';
const bookId = '40000000-0000-4000-8000-000000000001';
const recordId = '50000000-0000-4000-8000-000000000001';
const requestId = '60000000-0000-4000-8000-000000000001';
const url = 'https://fairway.example/api/studio/private-business';
const page = { books: [], page: 0, pageSize: 50, total: 0, asOf: '2026-10-03' };

function load(path, dependencies = {}) {
  const source = fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
  const context = {
    exports: {}, Request, Response, URL, URLSearchParams, TextEncoder, Error,
    crypto: webcrypto, AbortController, setTimeout, clearTimeout, fetch,
    require(name) {
      if (Object.hasOwn(dependencies, name)) return dependencies[name];
      throw new Error('Unexpected dependency: ' + name);
    },
  };
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, context, { filename: path });
  return context.exports;
}
const shared = load('lib/studio/contracts.ts');
const contracts = load('lib/studio/private-business/contracts.ts', { '../contracts': shared });
const clientModule = load('lib/studio/private-business/client.ts');
// All origin, route, intended-account, and workspace authorization logic is real.
// Only the Supabase I/O boundary is replaced; it never contacts a live database.
const requestOrigin = load('lib/studio/request-origin.ts');
function harness() {
  const state = { account: userId, workspaceAccess: true, privateAccess: true };
  const calls = [];
  const studioServer = load('lib/studio/server.ts', {
    '@/lib/supabase/server': { createClient: async () => {
      const actor = state.account;
      return {
        auth: { getUser: async () => {
          calls.push({ name: 'getUser', actor });
          return { data: { user: actor ? { id: actor } : null }, error: null };
        } },
        from(name) {
          assert.equal(name, 'workspace_members');
          const filters = {};
          const query = {
            select(value) { assert.equal(value, 'role'); return query; },
            eq(key, value) { filters[key] = value; return query; },
            async maybeSingle() {
              assert.deepEqual(filters, { workspace_id: workspaceId, user_id: actor });
              calls.push({ name: 'membership', actor });
              return { data: state.workspaceAccess ? { role: 'owner' } : null, error: null };
            },
          };
          return query;
        },
        async rpc(name, input) {
          calls.push({ name, actor, input });
          if (name === 'studio_private_business_capabilities') return { data: { schemaVersion: 1, restrictedRecords: true }, error: null };
          if (!state.privateAccess) return { data: null, error: { code: '42501', message: 'Private database detail must never escape' } };
          if (name === 'studio_private_business_read') return { data: page, error: null };
          assert.equal(name, 'studio_private_business_mutate');
          return { data: { book: { id: bookId } }, error: null };
        },
      };
    } },
    './imported-content': { hydrateImportedContent() { throw new Error('Unrelated content hydration must not run'); } },
    './contracts': shared,
  });
  const server = load('lib/studio/private-business/server.ts', {
    '../server': studioServer, '../contracts': shared, './contracts': contracts,
  });
  const route = load('app/api/studio/private-business/route.ts', {
    '@/lib/studio/contracts': shared,
    '@/lib/studio/private-business/contracts': contracts,
    '@/lib/studio/private-business/server': server,
    '@/lib/studio/request-origin': requestOrigin,
  });
  return { state, calls, server, route, rpc: () => calls.filter(call => call.name.startsWith('studio_private_')) };
}
function post(body, headers = {}, target = url) {
  return new Request(target, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
}
function mutation(operation = 'createBook', input = { title: 'Private register' }) {
  return { workspaceId, expectedUserId: userId, requestId, operation, input };
}
const inputs = {
  createBook: { title: 'Private register' },
  updateBook: { book_id: bookId, expected_revision: 1, title: 'Private register' },
  saveRecord: { book_id: bookId, record: { kind: 'document', title: 'Private document' } },
  addDocumentVersion: { book_id: bookId, id: recordId, expected_revision: 1, label: 'Version', url: 'https://example.org/document' },
  approveBudget: { book_id: bookId, id: recordId, expected_revision: 1, rationale: 'Reviewed plan', purpose: 'manual_budget_plan_only' },
  setGrant: { book_id: bookId, expected_revision: 1, user_id: otherUserId, permission: 'read' },
};

for (const [operation, input] of Object.entries(inputs)) {
  test(`real ${operation} route binds validated actor before every private RPC`, async () => {
    const h = harness();
    const body = mutation(operation, input);
    h.state.account = otherUserId;
    const denied = await h.route.POST(post(body));
    assert.equal(denied.status, 403);
    assert.equal((await denied.json()).code, 'ACCOUNT_CHANGED');
    assert.equal(h.rpc().length, 0);
    assert.equal(h.calls.filter(call => call.name === 'getUser').length, 1);
    h.state.account = userId;
    const allowed = await h.route.POST(post(body));
    assert.equal(allowed.status, 200);
    assert.deepEqual(h.rpc().map(call => call.name), ['studio_private_business_capabilities', 'studio_private_business_mutate']);
    assert.ok(h.rpc().every(call => call.actor === userId));
    const sent = h.rpc()[1].input;
    assert.equal(sent.p_operation, operation);
    assert.equal(sent.p_request, requestId);
    assert.equal('expectedUserId' in sent.p_input, false, 'intent is not inserted as record ownership or an ACL grant');
  });
}

for (const query of [{}, { bookId }, { bookId, recordId }, { options: 'plans' }, { options: 'members' }]) {
  for (const method of ['GET', 'POST']) {
    test(`real ${method} ${query.options || (query.recordId ? 'record' : query.bookId ? 'register' : 'books')} read checks intended account`, async () => {
      const h = harness();
      const body = { action: 'read', workspaceId, expectedUserId: userId, ...query };
      const send = () => method === 'GET'
        ? h.route.GET(new Request(url + '?' + new URLSearchParams({ workspaceId, expectedUserId: userId, ...query })))
        : h.route.POST(post(body));
      h.state.account = otherUserId;
      assert.equal((await send()).status, 403);
      assert.equal(h.rpc().length, 0);
      h.state.account = userId;
      assert.equal((await send()).status, 200);
      assert.equal(h.rpc()[1].name, 'studio_private_business_read');
      assert.ok(h.rpc().every(call => call.actor === userId));
    });
  }
}

test('missing or malformed actor never reaches authentication or RPC, including direct server calls', async () => {
  for (const expectedUserId of [undefined, null, '', 'not-a-user', 3, {}, []]) {
    const h = harness();
    assert.equal((await h.route.POST(post({ ...mutation(), expectedUserId }))).status, 422);
    assert.equal((await h.route.POST(post({ action: 'read', workspaceId, expectedUserId }))).status, 422);
    const params = new URLSearchParams({ workspaceId });
    if (expectedUserId !== undefined) params.set('expectedUserId', String(expectedUserId));
    assert.equal((await h.route.GET(new Request(url + '?' + params))).status, 422);
    await assert.rejects(h.server.mutatePrivateBusiness({ ...mutation(), expectedUserId }), error => error.code === 'VALIDATION');
    assert.equal(h.calls.length, 0);
  }
});

test('sign-out and workspace revocation remain authoritative even with a matching intended user', async () => {
  for (const change of [{ account: null }, { workspaceAccess: false }]) {
    const h = harness(); Object.assign(h.state, change);
    for (const body of [mutation(), { action: 'read', workspaceId, expectedUserId: userId }]) {
      const response = await h.route.POST(post(body));
      assert.equal(response.status, change.account === null ? 401 : 403);
    }
    assert.equal(h.rpc().length, 0);
  }
});

test('strict mutation contract requires intended identity without permitting forged actors', () => {
  const valid = mutation();
  assert.equal(contracts.validatePrivateMutation(valid).expectedUserId, userId);
  for (const body of [{ ...valid, actorId: userId }, { ...valid, expectedUserId: undefined }, { ...valid, input: { ...valid.input, created_by: userId } }]) {
    assert.throws(() => contracts.validatePrivateMutation(body), error => error.code === 'VALIDATION');
  }
});

test('untrusted and ambiguous proxy origins cannot reach account checks', async () => {
  for (const headers of [
    { origin: 'https://evil.example' },
    { origin: 'https://another-tenant.vercel.app', 'x-forwarded-host': 'another-tenant.vercel.app', 'x-forwarded-proto': 'https' },
    { origin: 'https://sports-brand-collaboration-setup.vercel.app', 'x-forwarded-host': 'sports-brand-collaboration-setup.vercel.app,evil.example', 'x-forwarded-proto': 'https' },
    { 'sec-fetch-site': 'cross-site' },
  ]) {
    const h = harness();
    assert.equal((await h.route.POST(post(mutation(), headers))).status, 403);
    assert.equal(h.calls.length, 0);
  }
});

test('approved exact proxy origin and ordinary same origin preserve account checks', async () => {
  for (const [target, headers] of [
    [url, { origin: 'https://fairway.example' }],
    ['http://localhost:3000/api/studio/private-business', { origin: 'https://sports-brand-collaboration-setup.vercel.app', 'x-forwarded-host': 'sports-brand-collaboration-setup.vercel.app', 'x-forwarded-proto': 'https' }],
  ]) {
    const h = harness();
    assert.equal((await h.route.POST(post(mutation(), headers, target))).status, 200);
    h.state.account = otherUserId;
    assert.equal((await h.route.POST(post(mutation(), headers, target))).status, 403);
    assert.equal(h.rpc().length, 2);
  }
});

test('all real-route outcomes stay private and redact internal denial details', async () => {
  const h = harness();
  const outcomes = [await h.route.POST(post(mutation()))];
  h.state.privateAccess = false;
  outcomes.push(await h.route.POST(post(mutation())));
  h.state.account = otherUserId;
  outcomes.push(await h.route.POST(post(mutation())));
  outcomes.push(await h.route.POST(post({ ...mutation(), expectedUserId: '' })));
  for (const response of outcomes) {
    assert.match(response.headers.get('cache-control'), /private, no-store/);
    assert.equal(response.headers.get('vary'), 'Cookie');
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
    assert.doesNotMatch(await response.text(), /Private database detail/);
  }
});

function transport(h) {
  return async (_url, init) => h.route.POST(new Request(url, init));
}
const accessLost = error => error.accessLost === true;

test('account-switched uncertain retry preserves original frozen actor and never executes as new user', async () => {
  const h = harness(); const bodies = [];
  const client = new clientModule.PrivateBusinessClient(workspaceId, userId, async (_url, init) => {
    bodies.push(init.body);
    const response = await transport(h)(_url, init);
    if (bodies.length === 1) throw new Error('Response lost after server execution');
    return response;
  });
  const input = { title: 'Original private register' };
  await assert.rejects(client.mutate('createBook', input), error => error.uncertain === true);
  input.title = 'Changed after sending';
  assert.equal(client.uncertain, true);
  h.state.account = otherUserId;
  await assert.rejects(client.retry(), error => error.code === 'ACCOUNT_CHANGED' && error.accessLost && !error.uncertain);
  assert.equal(bodies[0], bodies[1]);
  assert.equal(JSON.parse(bodies[1]).expectedUserId, userId);
  assert.equal(JSON.parse(bodies[1]).input.title, 'Original private register');
  assert.equal(h.rpc().filter(call => call.name === 'studio_private_business_mutate').length, 1);
  assert.ok(h.rpc().every(call => call.actor === userId));
  assert.equal(client.uncertain, false);
  assert.equal(client.pending, false);
  await assert.rejects(client.retry(), error => error.code === 'REQUEST_PENDING');
  assert.equal(bodies.length, 2);
});

test('matching-account uncertain retry uses identical bytes, intent, and request ID', async () => {
  const h = harness(); const bodies = [];
  const client = new clientModule.PrivateBusinessClient(workspaceId, userId, async (_url, init) => {
    bodies.push(init.body);
    if (bodies.length === 1) throw new Error('Connection interrupted');
    return transport(h)(_url, init);
  });
  await assert.rejects(client.mutate('createBook', { title: 'Retry' }), error => error.uncertain === true);
  assert.equal((await client.retry()).book.id, bookId);
  assert.equal(bodies[0], bodies[1]);
  assert.equal(JSON.parse(bodies[0]).expectedUserId, userId);
  assert.equal(client.uncertain, false);
});

test('read query cannot override the client account or workspace binding', async () => {
  const h = harness(); const bodies = [];
  const client = new clientModule.PrivateBusinessClient(workspaceId, userId, async (_url, init) => {
    bodies.push(init.body); return transport(h)(_url, init);
  });
  await client.read({ workspaceId: bookId, expectedUserId: otherUserId, action: 'mutate', q: 'Private search' });
  const body = JSON.parse(bodies[0]);
  assert.equal(body.workspaceId, workspaceId);
  assert.equal(body.expectedUserId, userId);
  assert.equal(body.action, 'read');
  assert.equal(body.query, 'Private search');
  assert.equal(h.rpc()[1].name, 'studio_private_business_read');
});

for (const operation of ['read', 'mutate']) {
  test(`late ${operation} success cannot restore output after account mismatch revokes access`, async () => {
    const h = harness(); let release; let began;
    const started = new Promise(resolve => { began = resolve; });
    let count = 0;
    const client = new clientModule.PrivateBusinessClient(workspaceId, userId, async (_url, init) => {
      const response = await transport(h)(_url, init);
      if (++count === 1) { began(); return new Promise(resolve => { release = () => resolve(response); }); }
      return response;
    });
    const pending = operation === 'read' ? client.read() : client.mutate('createBook', { title: 'Original' });
    await started;
    h.state.account = otherUserId;
    await assert.rejects(client.read(), error => error.code === 'ACCOUNT_CHANGED' && error.accessLost);
    release();
    await assert.rejects(pending, accessLost);
    assert.equal(client.uncertain, false);
    assert.ok(h.rpc().every(call => call.actor === userId));
  });
}

test('private ACL revocation clears uncertain output and keeps database denial private', async () => {
  const h = harness(); let loseResponse = true;
  const client = new clientModule.PrivateBusinessClient(workspaceId, userId, async (_url, init) => {
    if (loseResponse) { loseResponse = false; throw new Error('Interrupted'); }
    return transport(h)(_url, init);
  });
  await assert.rejects(client.mutate('createBook', { title: 'Private' }), error => error.uncertain);
  h.state.privateAccess = false;
  await assert.rejects(client.read({ bookId }), error => error.accessLost && !error.message.includes('database detail'));
  assert.equal(client.uncertain, false);
  await assert.rejects(client.retry(), error => error.code === 'REQUEST_PENDING');
});

test('request intent and nested inputs are immutable and never share the caller object', () => {
  const input = { record: { title: 'Original' } };
  const request = clientModule.createPrivateRequest(workspaceId, userId, 'saveRecord', input);
  input.record.title = 'Changed';
  assert.equal(request.input.record.title, 'Original');
  assert.equal(request.expectedUserId, userId);
  assert.equal(Object.isFrozen(request), true);
  assert.equal(Object.isFrozen(request.input.record), true);
  assert.throws(() => { request.expectedUserId = otherUserId; }, TypeError);
});

test('a client without an explicit valid user cannot read or save', async () => {
  for (const actor of [undefined, '', 'not-a-user']) {
    let calls = 0;
    const client = new clientModule.PrivateBusinessClient(workspaceId, actor, async () => { calls++; return Response.json(page); });
    await assert.rejects(client.read(), accessLost);
    await assert.rejects(client.mutate('createBook', { title: 'Private' }), accessLost);
    assert.equal(calls, 0);
    assert.equal(client.uncertain, false);
  }
});
