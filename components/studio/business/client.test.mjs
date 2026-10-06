import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const clientPath = path.join(root, 'lib/studio/business/client.ts');
function load(filename, dependencies = {}) {
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const context = { exports: {}, crypto: webcrypto, Response, Request, URL, URLSearchParams, AbortController, Error, console, ...dependencies };
  context.require = name => {
    if (dependencies.modules && name in dependencies.modules) return dependencies.modules[name];
    if (name.endsWith('.css')) return { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) };
    if (name.startsWith('.')) {
      const target = path.resolve(path.dirname(filename), name);
      return load(['.ts', '.tsx', '.js'].map(ext => target + ext).find(fs.existsSync), dependencies);
    }
    return require(name);
  };
  vm.runInNewContext(code, context, { filename });
  return context.exports;
}
const w = '10000000-0000-0000-0000-000000000001';
const p = '20000000-0000-0000-0000-000000000002';
const r = '30000000-0000-0000-0000-000000000003';
const list = { schemaVersion: 1, plans: [], total: 0, page: 0, pageSize: 50, overview: { active: 0, ideas: 0, awaitingReview: 0, finals: 0, overdue: 0, blockedTasks: 0, overdueTasks: 0 }, members: [], userId: r };

test('request envelopes deep-copy and freeze inputs with one UUID', () => {
  const api = load(clientPath);
  const input = { title: 'Plan', tags: ['first'], nested: { id: p } };
  const request = api.createBusinessRequest(w, 'createPlan', input);
  input.tags.push('later'); input.nested.id = 'changed';
  assert.match(request.requestId, /^[a-f0-9-]{36}$/i);
  assert.equal(request.input.tags.length, 1); assert.equal(request.input.nested.id, p);
  assert.ok(Object.isFrozen(request)); assert.ok(Object.isFrozen(request.input.tags));
  assert.throws(() => { request.input.title = 'Changed'; }, TypeError);
});
test('interrupted writes retry the identical payload and ID, using no-store and same-origin credentials', async () => {
  const calls = [];
  const api = load(clientPath, { fetch: async (url, init) => { calls.push({ url, init }); if (calls.length === 1) throw new Error('offline'); return Response.json({ data: { plan: { id: p }, entityId: null } }); } });
  const request = api.createBusinessRequest(w, 'createPlan', { title: 'Exact original' });
  await assert.rejects(() => api.sendBusinessRequest(request), error => error.uncertain && error.code === 'NETWORK');
  await api.sendBusinessRequest(request);
  assert.equal(calls.length, 2); assert.equal(calls[0].init.body, calls[1].init.body);
  assert.equal(calls[1].init.cache, 'no-store'); assert.equal(calls[1].init.credentials, 'same-origin');
});
test('conflicts are distinct from uncertain writes', async () => {
  const api = load(clientPath, { fetch: async () => Response.json({ error: 'Plan changed', code: 'CONFLICT' }, { status: 409 }) });
  await assert.rejects(() => api.sendBusinessRequest(api.createBusinessRequest(w, 'updatePlan', { plan_id: p, expected_revision: 0 })), error => error.conflict && !error.uncertain && error.status === 409);
});
test('capability and permission gates never pretend to save', async () => {
  for (const [code, status] of [['SCHEMA_REQUIRED', 503], ['CONFIGURATION_REQUIRED', 503], ['FORBIDDEN', 403], ['UNAUTHENTICATED', 401]]) {
    const api = load(clientPath, { fetch: async () => Response.json({ error: 'Setup or access required', code }, { status }) });
    await assert.rejects(() => api.sendBusinessRequest(api.createBusinessRequest(w, 'createPlan', { title: 'Plan' })), error => error.unavailable && !error.uncertain);
  }
});
test('unreadable, malformed and internal write responses keep the request unresolved', async () => {
  for (const response of [() => new Response('not JSON'), () => Response.json({ ok: true }), () => Response.json({ error: 'Unavailable', code: 'INTERNAL' }, { status: 500 })]) {
    const api = load(clientPath, { fetch: async () => response() });
    await assert.rejects(() => api.sendBusinessRequest(api.createBusinessRequest(w, 'createPlan', { title: 'Plan' })), error => error.uncertain);
  }
});
test('raw and wrapped list DTOs use zero-based pages and reject missing aggregate data', async () => {
  for (const payload of [list, { data: list }]) {
    let called;
    const api = load(clientPath, { fetch: async (url, init) => { called = { url, init }; return Response.json(payload); } });
    const result = await api.readBusinessList(w, 0, 'finals');
    assert.equal(result.total, 0); assert.equal(result.page, 0);
    assert.match(called.url, /page=0/); assert.match(called.url, /view=finals/); assert.equal(called.init.cache, 'no-store');
  }
  const api = load(clientPath, { fetch: async () => Response.json({ ...list, overview: {} }) });
  await assert.rejects(() => api.readBusinessList(w, 0, 'all'), error => error.code === 'INVALID_RESPONSE');
});
test('option lookup encodes workspace and query without making a document fetch', async () => {
  let called;
  const api = load(clientPath, { fetch: async url => { called = url; return Response.json({ options: [{ id: p, title: 'A&B' }] }); } });
  const options = await api.readBusinessOptions(w, 'files', 'A&B / final');
  assert.equal(options[0].id, p);
  const params = new URL(called, 'https://fairway.example').searchParams;
  assert.equal(params.get('workspaceId'), w); assert.equal(params.get('q'), 'A&B / final'); assert.equal(params.get('options'), 'files');
});
test('read abort stays an abort instead of surfacing a false network error', async () => {
  const abort = new Error('Aborted'); abort.name = 'AbortError';
  const api = load(clientPath, { fetch: async () => { throw abort; } });
  await assert.rejects(() => api.readBusinessList(w, 0, 'all'), error => error === abort);
});
test('external links allow HTTPS only and reject active schemes and embedded credentials', () => {
  const api = load(clientPath);
  assert.equal(api.safeBusinessUrl('https://docs.example/report'), 'https://docs.example/report');
  for (const value of ['javascript:alert(1)', 'data:text/html,test', 'http://example.com', '//example.com', 'https://user:pass@example.com', 'https://user@example.com', 'bad']) assert.equal(api.safeBusinessUrl(value), null);
});

