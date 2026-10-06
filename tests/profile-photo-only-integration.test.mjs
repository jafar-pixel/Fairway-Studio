import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import * as React from 'react';
import * as jsx from 'react/jsx-runtime';
import { loadModule, userId, otherUserId } from './media-test-harness.mjs';
const root = new URL('../', import.meta.url), read = p => fs.readFileSync(new URL(p, root), 'utf8');
const fixture = JSON.parse(read('tests/fixtures/photo-only-source.json'));
const hash = p => createHash('sha256').update(fs.readFileSync(new URL(p, root))).digest('hex');
const rules = loadModule('lib/studio/profile-photo.ts');

test('profile modules and deliberately reviewed guide shell seams match the exact combined snapshot', () => {
  assert.equal(fixture.reviewed_profile_source.length, 11);
  for (const row of fixture.reviewed_profile_source) assert.equal(hash(row.path), row.sha256, row.path);
  assert.equal(hash('components/studio/app.tsx'), 'c8d8cddaa544e3fedd5315546b5738436e32fec5a6d6614bb12a29147d53995c');
  assert.equal(fixture.schema_prerequisite.sha256, 'bb8aca24192ec7e6499e2b2a17b575de2013dd811b381dc74409cf26991238ea');
});

test('combined scoped integration matches all preserved and explicitly reviewed source hashes', () => {
  assert.ok(fixture.preserved_baseline.length >= 140);
  for (const row of fixture.preserved_baseline) assert.equal(hash(row.path), row.sha256, row.path);
  const accountClient = fixture.reviewed_private_account_security.production_files.find(row => row.path === 'lib/studio/private-business/client.ts');
  assert.equal(accountClient.before_sha256, '5a5cbdf107c06bfdee54aefa03a14eae8f9e79a4b0fd502eaa9bd3b9697bd9eb', 'historical reviewed client bytes remain pinned');
  assert.equal(accountClient.sha256, 'a3d6f8435d813b20c436f55196ae93c26cf7558453edf1fe16632b60f94affab', 'explicitly reviewed account-bound client bytes');
  assert.equal(hash('lib/studio/private-business/client.ts'), 'a3d6f8435d813b20c436f55196ae93c26cf7558453edf1fe16632b60f94affab');
});

test('shared request-origin security helper is pinned to the separately reviewed source', () => {
  assert.equal(fixture.reviewed_origin_source.length, 1);
  assert.equal(fixture.reviewed_origin_source[0].path, 'lib/studio/request-origin.ts');
  for (const row of fixture.reviewed_origin_source) assert.equal(hash(row.path), row.sha256, row.path);
});

test('native document and Relationships modules, API routes and pending migrations remain absent', () => {
  for (const path of fixture.absent_paths) assert.equal(fs.existsSync(new URL(path, root)), false, path);
  const routes = loadModule('lib/studio/workflows/routes.ts');
  assert.equal(routes.parseWorkflowRoute(['business', 'relationships']).kind, 'invalid');
  for (const path of ['components/studio/app.tsx', 'components/studio/workflows/connected-boundary.tsx', 'components/studio/workflows/context-help.tsx', 'lib/studio/workflows/routes.ts']) {
    assert.doesNotMatch(read(path), /RelationshipsWorkspace|business\/relationships|BusinessRelationships|NativeDocument|PrivateUploadClient|DocumentUpload/);
  }
  assert.match(read('components/studio/workflows/context-help.tsx'), /Document uploads and app-served document downloads are unavailable/);
  assert.doesNotMatch(read('lib/studio/private-business/contracts.ts'), /upload_id|nativeUploads/);
});

test('profile provider and editor are remounted by account and workspace while all displayed avatars have explicit identity', () => {
  const app = read('components/studio/app.tsx');
  assert.match(app, /<ProfilePhotoProvider key=\{`\$\{userId\}:\$\{workspaceId\}`\} viewerId=\{userId\} demo=\{demo\}>/);
  assert.match(app, /<ProfilePhotoEditor key=\{userId\} userId=\{userId\}/);
  for (const path of ['components/studio/app.tsx', 'components/studio/projects.tsx']) {
    for (const avatar of read(path).match(/<Avatar\b[\s\S]*?\/>/g) || []) assert.match(avatar, /userId=/);
  }
  assert.match(app, /authIdentityTransition/);
  assert.match(app, /deniedAuth/);
});

