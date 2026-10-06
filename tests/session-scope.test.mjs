import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import * as icons from 'lucide-react';
import { renderToStaticMarkup } from 'react-dom/server';
const root = new URL('../', import.meta.url);
function load(path, deps = {}, globals = {}) {
  const context = { exports: {}, URL, URLSearchParams, Error, Array, Object, JSON, Set, Map, Number, Promise, ...globals, require(name) { if (name in deps) return deps[name]; throw Error(`Unexpected import ${name}`); } };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL(path, root), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, context);
  return context.exports;
}
const scope = load('lib/studio/session-scope.ts');
const workflowRoutes = load('lib/studio/workflows/routes.ts');
const businessShell = load('lib/studio/business/shell.ts', {'../collection-helpers': load('lib/studio/collection-helpers.ts')});
const actor = 'actor-1', workspace = 'workspace-1';
const record = { workspace: { id: workspace, name: 'Private studio' }, userId: actor, members: [{ user_id: actor, workspace_id: workspace, display_name: 'Owner' }], ideas: [{ id: 'private-idea', title: 'Private draft', body: 'Private description' }], missingSchema: [] };
const workflow = { notificationPreferences: { user_id: actor, workspace_id: workspace } };

test('same-user TOKEN_REFRESHED, SIGNED_IN and USER_UPDATED must not purge private caches', () => {
  let current = null; const cleared = [];
  for (const [event, next] of [['INITIAL_SESSION', actor], ['TOKEN_REFRESHED', actor], ['SIGNED_IN', actor], ['USER_UPDATED', actor], ['TOKEN_REFRESHED', actor], ['SIGNED_IN', 'actor-2'], ['SIGNED_OUT', null]]) {
    const transition = scope.authIdentityTransition(current, next); current = transition.nextId;
    if (transition.clearPrivate) cleared.push(event);
  }
  assert.deepEqual(cleared, ['INITIAL_SESSION', 'SIGNED_IN', 'SIGNED_OUT']);
});
test('the original captured-undefined comparison reproduces false invalidation while a live identity does not', () => {
  const capturedAtMount = undefined; const callbackUser = actor;
  assert.equal(callbackUser !== capturedAtMount, true);
  assert.equal(scope.authIdentityTransition(actor, callbackUser).clearPrivate, false);
});
test('explicit existing workspace URLs never enter first-use when discovery is empty or undefined', () => {
  for (const list of [undefined, null, [], [{ id: workspace }]]) assert.equal(scope.workspaceDiscoveryGate(true, list), 'target');
  assert.equal(scope.workspaceDiscoveryGate(false, undefined), 'loading');
  assert.equal(scope.workspaceDiscoveryGate(false, null), 'loading');
  assert.equal(scope.workspaceDiscoveryGate(false, []), 'first');
  assert.equal(scope.workspaceDiscoveryGate(false, [{ id: workspace }]), 'ready');
});
test('workspace reads verify exact response account, workspace and membership before exposing data', () => {
  assert.equal(scope.verifiedWorkspace(record, workspace, actor), true);
  for (const bad of [{ ...record, userId: 'other' }, { ...record, workspace: { id: 'other' } }, { ...record, members: [] }, { ...record, members: [{ user_id: actor, workspace_id: 'other' }] }]) {
    assert.equal(scope.verifiedWorkspace(bad, workspace, actor), false);
    assert.throws(() => scope.assertWorkspaceResponse(bad, `/api/studio/workspace?workspaceId=${workspace}`, actor), error => error.status === 403 && error.code === 'SCOPE_CHANGED');
  }
});
test('workflow responses cannot populate another account or workspace cache key', () => {
  assert.equal(scope.assertWorkspaceResponse(workflow, `/api/studio/workflow?workspaceId=${workspace}`, actor), workflow);
  for (const data of [{}, { notificationPreferences: { user_id: 'other', workspace_id: workspace } }, { notificationPreferences: { user_id: actor, workspace_id: 'other' } }]) assert.throws(() => scope.assertWorkspaceResponse(data, `/api/studio/workflow?workspaceId=${workspace}`, actor), /session changed/);
});
function client(ids = [actor, actor], data = [{ id: workspace, name: 'Workspace' }]) {
  let at = 0; let queried = 0;
  return { auth: { getUser: async () => ({ data: { user: ids[at] === null ? null : { id: ids[at++] } }, error: null }) }, from: () => ({ select: async () => { queried++; return { data, error: null }; } }), queried: () => queried };
}
test('list read is identity-checked before and after the asynchronous RLS query', async () => {
  const okay = client(); assert.equal((await scope.readIdentityWorkspaces(okay, actor)).length, 1); assert.equal(okay.queried(), 1);
  const before = client(['other']); await assert.rejects(scope.readIdentityWorkspaces(before, actor), /session changed/); assert.equal(before.queried(), 0);
  const during = client([actor, 'other']); await assert.rejects(scope.readIdentityWorkspaces(during, actor), /session changed/); assert.equal(during.queried(), 1);
  await assert.rejects(scope.readIdentityWorkspaces(client([actor, null]), actor), /session changed/);
});
test('a null or malformed workspace-list response is an error, never a zero-membership conclusion', async () => {
  for (const data of [null, {}, [{ id: 7, name: 'Bad' }]]) await assert.rejects(scope.readIdentityWorkspaces(client([actor, actor], data), actor), error => error.status === 502);
  assert.equal((await scope.readIdentityWorkspaces(client([actor, actor], []), actor)).length, 0);
});
test('permission failures and scope changes are distinct from retryable transport/server errors', () => {
  for (const error of [{ status: 401 }, { status: 403 }, { status: 404 }, { code: '42501' }, { code: 'SCOPE_CHANGED' }, { code: 'PGRST301' }]) assert.equal(scope.accessReadFailure(error), true);
  for (const error of [null, Error('offline'), { status: 503 }, { status: 502 }]) assert.equal(scope.accessReadFailure(error), false);
});
test('revocation purge includes Business target reads but never another actor or workspace', () => {
  for (const path of ['/api/studio/workspace', '/api/studio/workflow', '/api/studio/business/target']) assert.equal(scope.workspaceCacheKey([`${path}?workspaceId=${workspace}&id=x`, actor], workspace, actor), true);
  assert.equal(scope.workspaceCacheKey([`/api/studio/workspace?workspaceId=other`, actor], workspace, actor), false);
  assert.equal(scope.workspaceCacheKey([`/api/studio/workspace?workspaceId=${workspace}`, 'other'], workspace, actor), false);
  assert.equal(scope.workspaceCacheKey('fs-workspaces:actor-1', workspace, actor), false);
});
function renderShell({ path = `/w/${workspace}/ideas`, list, listError, data = record, error, workflowError, authData = { id: actor }, authError, lifecycle } = {}) {
  let read = 0;
  const reads = [{ data: authData, error: authError, isLoading: false }, { data: list, error: listError, isLoading: false }, { data, error, isLoading: false }, { data: workflow, error: workflowError, isLoading: false }, { data: undefined, isLoading: false }];
  const noop = () => null;
  const deps = {
    react: lifecycle?.react || React, 'react/jsx-runtime': jsxRuntime, 'lucide-react': icons,
    'next/navigation': { useRouter: () => ({ push() {}, replace() {} }), usePathname: () => path, useSearchParams: () => new URLSearchParams() },
    swr: { default: (_key, fetcher) => { if (read === 0 && lifecycle) lifecycle.verify = fetcher; return { mutate: async () => {}, ...reads[read++] }; }, useSWRConfig: () => ({ mutate: async (...args) => lifecycle?.purges.push(args) }) },
    '@/lib/supabase/client': { createClient: () => { if (lifecycle) return { auth: { getUser: async () => ({ data: { user: lifecycle.verifiedUser }, error: null }) } }; throw Error('No client calls while rendering'); } },
    '@/components/studio-auth': { StudioAuth: () => React.createElement('div', null, 'Sign in') },
    '@/components/studio/onboarding-guide': { OnboardingGuide: noop },
    '@/lib/studio/onboarding': { createInitialOnboardingState: () => ({}), guideStorageScope: () => 'scope', resolveGuidePageId: () => 'ideas' },
    '@/components/studio/notifications': { NotificationInbox: noop },
    '@/components/studio/generation-panel': { GenerationPanel: noop },
    '@/components/studio/brand-kit': { BrandKitView: noop },
    '@/components/studio/projects': { ProjectsView: noop },
    '@/components/studio/collections': { IdeasView: () => React.createElement('div', null, 'Mounted private idea editor'), IdeaEditor: noop, LibraryView: noop, TasksView: noop },
    '@/components/studio/creator-navigation': { CREATOR_NAVIGATION_EVENT: 'guard' },
    '@/components/studio/pwa-controls': { PwaControls: noop },
    '@/lib/studio/offline': {},
    '@/lib/studio/demo': { createDemoData: () => ({ workspace: { id: 'demo' } }) },
    '@/lib/studio/demo-session': {},
    '@/lib/studio/imported-content': { hydrateImportedContent: value => value },
    '@/lib/studio/session-scope': scope,
    './profile-avatar': { ProfileAvatar: noop, ProfilePhotoProvider: ({ children }) => children },
    './profile-photo-editor': { ProfilePhotoEditor: noop },
    '@/lib/studio/profile-photo': { activityLabel: () => 'Activity' },
    '@/lib/studio/business/shell': businessShell,
    '@/lib/studio/business/canonical-hydration': { mergeCanonicalTarget: value => value },
    '@/components/studio/workflows/connected-boundary': { ConnectedWorkflowBoundary: () => React.createElement('div', null, 'Mounted operational board') },
    '@/components/studio/workflows/context-help': { BusinessSubnav: noop, WorkflowHelp: noop },
    '@/lib/studio/workflows/routes': workflowRoutes,
    '@/components/studio/business/workspace-boundary': { BusinessWorkspaceBoundary: () => React.createElement('div', null, 'Mounted Business board') },
  };
  const { FairwayStudio } = load('components/studio/app.tsx', deps, { process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://xljhxmyigtxhjtxxzuwk.supabase.co', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'test-public-key' } } });
  if (lifecycle) lifecycle.begin();
  const html = renderToStaticMarkup(React.createElement(FairwayStudio));
  if (lifecycle) lifecycle.commit();
  return html;
}
test('SSR regression: undefined or empty discovery cannot unmount a positively verified explicit workspace', () => {
  for (const list of [undefined, []]) {
    const html = renderShell({ list }); assert.match(html, /Mounted private idea editor/); assert.doesNotMatch(html, /Create your studio/);
  }
  const html = renderShell({ list: undefined, listError: Error('Temporary discovery failure') }); assert.match(html, /Mounted private idea editor/);
});
test('SSR regression: 401/403 and revoked workflow access block all private content despite cached rows', () => {
  for (const error of [{ status: 401 }, { status: 403 }, { code: 'SCOPE_CHANGED' }]) {
    const html = renderShell({ list: [{ id: workspace, name: 'Workspace' }], error });
    assert.match(html, /access has changed/); assert.doesNotMatch(html, /Mounted private idea editor|Private studio|Create your studio/);
  }
  const html = renderShell({ workflowError: { status: 403 } }); assert.doesNotMatch(html, /Mounted private idea editor|Private studio/);
});
test('SSR regression: explicit scope without verified matching target shows retry, never first-use', () => {
  for (const data of [null, { ...record, userId: 'other' }, { ...record, workspace: { id: 'other' } }]) {
    const html = renderShell({ data }); assert.match(html, /Checking access/); assert.doesNotMatch(html, /Create your studio|Mounted private idea editor/);
  }
});
test('SSR regression: first-use requires a verified empty discovery array on an unscoped URL', () => {
  assert.match(renderShell({ path: '/', list: [], data: null }), /Create your studio/);
  const html = renderShell({ path: '/', list: undefined, data: null }); assert.match(html, /Loading your workspaces/); assert.doesNotMatch(html, /Create your studio/);
});
test('auth callback remains synchronous, uses the current identity and preserves true-switch cache purge', () => {
  const source = fs.readFileSync(new URL('components/studio/app.tsx', root), 'utf8');
  const callback = source.slice(source.indexOf('.auth.onAuthStateChange('), source.indexOf('return () => subscription.unsubscribe()'));
  assert.match(callback, /authIdentityTransition\(authIdentity.current/);
  assert.doesNotMatch(callback, /session.user.id !== auth.data|\bawait\b/);
  assert.match(callback, /transition.clearPrivate/);
  assert.match(callback, /Array.isArray\(key\)/);
  assert.match(source, /setDeniedScope\(accessScope\)/);
  assert.match(source, /workspaceCacheKey\(key, workspaceId, userId\)/);
});

test('Business SSR: authorized exact-scope board survives discovery clearing and transient read errors', () => {
  const path = `/w/${workspace}/business/11111111-1111-4111-8111-111111111111`;
  for (const scenario of [
    { list: undefined }, { list: [] },
    { listError: Error('offline') },
    { error: Error('offline') }, { error: { status: 503 } },
    { workflowError: { status: 504 } },
  ]) {
    const html = renderShell({ path, ...scenario });
    assert.match(html, /Mounted Business board/);
    assert.doesNotMatch(html, /Create your studio|access has changed/);
  }
});
test('Business SSR: revocation and mismatched identities never render an existing private board', () => {
  const path = `/w/${workspace}/business/11111111-1111-4111-8111-111111111111`;
  for (const scenario of [
    { error: { status: 401 } }, { error: { status: 403 } },
    { workflowError: { code: 'SCOPE_CHANGED' } },
    { data: { ...record, userId: 'other' } }, { data: null },
  ]) {
    const html = renderShell({ path, ...scenario });
    assert.doesNotMatch(html, /Mounted Business board|Private studio|Create your studio/);
  }
});


function shellAuthLifecycle() {
  const slots = []; let cursor = 0; let effects = [];
  const lifecycle = { purges: [], verifiedUser: { id: actor }, verify: undefined,
    begin() { cursor = 0; effects = []; }, commit() { for (const effect of effects) effect(); },
    react: { ...React,
      useState(initial) { const at = cursor++; if (!(at in slots)) slots[at] = typeof initial === 'function' ? initial() : initial; return [slots[at], value => { slots[at] = typeof value === 'function' ? value(slots[at]) : value; }]; },
      useRef(initial) { const at = cursor++; if (!(at in slots)) slots[at] = { current: initial }; return slots[at]; },
      useEffect(effect) { if (String(effect).includes('authenticationFailure')) effects.push(effect); },
    },
  };
  return lifecycle;
}
test('Business lifecycle: denied session stays hidden through transient retries, account or workspace changes until fresh verified auth', async () => {
  const lifecycle = shellAuthLifecycle(), path = `/w/${workspace}/business/11111111-1111-4111-8111-111111111111`;
  assert.match(renderShell({ path, lifecycle }), /Mounted Business board/);
  assert.doesNotMatch(renderShell({ path, lifecycle, authError: { status: 401 } }), /Mounted Business board/);
  assert.equal(lifecycle.purges.length, 1);
  const [predicate] = lifecycle.purges[0];
  assert.equal(predicate([`/api/studio/business/target?workspaceId=${workspace}`, actor]), true);
  assert.equal(predicate('fs-workspaces:' + actor), true);
  for (const scenario of [{ authError: { status: 503 } }, { authError: Error('offline') }, {}, { path: '/w/another/business/plan-2' }, { authData: { id: 'other' } }]) {
    assert.doesNotMatch(renderShell({ path, lifecycle, ...scenario }), /Mounted Business board/);
  }
  // Cached auth mutation with no error cannot erase the denial. Only the real fetcher can verify again.
  await lifecycle.verify();
  assert.doesNotMatch(renderShell({ path, lifecycle }), /Mounted Business board/);
  assert.match(renderShell({ path, lifecycle }), /Mounted Business board/);
});
test('Business lifecycle: a transient session failure alone preserves the board and signout still reaches login after denial', () => {
  const lifecycle = shellAuthLifecycle(), path = `/w/${workspace}/business/11111111-1111-4111-8111-111111111111`;
  assert.match(renderShell({ path, lifecycle, authError: { status: 503 } }), /Mounted Business board/);
  assert.equal(lifecycle.purges.length, 0);
  renderShell({ path, lifecycle, authError: { status: 403 } });
  assert.match(renderShell({ path, lifecycle, authData: null }), /Sign in/);
  assert.doesNotMatch(renderShell({ path, lifecycle, authData: { id: actor } }), /Mounted Business board/);
});

test('operational SSR: Content and both restricted sections require verified workspace identity and retain transient reads', () => {
  for (const section of ['content', 'content/calendar', 'content/feedback', 'business/documents', 'business/finance', 'business/finance/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333']) {
    const path = `/w/${workspace}/${section}`;
    for (const scenario of [{}, { list: undefined }, { error: { status: 503 } }, { authError: Error('Temporary session transport failure') }]) {
      const html = renderShell({ path, ...scenario });
      assert.match(html, /Mounted operational board/);
      assert.doesNotMatch(html, /Mounted Business board|Create your studio|Open Creative Assistant/);
      assert.match(html, /data-guide-page="(?:content|business-documents|business-finance)"/);
    }
    for (const scenario of [{ error: { status: 403 } }, { workflowError: { status: 401 } }, { authError: { status: 403 } }, { data: { ...record, userId: 'another-actor' } }, { data: { ...record, workspace: { id: 'another-workspace' } } }]) {
      const html = renderShell({ path, ...scenario });
      assert.doesNotMatch(html, /Mounted operational board|Mounted Business board/);
    }
  }
});