const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const members = [{ user_id: r, display_name: 'Named reviewer' }];
const finalVersion = { id: 'final-v1', plan_id: p, ordinal: 1, plan_revision: 2, body: { title: 'APPROVED SNAPSHOT TITLE', brief: 'FROZEN BRIEF', notes: 'FROZEN NOTES', objective: 'FROZEN OBJECTIVE', owner_id: r, target_date: '2026-12-01', category: 'Strategy', tags: ['Approved tag'], swot: [], document_ids: ['document-id'], document_references: [{ id: 'document-id', title: 'Original source', url: 'https://docs.example/approved' }], task_ids: ['exact-task-id'], project_ids: ['exact-project-id'] }, reviewers: [r], policy: 'all_reviewers', supersedes_version_id: null, created_by: r, created_at: '2026-10-01T12:00:00Z' };
const plan = { id: p, workspace_id: w, title: 'MUTABLE DRAFT TITLE', brief: 'NEW DRAFT BRIEF', lead_id: r, kind: 'plan', notes: '', objective: '', target_date: null, category: '', tags: [], state: 'draft', revision: 5, approved_version_id: 'final-v1', created_by: r, created_at: '2026-10-01T12:00:00Z', updated_at: '2026-10-02T12:00:00Z' };
const detail = { schemaVersion: 1, plan, swot: [], tasks: [{ id: 'exact-task-id', title: 'MUTABLE TASK TITLE' }], projects: [{ id: 'exact-project-id', title: 'MUTABLE PROJECT TITLE' }], documents: [], versions: [finalVersion], reviews: [{ id: 'review-id', plan_id: p, version_id: 'final-v1', status: 'approved', revision: 1, decided_at: '2026-10-01T14:00:00Z' }], decisions: [{ id: 'decision-id', version_id: 'final-v1', reviewer_id: r, disposition: 'approve', rationale: 'EXPLICIT APPROVAL RATIONALE', created_at: '2026-10-01T14:00:00Z' }] };
const mutation = { blocked: false, busy: false, error: null, failed: null, success: '', mutate() {}, clear() {}, retry() {} };
test('final viewer renders immutable snapshot content and version-specific approval rationale, never mutable task or draft titles', () => {
  const { VersionHistory } = load(path.join(root, 'components/studio/business/versions.tsx'));
  const html = renderToStaticMarkup(React.createElement(VersionHistory, { detail, members, userId: r, mutation, disabled: false, initialFinal: true }));
  for (const value of ['APPROVED SNAPSHOT TITLE', 'FROZEN BRIEF', 'FROZEN NOTES', 'FROZEN OBJECTIVE', 'EXPLICIT APPROVAL RATIONALE', 'Named reviewer', 'exact-task-id', 'exact-project-id', 'https://docs.example/approved']) assert.ok(html.includes(value), value);
  for (const value of ['MUTABLE DRAFT TITLE', 'NEW DRAFT BRIEF', 'MUTABLE TASK TITLE', 'MUTABLE PROJECT TITLE']) assert.ok(!html.includes(value), value);
});
test('new final submission requires named reviewers and explicit supersession confirmation', () => {
  const { SubmitReview } = load(path.join(root, 'components/studio/business/versions.tsx'));
  const html = renderToStaticMarkup(React.createElement(SubmitReview, { detail, members, mutation, disabled: false }));
  assert.match(html, /supersede final version 1 only after every selected reviewer approves/);
  assert.match(html, /type="checkbox" required=""/); assert.match(html, /disabled=""/); assert.match(html, /Named reviewer/);
});
test('ideas cannot submit business approvals and archived plans cannot open new reviews', () => {
  const { SubmitReview } = load(path.join(root, 'components/studio/business/versions.tsx'));
  const idea = renderToStaticMarkup(React.createElement(SubmitReview, { detail: { ...detail, plan: { ...plan, kind: 'idea' } }, members, mutation, disabled: false }));
  assert.match(idea, /Develop this idea into a plan/); assert.ok(!idea.includes('<form'));
  const archived = renderToStaticMarkup(React.createElement(SubmitReview, { detail: { ...detail, plan: { ...plan, state: 'archived' } }, members, mutation, disabled: false }));
  assert.equal(archived, '');
});
test('plan editor submits expected revision and excludes unsupported kind changes', () => {
  const fakeHooks = { ...React, useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}] };
  const { PlanEditor } = load(path.join(root, 'components/studio/business/plan-editor.tsx'), { modules: { react: fakeHooks } });
  let payload;
  const element = PlanEditor({ plan, members, disabled: false, onSave: value => { payload = value; }, onCancel() {} });
  element.props.onSubmit({ preventDefault() {} });
  assert.equal(payload.plan_id, p); assert.equal(payload.expected_revision, 5); assert.ok(!('kind' in payload)); assert.equal(payload.owner_id, r);
});
test('document references expose real Library callback instead of invented download URLs', () => {
  const { DocumentsSection } = load(path.join(root, 'components/studio/business/links.tsx'));
  const html = renderToStaticMarkup(React.createElement(DocumentsSection, { workspaceId: w, detail: { ...detail, documents: [{ id: 'd', file_id: 'file-id', title: 'Source file', url: null, notes: '', created_at: '2026-10-01T12:00:00Z' }] }, mutation, disabled: false, onDirty() {}, onOpenFile() {} }));
  assert.match(html, /Open original in Library/); assert.match(html, /File ID: file-id/); assert.ok(!html.includes('download='));
});

