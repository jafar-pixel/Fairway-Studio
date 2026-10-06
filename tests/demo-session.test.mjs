import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadModule, plain } from './media-test-harness.mjs';
const session = loadModule('lib/studio/demo-session.ts');
const content = JSON.parse(fs.readFileSync(new URL('../lib/studio/mockup-content.json', import.meta.url), 'utf8'));
const hashes = JSON.parse(fs.readFileSync(new URL('../lib/studio/mockup-asset-hashes.json', import.meta.url), 'utf8'));
const imported = loadModule('lib/studio/imported-content.ts', { './mockup-content.json': { default: content }, './mockup-asset-hashes.json': { default: hashes } });
const { createDemoData, mutateDemo } = loadModule('lib/studio/demo.ts', { './mockup-content.json': { default: content }, './mockup-asset-hashes.json': { default: hashes }, './imported-content': imported }, { structuredClone });
function storage(initial = {}) {
  const values = new Map(Object.entries(initial)); const writes = [];
  return { values, writes, getItem: key => values.get(key) ?? null, setItem: (key, value) => { writes.push([key, value]); values.set(key, value); } };
}

test('demo changes survive same-tab route remount with a versioned, demo-scoped envelope', () => {
  const store = storage(); const seed = createDemoData();
  const next = mutateDemo(seed, 'createIdea', { title: 'QA · Reference-led idea', body: 'Story', category: 'General', tags: ['reference'] });
  assert.equal(session.saveDemoSession(() => store, next.data), true);
  const envelope = JSON.parse(store.getItem(session.DEMO_SESSION_KEY));
  assert.equal(envelope.version, 3); assert.equal(envelope.scope, 'fairway-demo');
  const remounted = session.loadDemoSession(() => store, createDemoData());
  assert.equal(remounted.restored, true);
  assert.equal(remounted.data.ideas.find(row => row.id === next.result.id).title, 'QA · Reference-led idea');
});
test('repeated mount/Strict Mode loading never writes the seed over a saved session', () => {
  const store = storage(); const next = mutateDemo(createDemoData(), 'createIdea', { title: 'Keep me', body: 'Unchanged' });
  session.saveDemoSession(() => store, next.data); const original = store.getItem(session.DEMO_SESSION_KEY); store.writes.length = 0;
  for (let index = 0; index < 4; index++) {
    const loaded = session.loadDemoSession(() => store, createDemoData());
    assert.ok(loaded.data.ideas.some(row => row.id === next.result.id));
  }
  assert.equal(store.writes.length, 0);
  assert.equal(store.getItem(session.DEMO_SESSION_KEY), original);
});
test('legacy v2 data is read without destructive migration and the next explicit commit writes v3', () => {
  const old = mutateDemo(createDemoData(), 'createIdea', { title: 'Legacy addition' }).data;
  const legacy = JSON.stringify(old); const store = storage({ [session.LEGACY_DEMO_SESSION_KEY]: legacy });
  const loaded = session.loadDemoSession(() => store, createDemoData());
  assert.equal(loaded.restored, true); assert.equal(store.writes.length, 0);
  assert.equal(loaded.data.ideas[0].title, 'Legacy addition');
  assert.equal(session.saveDemoSession(() => store, loaded.data), true);
  assert.equal(store.getItem(session.LEGACY_DEMO_SESSION_KEY), legacy);
  assert.ok(store.getItem(session.DEMO_SESSION_KEY));
});
test('sequential idea, source and link changes accumulate before React rerenders and survive remount', () => {
  const store = storage(); let latest = createDemoData();
  const commit = (operation, input) => {
    const next = mutateDemo(latest, operation, input);
    latest = next.data;
    assert.equal(session.saveDemoSession(() => store, latest), true);
    return next.result;
  };
  const idea = commit('createIdea', { title: 'Reference-led idea', body: 'Source creator / credit: Artist' });
  const pin = commit('importPin', { title: 'Source Pin', url: 'https://www.pinterest.com/pin/123456789/', note: 'Credit Artist' });
  commit('linkIdeaAsset', { idea_id: idea.id, reference_id: pin.id, expected_revision: idea.revision });
  const loaded = session.loadDemoSession(() => store, createDemoData()).data;
  assert.ok(loaded.ideas.some(row => row.id === idea.id));
  assert.ok(loaded.references.some(row => row.id === pin.id));
  assert.ok(loaded.ideaAssets.some(row => row.idea_id === idea.id && row.reference_id === pin.id));
  assert.equal(loaded.ideas.find(row => row.id === idea.id).revision, 1);
});
test('missing collections normalize from current seed while explicitly empty collections remain empty', () => {
  const seed = createDemoData(); const old = { workspace: { id: 'demo', name: 'Renamed demo' }, ideas: [] };
  const normalized = session.normalizeDemoSession(old, seed);
  assert.deepEqual(plain(normalized.ideas), []);
  assert.equal(normalized.tasks.length, seed.tasks.length);
  assert.equal(normalized.workspace.name, 'Renamed demo');
  assert.equal(normalized.workspace.timezone, seed.workspace.timezone);
});
test('invalid payloads and unknown versions cannot replace the demo or inject live workspace rows', () => {
  const seed = createDemoData();
  for (const invalid of [null, [], {}, { workspace: { id: 'live-workspace' }, ideas: [] }]) assert.equal(session.normalizeDemoSession(invalid, seed), null);
  const normalized = session.normalizeDemoSession({ ...seed, ideas: [{ id: 'live-idea', workspace_id: 'live-workspace', title: 'Private' }, { id: 'demo-idea', workspace_id: 'demo', title: 'Demo' }], userId: 'live-user', role: 'admin', capabilities: { collaboration: false } }, seed);
  assert.deepEqual(plain(normalized.ideas.map(row => row.id)), ['demo-idea']);
  assert.equal(normalized.userId, seed.userId); assert.equal(normalized.role, seed.role);
  assert.deepEqual(plain(normalized.capabilities), plain(seed.capabilities));
  const store = storage({ [session.DEMO_SESSION_KEY]: JSON.stringify({ version: 999, scope: 'fairway-demo', data: seed }) });
  assert.equal(session.loadDemoSession(() => store, seed).restored, false);
  assert.equal(session.saveDemoSession(() => store, { workspace: { id: 'live-workspace' } }), false);
  assert.equal(store.writes.length, 0);
});
test('corrupt storage and malformed collection fields normalize safely without crashing', () => {
  const seed = createDemoData(); const store = storage({ [session.DEMO_SESSION_KEY]: '{oops' });
  assert.equal(session.loadDemoSession(() => store, seed).restored, false);
  const normalized = session.normalizeDemoSession({ workspace: { id: 'demo' }, ideas: [null, [], { id: 'safe', title: {}, body: [], tags: 'wrong', contributor_ids: [12, 'demo-jafar'] }], tasks: 'invalid' }, seed);
  assert.equal(normalized.ideas.length, 1); assert.equal(normalized.ideas[0].title, '');
  assert.deepEqual(plain(normalized.ideas[0].tags), []);
  assert.deepEqual(plain(normalized.ideas[0].contributor_ids), ['demo-jafar']);
  assert.equal(normalized.tasks.length, seed.tasks.length);
});
test('blocked storage access, denied reads and quota failures are nonfatal and reported', () => {
  const seed = createDemoData();
  const denied = () => { throw Error('SecurityError'); };
  assert.equal(session.loadDemoSession(denied, seed).persistenceAvailable, false);
  assert.equal(session.saveDemoSession(denied, seed), false);
  const quota = { getItem: () => null, setItem: () => { throw Error('QuotaExceededError'); } };
  assert.equal(session.saveDemoSession(() => quota, seed), false);
  assert.equal(session.loadDemoSession(() => ({ getItem: denied }), seed).persistenceAvailable, false);
});
test('explicit reset is committed before navigation and cannot resurrect an old legacy session', () => {
  const seed = createDemoData(); const changed = mutateDemo(seed, 'createIdea', { title: 'Old change' }).data;
  const store = storage({ [session.LEGACY_DEMO_SESSION_KEY]: JSON.stringify(changed) });
  session.saveDemoSession(() => store, changed);
  session.saveDemoSession(() => store, seed);
  const loaded = session.loadDemoSession(() => store, createDemoData());
  assert.equal(loaded.data.ideas.length, seed.ideas.length);
  assert.ok(!loaded.data.ideas.some(row => row.title === 'Old change'));
});
test('app commits the latest snapshot synchronously and has no effect that persists an unhydrated seed', () => {
  const app = fs.readFileSync(new URL('../components/studio/app.tsx', import.meta.url), 'utf8');
  assert.match(app, /mutateDemo\(demoSnapshot\.current, operation, input\)/);
  assert.match(app, /if \(demo\) return demoSnapshot\.current/);
  assert.match(app, /const persisted = commitDemoData\(next\.data\)/);
  assert.match(app, /const persisted = commitDemoData\(createDemoData\(\)\)/);
  assert.doesNotMatch(app, /sessionStorage\.setItem|sessionStorage\.getItem/);
  const commit = app.slice(app.indexOf('function commitDemoData('), app.indexOf('function commitDemoData(') + 300);
  assert.ok(commit.indexOf('saveDemoSession') < commit.indexOf('setDemoData'));
});
