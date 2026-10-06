import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModule, media, workspaceId, userId, deferred, tick } from './media-test-harness.mjs';

// Minimal deterministic hook host: effects and network completions are advanced by
// the test, with no browser, timers, actual HTTP requests or extra test packages.
function hookHost(options = {}) {
  const slots = [], pendingEffects = [], effects = new Map(), timers = new Map(), requests = [];
  let cursor = 0, nextTimer = 0;
  const changed = (a, b) => !a || !b || a.length !== b.length || a.some((item, index) => !Object.is(item, b[index]));
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
    },
    useRef(initial) { const index = cursor++; if (!(index in slots)) slots[index] = { current: initial }; return slots[index]; },
    useCallback(fn, deps) { const index = cursor++; if (!slots[index] || changed(slots[index].deps, deps)) slots[index] = { fn, deps }; return slots[index].fn; },
    useEffect(fn, deps) {
      const index = cursor++;
      if (!effects.has(index) || changed(effects.get(index).deps, deps)) pendingEffects.push({ index, fn, deps });
    },
  };
  const events = () => ({ listeners: new Map(), addEventListener(name, fn) { this.listeners.set(name, fn); }, removeEventListener(name, fn) { if (this.listeners.get(name) === fn) this.listeners.delete(name); } });
  const window = events(), document = { ...events(), visibilityState: 'visible' }, navigator = { onLine: true };
  const previewState = loadModule('lib/studio/media-preview-state.ts', { '@/lib/studio/media': media });
  const module = loadModule('components/studio/media-player.tsx', {
    react, 'react/jsx-runtime': {}, 'lucide-react': {}, './media.css': {}, '@/lib/studio/media': media, '@/lib/studio/media-preview-state': previewState,
  }, {
    window, document, navigator,
    setTimeout: (callback, milliseconds) => { const id = ++nextTimer; timers.set(id, { callback, milliseconds }); return id; },
    clearTimeout: id => timers.delete(id),
    fetch: async (url, init) => {
      requests.push({ url, init });
      if (options.fetch) return options.fetch(url, init);
      const fileId = new URL(url, 'https://app.example.test').searchParams.get('fileIds');
      return { ok: true, status: 200, json: async () => ({ jobs: [job({ file_id: fileId })], worker }) };
    },
  });
  return {
    requests, timers, window, document, navigator,
    render(props) { cursor = 0; return module.useMediaPreview(props); },
    effects() { for (const { index, fn, deps } of pendingEffects.splice(0)) { effects.get(index)?.cleanup?.(); effects.set(index, { deps, cleanup: fn() }); } },
    unmount() { for (const effect of effects.values()) effect.cleanup?.(); effects.clear(); },
  };
}
const worker = { available: true, automatic: true, code: null, message: null };
const job = (extra = {}) => ({ id: 'job-1', file_id: 'file-1', workspace_id: workspaceId, created_by: userId, status: 'failed', source_type: 'image/png', attempts: 1, ...extra });
const props = (extra = {}) => ({ workspaceId, fileId: 'file-1', initialJob: job(), initialWorker: worker, ...extra });

test('preview polling uses canonical scoped endpoint and releases listeners, requests and timers on unmount', async () => {
  const host = hookHost({ fetch: async () => ({ ok: true, status: 200, json: async () => ({ jobs: [job({ status: 'processing' })], worker }) }) });
  host.render(props()); host.effects();
  await tick();
  assert.equal(host.requests.length, 1);
  const { url, init } = host.requests[0];
  const query = new URL(url, 'https://app.example.test');
  assert.equal(query.pathname, '/api/studio/media/jobs');
  assert.equal(query.searchParams.get('workspaceId'), workspaceId);
  assert.equal(query.searchParams.get('fileIds'), 'file-1');
  assert.equal(init.credentials, 'same-origin');
  assert.equal(init.cache, 'no-store');
  assert.equal(host.timers.size, 1);
  assert.equal([...host.timers.values()][0].milliseconds, 4000);
  host.unmount();
  assert.equal(init.signal.aborted, true);
  assert.equal(host.timers.size, 0);
  assert.equal(host.window.listeners.size, 0);
  assert.equal(host.document.listeners.size, 0);
});

test('pending preview retry is single-flight and navigation clears its loading state', async () => {
  const pending = deferred();
  const host = hookHost({ fetch: async (url, init) => {
    if (init.method === 'POST') {
      init.signal.addEventListener('abort', () => pending.reject(new DOMException('Aborted', 'AbortError')), { once: true });
      return pending.promise;
    }
    const fileId = new URL(url, 'https://app.example.test').searchParams.get('fileIds');
    return { ok: true, status: 200, json: async () => ({ jobs: [job({ file_id: fileId })], worker }) };
  } });
  host.render(props()); host.effects(); await tick();
  let state = host.render(props());
  const first = state.retry(), second = state.retry();
  state = host.render(props());
  assert.equal(state.retrying, true);
  assert.equal(host.requests.filter(request => request.init.method === 'POST').length, 1);
  const nextProps = props({ fileId: 'file-2', initialJob: job({ file_id: 'file-2', id: 'job-2' }) });
  host.render(nextProps); host.effects(); await tick();
  await Promise.all([first, second]);
  state = host.render(nextProps);
  assert.equal(state.scope, `${workspaceId}/file-2`);
  assert.equal(state.retrying, false);
  host.unmount();
});

test('permission failure hides stale ready data and does not poll indefinitely', async () => {
  const host = hookHost({ fetch: async () => ({ ok: false, status: 403, json: async () => ({ error: 'Workspace access changed.' }) }) });
  const input = props({ initialJob: job({ status: 'ready', original_ready: true }) });
  host.render(input); host.effects(); await tick();
  const state = host.render(input);
  assert.equal(state.job, null);
  assert.equal(state.loading, false);
  assert.equal(state.error, 'Workspace access changed.');
  assert.equal(host.timers.size, 0);
  host.unmount();
});

test('responses for another file or workspace never replace the current job', async () => {
  const host = hookHost({ fetch: async () => ({ ok: true, status: 200, json: async () => ({ jobs: [job({ file_id: 'other-file', status: 'ready', original_ready: true }), job({ workspace_id: userId, status: 'ready', original_ready: true })], worker }) }) });
  host.render(props()); host.effects(); await tick();
  const state = host.render(props());
  assert.equal(state.job, null);
  assert.match(state.error, /No preview job/);
  host.unmount();
});