function mutationHarness(fetch, onCommitted = () => {}) {
  const slots = []; let cursor = 0;
  const fakeHooks = {
    ...React,
    useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial; return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }]; },
    useRef(initial) { const index = cursor++; if (!(index in slots)) slots[index] = { current: initial }; return slots[index]; },
    useEffect() {},
  };
  const { useBusinessMutation } = load(path.join(root, 'components/studio/business/ui.tsx'), { fetch, modules: { react: fakeHooks } });
  return () => { cursor = 0; return useBusinessMutation(w, onCommitted); };
}
const settle = () => new Promise(resolve => setImmediate(resolve));
test('mutation controller prevents double clicks and calls refresh only after confirmed commit', async () => {
  let complete; let calls = 0; let refreshes = 0;
  const render = mutationHarness(() => { calls++; return new Promise(resolve => { complete = resolve; }); }, () => { refreshes++; });
  const first = render();
  first.mutate('createPlan', { title: 'One' }, 'Created'); first.mutate('createPlan', { title: 'Duplicate' }, 'Created');
  assert.equal(calls, 1); assert.equal(render().busy, true); assert.equal(refreshes, 0);
  complete(Response.json({ data: { plan: { id: p } } })); await settle();
  assert.equal(render().busy, false); assert.equal(render().success, 'Created'); assert.equal(refreshes, 1);
});
test('mutation controller freezes other changes and retains exact request after an uncertain write', async () => {
  const bodies = []; let attempts = 0; let refreshes = 0;
  const render = mutationHarness(async (_url, init) => { bodies.push(init.body); attempts++; if (attempts === 1) throw new Error('offline'); return Response.json({ data: { plan: { id: p } } }); }, () => { refreshes++; });
  render().mutate('createPlan', { title: 'Keep me' }, 'Saved'); await settle();
  assert.equal(render().blocked, true);
  render().clear(); render().mutate('createPlan', { title: 'Must not run' }, 'Other'); await settle();
  assert.equal(attempts, 1); assert.equal(refreshes, 0);
  render().retry(); await settle();
  assert.equal(attempts, 2); assert.equal(bodies[0], bodies[1]); assert.equal(render().blocked, false); assert.equal(refreshes, 1);
});
test('mutation controller never reports success on conflict and only unlocks explicit refresh/edit recovery', async () => {
  let refreshes = 0;
  const render = mutationHarness(async () => Response.json({ error: 'Changed', code: 'CONFLICT' }, { status: 409 }), () => { refreshes++; });
  render().mutate('updatePlan', { plan_id: p, expected_revision: 1, title: 'Retained form' }, 'Saved'); await settle();
  assert.equal(render().error.conflict, true); assert.equal(render().success, ''); assert.equal(render().blocked, true); assert.equal(refreshes, 0);
  assert.equal(render().failed.request.input.title, 'Retained form'); render().clear(); assert.equal(render().blocked, false);
});

