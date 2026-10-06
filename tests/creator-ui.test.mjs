import test from 'node:test';
import assert from 'node:assert/strict';
import * as React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import * as icons from 'lucide-react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadModule, workspaceId, userId } from './media-test-harness.mjs';
const creator = loadModule('lib/studio/creator-flow.ts');
const helpers = loadModule('lib/studio/collection-helpers.ts');
const { IdeaEditor, LibraryView } = loadModule('components/studio/collections.tsx', {
  react: React, 'react/jsx-runtime': jsxRuntime, 'lucide-react': icons,
  './collections-visual.css': {}, './creator-flow.css': {},
  'next/script': { default: () => null },
  'next/navigation': { usePathname: () => `/w/${workspaceId}/library`, useSearchParams: () => new URLSearchParams() },
  '@/lib/supabase/client': { createClient: () => { throw Error('No client calls during render'); } },
  '@/lib/studio/collection-helpers': helpers,
  '@/lib/studio/creator-flow': creator,
  './creator-navigation': { useCreatorNavigationGuard: () => (action) => action() },
  './profile-avatar': { ProfileAvatar: ({ name }) => React.createElement('span', null, name) },
  './media-player': { MediaPlayer: (props) => React.createElement('section', { 'data-private-player': props.fileId, 'data-workspace': props.workspaceId }, React.createElement('audio', { controls: true }), React.createElement('button', { type: 'button' }, 'Refresh preview')) },
  './media-upload': { useMediaUploads: () => ({ items: [], busy: false, hasUnfinished: false }), MediaUploadQueue: () => React.createElement('section', { 'data-media-upload-queue': true }, '100 MB per file') },
});
const props = { workspaceId, userId, demo: false, data: { ideas: [], references: [], files: [], members: [{ user_id: userId, display_name: 'Riley' }, { user_id: 'jafar', display_name: 'Jafar' }] }, onMutate: async () => { throw Error('No mutation during render'); }, onNavigate() {}, onClose() {} };
test('creator editor renders equally available sources, story prompts, credit, direct upload and walkthrough values', () => {
  const html = renderToStaticMarkup(React.createElement(IdeaEditor, { ...props, idea: null, initial: { title: 'Walkthrough idea', body: 'My story', category: 'brand_identity' } }));
  for (const source of creator.CREATOR_SOURCES) assert.ok(html.includes(source));
  assert.match(html, /value="Walkthrough idea"/);
  assert.match(html, />My story<\/textarea>/);
  assert.match(html, /<option selected="">Brand identity<\/option>/);
  assert.match(html, /Contributed by Riley/);
  assert.match(html, /Source creator \/ credit/);
  assert.match(html, /Who is it for\? Why does it matter\? What inspired you\?/);
  assert.match(html, /Source URL/);
  assert.match(html, /data-media-upload-queue="true"/);
});
test('editing existing idea preserves the complete body and original contributor', () => {
  const html = renderToStaticMarkup(React.createElement(IdeaEditor, { ...props, idea: { id: 'idea-1', author_id: 'jafar', title: 'Original', body: 'Original\n\n  whitespace  ', revision: 1 } }));
  assert.match(html, /Contributed by Jafar/);
  assert.match(html, />Original\n\n  whitespace  <\/textarea>/);
  assert.doesNotMatch(html, /Contributed by Riley/);
});
test('private Library media uses real player placement outside clickable card buttons', () => {
  const html = renderToStaticMarkup(React.createElement(LibraryView, { ...props, data: { ...props.data, files: [{ id: 'file-1', title: 'Voice memo', url: `supabase-storage://workspace-media/${workspaceId}/${userId}/memo.mp3`, workspace_id: workspaceId, added_by: userId }] } }));
  assert.match(html, /data-private-player="file-1"/);
  assert.match(html, /<article[^>]*fc-library-card/);
  assert.doesNotMatch(html, /<img[^>]*(?:memo\.mp3|api\/studio\/media)/);
  const stack = [];
  for (const match of html.matchAll(/<\/?(?:button|audio|video)\b[^>]*>/g)) {
    if (match[0].startsWith('</button')) stack.pop();
    else if (match[0].startsWith('<button')) { assert.equal(stack.length, 0, 'nested button'); stack.push('button'); }
    else if (match[0].startsWith('<audio') || match[0].startsWith('<video')) assert.equal(stack.length, 0, 'media controls inside button');
  }
});
function guardHarness(state) {
  const listeners = new Map(); let cleanup; const actions = []; const messages = [];
  const window = {
    confirm: () => false,
    location: { href: 'https://studio.example/ideas?item=idea-1', assign: (url) => actions.push(['assign', url]) },
    history: { state: { editor: true }, pushState: (...args) => actions.push(['push', ...args]) },
    addEventListener: (type, fn) => listeners.set(type, fn),
    removeEventListener: type => listeners.delete(type),
  };
  const { useCreatorNavigationGuard } = loadModule('components/studio/creator-navigation.ts', { react: { useRef: current => ({ current }), useEffect: effect => { cleanup = effect(); } } }, { window });
  const leave = useCreatorNavigationGuard({ ...state, onBlocked: message => messages.push(message) });
  return { leave, window, listeners, actions, messages, cleanup };
}
test('close and app navigation support keep-editing confirmation; busy saves cannot be discarded', () => {
  const dirty = guardHarness({ dirty: true, busy: false }); let left = false;
  dirty.leave(() => { left = true; }); assert.equal(left, false);
  let prevented = false; dirty.listeners.get('fairway-before-navigate')({ preventDefault() { prevented = true; } }); assert.equal(prevented, true);
  dirty.window.confirm = () => true; dirty.leave(() => { left = true; }); assert.equal(left, true);
  const busy = guardHarness({ dirty: false, busy: true }); busy.leave(() => assert.fail('must not leave during save')); assert.match(busy.messages[0], /in progress/);
});
test('native Back restores editor before confirmation, Keep editing stays put, and listeners clean up', () => {
  const h = guardHarness({ dirty: true, busy: false });
  h.window.location.href = 'https://studio.example/ideas';
  let stopped = false;
  h.listeners.get('popstate')({ stopImmediatePropagation() { stopped = true; } });
  assert.equal(stopped, true);
  assert.deepEqual(h.actions, [['push', { editor: true }, '', 'https://studio.example/ideas?item=idea-1']]);
  h.window.confirm = () => true;
  h.listeners.get('popstate')({ stopImmediatePropagation() {} });
  assert.deepEqual(h.actions.at(-1), ['assign', 'https://studio.example/ideas']);
  h.cleanup(); assert.equal(h.listeners.size, 0);
});
test('verified completion bypasses unsaved navigation prompts without discarding an active save', () => {
  const h = guardHarness({ dirty: true, busy: true }); let completed = false;
  h.leave.complete(() => { completed = true; });
  assert.equal(completed, true);
  let prevented = false;
  h.listeners.get('fairway-before-navigate')({ preventDefault() { prevented = true; } });
  assert.equal(prevented, false);
  assert.equal(h.messages.length, 0);
});
