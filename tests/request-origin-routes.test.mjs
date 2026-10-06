import test from 'node:test';
import assert from 'node:assert/strict';
import { timingSafeEqual } from 'node:crypto';
import { loadModule, media } from './media-test-harness.mjs';
import { requestOrigin } from './request-origin-test-loader.mjs';
const globals = { Request, Response, Headers, TextEncoder, TextDecoder, Buffer, Uint8Array, process: { env: { STUDIO_TEXT_MODEL: 'openai/gpt-5.4-mini' } } };
const shared = loadModule('lib/studio/contracts.ts');
const validation = loadModule('lib/studio/media/validation.ts', { '../media': media }, globals);
const mediaRequest = loadModule('lib/studio/media/request.ts', { './validation': validation }, globals);
const workspaceId = '11111111-1111-4111-8111-111111111111', userId = '22222222-2222-4222-8222-222222222222';
const envelope = { workspaceId, requestId: userId };
const origins = ['https://sports-brand-collaboration-setup.vercel.app', 'https://sports-brand-collaboration-setup.v0.build'];

function harness(name) {
  const calls = [];
  const record = (name, value = {}) => async () => { calls.push(name); return value; };
  const client = { rpc: record('rpc', { data: { persisted: true }, error: null }), from() { calls.push('query'); const q = { select: () => q, eq: () => q, limit: async () => ({ data: [], error: null }) }; return q; } };
  const server = { authorize: record('authorize', { client, user: { id: userId } }), databaseError: () => new shared.StudioError('Test failure', 'INTERNAL', 500) };
  const deps = { '@/lib/studio/request-origin': requestOrigin, '@/lib/studio/contracts': shared, '@/lib/studio/server': server };
  let body, status = 200;
  if (name === 'workflow') {
    deps['@/lib/studio/workflow'] = loadModule('lib/studio/workflow.ts', { './server': server, './contracts': shared }, globals);
    body = { ...envelope, operation: 'linkIdeaAsset', input: {} };
  } else if (['business', 'private-business', 'social'].includes(name)) {
    deps[`@/lib/studio/${name}/contracts`] = loadModule(`lib/studio/${name}/contracts.ts`, { '../contracts': shared }, globals);
    const key = { business: 'Business', 'private-business': 'PrivateBusiness', social: 'Social' }[name];
    deps[`@/lib/studio/${name}/server`] = { [`mutate${key}`]: record('mutate', { persisted: true }) };
    body = name === 'business' ? { ...envelope, operation: 'createPlan', input: { title: 'Plan' } }
      : name === 'private-business' ? { ...envelope, expectedUserId: userId, operation: 'createBook', input: { title: 'Book' } }
      : { ...envelope, operation: 'saveDraft', input: { title: 'Draft', channel: 'instagram', account_label: '@fairway', format: 'post', owner_id: userId, timezone: 'Etc/UTC', stage: 'draft', assets: [] } };
  } else if (name === 'generation') {
    deps['node:crypto'] = { timingSafeEqual };
    deps['@/lib/studio/generation'] = { createGeneration: record('generate', { id: userId, status: 'queued' }) };
    body = { action: 'create', workspaceId }; status = 202;
  } else if (name === 'guide') {
    deps.ai = { gateway: model => model, generateText: record('generateText', { text: 'Answer' }) };
    body = { workspaceId, question: 'What ideas are there?', context: ['ideas'] };
  } else if (name === 'media/jobs') {
    deps['@/lib/studio/media/dispatch'] = { scheduleMediaProcessing: () => { calls.push('schedule'); } };
    deps['@/lib/studio/media/request'] = mediaRequest;
    deps['@/lib/studio/media'] = media;
    deps['@/lib/studio/media/jobs'] = { retryMediaJob: record('retry', { id: userId, status: 'queued' }), clientMediaJob: job => job, mediaWorkerStatus: record('worker', { available: true }) };
    deps['@/lib/studio/media/storage'] = { PRIVATE_HEADERS: { 'Cache-Control': 'private, no-store' } };
    deps['@/lib/studio/media/validation'] = validation;
    body = { action: 'retry', workspaceId, jobId: userId };
  }
  const api = loadModule(`app/api/studio/${name}/route.ts`, deps, globals);
  function make(headers = {}, url = `http://127.0.0.1:3000/api/studio/${name}`) {
    const req = new Request(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
    for (const key of ['text', 'json']) { const original = req[key].bind(req); req[key] = () => { calls.push('body'); return original(); }; }
    return req;
  }
  return { api, calls, make, status };
}

for (const name of ['workflow', 'business', 'private-business', 'social', 'generation', 'guide', 'media/jobs']) {
  test(`${name}: foreign, malformed and ambiguous origins stop before body/auth/RPC`, async () => {
    for (const origin of ['https://evil.test', 'null', '', origins[0] + '/', origins[0] + ', ' + origins[0], origins[0] + ' ' + origins[1]]) {
      const h = harness(name);
      const req = h.make({ origin, host: new URL(origins[0]).host, 'x-forwarded-proto': 'https' });
      const response = await h.api.POST(req);
      assert.equal(req.bodyUsed, false);
      assert.equal(response.status, 403, origin);
      assert.deepEqual(h.calls, [], 'origin rejection must precede every side effect and body read');
      assert.equal(response.headers.get('access-control-allow-origin'), null);
      assert.equal(response.headers.get('access-control-allow-credentials'), null);
    }
  });
  test(`${name}: arbitrary forwarded metadata cannot bypass the route guard`, async () => {
    for (const headers of [
      { origin: 'https://evil.test', 'x-forwarded-host': 'evil.test', 'x-forwarded-proto': 'https' },
      { origin: 'https://evil.test', host: 'evil.test', 'x-forwarded-proto': 'https' },
      { origin: origins[0], 'x-forwarded-host': new URL(origins[0]).host + ', evil.test', 'x-forwarded-proto': 'https' },
      { origin: origins[0], host: new URL(origins[0]).host, 'x-forwarded-proto': 'https, http' },
      { origin: origins[0].replace('https:', 'http:'), 'x-forwarded-host': new URL(origins[0]).host, 'x-forwarded-proto': 'https' },
    ]) {
      const h = harness(name), req = h.make(headers); assert.equal((await h.api.POST(req)).status, 403); assert.equal(req.bodyUsed, false); assert.deepEqual(h.calls, []);
    }
  });
  test(`${name}: exact HTTPS production and preview saves reach the actual route success path`, async () => {
    for (const origin of origins) for (const header of ['host', 'x-forwarded-host']) {
      const h = harness(name);
      const req = h.make({ origin, [header]: new URL(origin).host, 'x-forwarded-proto': 'https', 'sec-fetch-site': 'same-origin' });
      const response = await h.api.POST(req);
      assert.equal(response.status, h.status, JSON.stringify(await response.json()));
      assert.equal(req.bodyUsed, true);
      assert.ok(h.calls.some(value => ['rpc', 'mutate', 'generate', 'generateText', 'retry'].includes(value)), 'the authorized business action must be reached');
    }
  });
  test(`${name}: direct same-origin and missing-Origin server calls remain compatible`, async () => {
    for (const headers of [{}, { origin: 'http://127.0.0.1:3000' }]) {
      const h = harness(name); assert.equal((await h.api.POST(h.make(headers))).status, h.status);
    }
  });
}

for (const name of ['business', 'private-business', 'social']) {
  test(`${name}: existing cross-site Fetch Metadata defense survives even with trusted or absent Origin`, async () => {
    for (const origin of [undefined, origins[0]]) {
      const h = harness(name);
      const headers = { 'sec-fetch-site': 'cross-site', host: new URL(origins[0]).host, 'x-forwarded-proto': 'https', ...(origin ? { origin } : {}) };
      assert.equal((await h.api.POST(h.make(headers))).status, 403); assert.deepEqual(h.calls, []);
    }
  });
}