test('shell navigation state survives refresh and callback changes, reports uncertainty, and resets only on unmount', () => {
  const slots = []; let cursor = 0; let effects = [];
  const fakeHooks = {
    ...React,
    useRef(initial) { const index = cursor++; if (!(index in slots)) slots[index] = { current: initial }; return slots[index]; },
    useEffect(effect, dependencies) {
      const index = cursor++; const previous = slots[index];
      if (!previous || dependencies.some((value, key) => value !== previous.dependencies[key])) effects.push(() => { previous?.cleanup?.(); slots[index] = { dependencies, cleanup: effect() }; });
    },
  };
  const { useBusinessNavigationState } = load(path.join(root, 'components/studio/business/ui.tsx'), { modules: { react: fakeHooks } });
  const reports = []; const newerReports = [];
  const callback = state => reports.push(JSON.parse(JSON.stringify(state)));
  const newerCallback = state => newerReports.push(JSON.parse(JSON.stringify(state)));
  function render(state, cb = callback) { cursor = 0; effects = []; useBusinessNavigationState(state, cb); effects.forEach(effect => effect()); }
  const idle = { dirty: false, pending: false, uncertain: false };
  render(idle); render({ ...idle, dirty: true });
  const beforeRefresh = reports.length;
  render({ ...idle, dirty: true });
  assert.equal(reports.length, beforeRefresh, 'ordinary refresh must not reset or re-report unchanged navigation state');
  render({ ...idle, dirty: true, pending: true });
  render({ ...idle, dirty: true, uncertain: true });
  assert.deepEqual(reports.at(-1), { dirty: true, pending: false, uncertain: true });
  render({ ...idle, dirty: true, uncertain: true }, newerCallback);
  assert.deepEqual(newerReports, [{ dirty: true, pending: false, uncertain: true }]);
  assert.ok(!reports.slice(1).some(state => !state.dirty && !state.pending && !state.uncertain));
  slots.forEach(slot => slot?.cleanup?.());
  assert.deepEqual(newerReports.at(-1), idle);
});
test('unsaved review rationale reports dirty state through the version viewer', () => {
  const dirty = [];
  const fakeHooks = { ...React, useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}], useEffect() {} };
  const { VersionHistory } = load(path.join(root, 'components/studio/business/versions.tsx'), { modules: { react: fakeHooks } });
  const openDetail = { ...detail, plan: { ...plan, approved_version_id: null }, reviews: [{ ...detail.reviews[0], status: 'open' }], decisions: [] };
  const tree = VersionHistory({ detail: openDetail, members, userId: r, mutation, disabled: false, onDirty: value => dirty.push(value) });
  function find(element, predicate) {
    if (!element || typeof element !== 'object') return null;
    if (predicate(element)) return element;
    for (const child of [element.props?.children].flat(Infinity)) { const match = find(child, predicate); if (match) return match; }
    return null;
  }
  const review = find(tree, element => typeof element.type === 'function' && element.type.name === 'ReviewDecision');
  assert.ok(review);
  const form = review.type(review.props);
  const rationale = find(form, element => element.type === 'textarea');
  rationale.props.onChange({ target: { value: 'Unsaved review rationale' } });
  assert.deepEqual(dirty, [true]);
});
test('unnamed current members retain a stable ID label without being mistaken for departed reviewers', () => {
  const { memberName, OwnerSelect } = load(path.join(root, 'components/studio/business/ui.tsx'));
  const unnamed = [{ user_id: r, display_name: '  ' }];
  assert.equal(memberName(unnamed, r), 'Workspace member · …00000003');
  assert.equal(memberName(unnamed, null), 'Unassigned');
  assert.equal(memberName([], r), 'Former or unavailable member · …00000003');
  const owner = renderToStaticMarkup(React.createElement(OwnerSelect, { members: unnamed, value: r, onChange() {} }));
  assert.match(owner, /Workspace member · …00000003/);
  const { SubmitReview } = load(path.join(root, 'components/studio/business/versions.tsx'));
  const reviewers = renderToStaticMarkup(React.createElement(SubmitReview, { detail, members: unnamed, mutation, disabled: false }));
  assert.match(reviewers, /Workspace member · …00000003/);
});
