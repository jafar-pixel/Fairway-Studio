import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { requestOrigin } from './request-origin-test-loader.mjs';

const root = path.resolve(new URL('../', import.meta.url).pathname.replace(/^\/(.:)/, '$1'));
function load(file, deps = {}) {
  const filename = path.join(root, file);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const context = { exports: {}, Response, Request, URL, URLSearchParams, TextEncoder, crypto, require: key => { if (!(key in deps)) throw Error(`Unexpected dependency: ${key}`); return deps[key]; } };
  vm.runInNewContext(code, context, { filename });
  return context.exports;
}

const shared = load('lib/studio/contracts.ts');
const contracts = load('lib/studio/founder-updates/contracts.ts', { '../contracts': shared });
const workspaceId = '10000000-0000-4000-8000-000000000001';
const requestId = '20000000-0000-4000-8000-000000000002';
const postId = '30000000-0000-4000-8000-000000000003';

test('Founder Updates validation accepts bounded operations and rejects forged identity', () => {
  assert.equal(contracts.validateFounderUpdateMutation({ workspaceId, requestId, operation: 'createPost', input: { title: 'Update', body: 'News' } }).operation, 'createPost');
  assert.equal(contracts.validateFounderUpdateMutation({ workspaceId, requestId, operation: 'setPinned', input: { post_id: postId, is_pinned: true } }).operation, 'setPinned');
  assert.equal(contracts.validateFounderUpdateMutation({ workspaceId, requestId, operation: 'addComment', input: { post_id: postId, body: 'Reply' } }).operation, 'addComment');
  assert.throws(() => contracts.validateFounderUpdateMutation({ workspaceId, requestId, operation: 'createPost', input: { title: 'Update', body: 'News', author_id: requestId } }), error => error.code === 'VALIDATION');
  assert.throws(() => contracts.validateFounderUpdateMutation({ workspaceId, requestId, operation: 'setPinned', input: { post_id: postId, is_pinned: 'yes' } }), error => error.code === 'VALIDATION');
});

function route() {
  let writes = 0;
  return { writes: () => writes, ...load('app/api/studio/founder-updates/route.ts', {
    '@/lib/studio/contracts': shared,
    '@/lib/studio/founder-updates/contracts': contracts,
    '@/lib/studio/founder-updates/server': { readFounderUpdates: async () => ({ schemaVersion: 1, posts: [] }), mutateFounderUpdates: async () => { writes++; return { schemaVersion: 1, posts: [] }; } },
    '@/lib/studio/request-origin': requestOrigin,
  }) };
}

test('Founder Updates HTTP responses are private and reject cross-origin writes before mutation', async () => {
  const api = route();
  const get = await api.GET(new Request(`https://fairway.example/api/studio/founder-updates?workspaceId=${workspaceId}`));
  assert.equal(get.status, 200); assert.equal(get.headers.get('Cache-Control'), 'private, no-store');
  const body = JSON.stringify({ workspaceId, requestId, operation: 'addComment', input: { post_id: postId, body: 'Reply' } });
  const rejected = await api.POST(new Request('https://fairway.example/api/studio/founder-updates', { method: 'POST', headers: { origin: 'https://evil.example' }, body }));
  assert.equal(rejected.status, 403); assert.equal(api.writes(), 0);
});

test('Founder Updates route is part of Business navigation', () => {
  const routes = load('lib/studio/workflows/routes.ts');
  assert.equal(routes.parseWorkflowRoute(['business', 'founder-updates']).kind, 'founderUpdates');
  assert.equal(routes.workflowRouteLabel({ kind: 'founderUpdates' }), 'Founder Updates');
  assert.equal(routes.parseWorkflowRoute(['business', 'founder-updates', postId]).kind, 'invalid');
});

test('migration preserves authorship, workspace RLS and the requested origin story', () => {
  const sql = fs.readFileSync(path.join(root, 'supabase/migrations/20261011062001_founder_updates.sql'), 'utf8');
  for (const text of ['enable row level security', 'workspace_members', "lower(trim(p.display_name)) = 'jafar'", 'Arlin brought forward the Hunter & Heckard name', 'Jafar developed the first logo concept', 'collaborative design material']) assert.match(sql, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
  assert.match(sql, /grant update \(is_pinned\)/i);
  assert.doesNotMatch(sql, /grant (insert|update|delete) on public\.studio_founder_updates to authenticated/i);
});