function providerHarness({ viewerId = userId, demo = true } = {}) {
  const states = [], refs = [], effects = [], listeners = new Map(), revoked = [];
  let cursor = 0, refCursor = 0, effectCursor = 0;
  const react = {
    ...React,
    useState(initial) { const i = cursor++; if (!(i in states)) states[i] = typeof initial === 'function' ? initial() : initial; return [states[i], value => { states[i] = typeof value === 'function' ? value(states[i]) : value; }]; },
    useRef(initial) { const i = refCursor++; return refs[i] ||= { current: initial }; },
    useMemo(make) { return make(); },
    useEffect(effect, deps) { const i = effectCursor++, old = effects[i]; if (!old || deps.some((value, k) => value !== old.deps[k])) effects[i] = { deps, effect, pending: true, cleanup: old?.cleanup }; },
  };
  const module = loadModule('components/studio/profile-avatar.tsx', { react, 'react/jsx-runtime': jsx, '@/lib/studio/profile-photo': rules, './profile-photo.css': {} }, {
    window: { addEventListener: (type, fn) => listeners.set(type, fn), removeEventListener: type => listeners.delete(type) },
    URL: { revokeObjectURL: url => revoked.push(url) },
  });
  function render() {
    cursor = refCursor = effectCursor = 0;
    const tree = module.ProfilePhotoProvider({ viewerId, demo, children: null });
    for (const effect of effects) if (effect.pending) { effect.cleanup?.(); effect.cleanup = effect.effect(); effect.pending = false; }
    return tree.props.value;
  }
  return { render, listeners, revoked, unmount() { for (const effect of effects) effect.cleanup?.(); } };
}

test('profile provider revokes replaced and disposed demo object URLs and next account starts with no stale photo', () => {
  const previous = providerHarness();
  let scope = previous.render();
  scope.setDemoPhoto('blob:account-a-first'); scope = previous.render();
  scope.setDemoPhoto('blob:account-a-second'); scope = previous.render();
  assert.deepEqual(previous.revoked, ['blob:account-a-first']);
  previous.unmount();
  assert.deepEqual(previous.revoked, ['blob:account-a-first', 'blob:account-a-second']);
  const next = providerHarness({ viewerId: otherUserId });
  assert.equal(next.render().demoPhoto, null);
  assert.equal(next.render().viewerId, otherUserId);
  assert.equal(next.listeners.size, 0, 'demo never requests authenticated refresh');
  next.unmount();
});

test('authenticated focus refresh changes image request identity and disposes its listener on unmount', () => {
  const h = providerHarness({ demo: false });
  const initial = h.render();
  assert.equal(initial.version, 0);
  h.listeners.get('focus')();
  const refreshed = h.render();
  assert.equal(refreshed.version, 1);
  assert.notEqual(rules.profileImageUrl(userId, initial.version), rules.profileImageUrl(userId, refreshed.version));
  refreshed.refresh(); assert.equal(h.render().version, 2);
  h.unmount(); assert.equal(h.listeners.size, 0);
});

test('revoked image failures synchronously show initials and subsequent user or revision cannot reuse the failed image element', () => {
  let failed = null;
  const scope = { viewerId: userId, demo: false, version: 0 };
  const { ProfileAvatar } = loadModule('components/studio/profile-avatar.tsx', {
    react: { ...React, useContext: () => scope, useState: () => [failed, value => { failed = value; }] },
    'react/jsx-runtime': jsx, '@/lib/studio/profile-photo': rules, './profile-photo.css': {},
  });
  let tree = ProfileAvatar({ name: 'First Member', userId });
  const before = tree.props.children;
  before.props.onError();
  tree = ProfileAvatar({ name: 'First Member', userId });
  assert.equal(tree.props.children, 'FM');
  tree = ProfileAvatar({ name: 'Second Member', userId: otherUserId });
  assert.notEqual(tree.props.children.key, before.key);
  assert.match(tree.props.children.props.src, new RegExp(otherUserId));
  scope.version++;
  tree = ProfileAvatar({ name: 'First Member', userId });
  assert.notEqual(tree.props.children.key, before.key);
  tree.props.children.props.onError();
  assert.equal(ProfileAvatar({ name: 'First Member', userId }).props.children, 'FM');
});

test('private profile bytes are excluded from public service-worker caching and generic private datasets', () => {
  const listeners = new Map();
  vm.runInNewContext(read('public/sw.js'), { URL, self: { addEventListener: (type, fn) => listeners.set(type, fn), location: { origin: 'https://studio.example' } } });
  for (const suffix of ['', '?image=1', `?userId=${userId}&image=1&v=2`]) {
    let intercepted = false;
    listeners.get('fetch')({ request: new Request('https://studio.example/api/studio/profile-photo' + suffix), respondWith() { intercepted = true; } });
    assert.equal(intercepted, false);
  }
  assert.doesNotMatch(read('lib/studio/server.ts'), /studio_profile_photos/);
  assert.doesNotMatch(read('lib/studio/offline.ts'), /studio_profile_photos|profile-photo/);
  assert.match(read('lib/studio/profile-photo-server.ts'), /private, no-store, max-age=0/);
  assert.match(read('lib/studio/profile-photo-server.ts'), /current\.path !== row\.path \|\| current\.revision !== row\.revision/);
});
