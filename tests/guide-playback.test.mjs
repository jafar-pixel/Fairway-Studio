import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import * as icons from 'lucide-react';
import { renderToStaticMarkup } from 'react-dom/server';

function load(path, dependencies = {}, globals = {}) {
  const source = fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    exports: module.exports, module, require(name) { if (!(name in dependencies)) throw Error(`Unexpected dependency: ${name}`); return dependencies[name]; }, ...globals,
  }, { filename: path });
  return module.exports;
}
const guide = load('lib/studio/guide-playback.ts');
const onboarding = load('lib/studio/onboarding.ts', { './guide-playback': guide });
const plain = (value) => JSON.parse(JSON.stringify(value));
const projectIds = ['project-a', 'project-b'];
const initial = (route = [], project = null) => guide.createWalkthroughProgress(route, project, projectIds);
const toolbar = load('components/studio/guide/guide-toolbar.tsx', { react: React, 'react/jsx-runtime': jsxRuntime, './guide.css': {} });
// Server markup checks exercise real controls; portal/geometry lifecycle is checked
// separately by the pointer runtime suite, not simulated by server rendering.
const primitives = { ...toolbar, GuidePointer: () => null, GuidePortal: ({ children }) => children };

function host(extra = {}) {
  const slots = [], pendingEffects = [], effects = new Map(), timers = new Map(), frames = new Map(), navigations = [], progressWrites = [];
  let cursor = 0, nextTimer = 0, dirty = true, result;
  const changed = (a, b) => !a || !b || a.length !== b.length || a.some((item, index) => !Object.is(item, b[index]));
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], value => { const next = typeof value === 'function' ? value(slots[index]) : value; if (!Object.is(next, slots[index])) { slots[index] = next; dirty = true; } }];
    },
    useRef(initial) { const index = cursor++; if (!(index in slots)) slots[index] = { current: initial }; return slots[index]; },
    useEffect(fn, deps) { const index = cursor++; if (!effects.has(index) || changed(effects.get(index).deps, deps)) pendingEffects.push({ index, fn, deps }); },
  };
  function events() {
    return { listeners: new Map(), addEventListener(name, fn) { if (!this.listeners.has(name)) this.listeners.set(name, new Set()); this.listeners.get(name).add(fn); }, removeEventListener(name, fn) { this.listeners.get(name)?.delete(fn); if (!this.listeners.get(name)?.size) this.listeners.delete(name); }, fire(name, payload = {}) { for (const fn of [...(this.listeners.get(name) || [])]) fn(payload); } };
  }
  class Element { constructor(inPlayer = false) { this.inPlayer = inPlayer; } closest(selector) { assert.equal(selector, '[data-guide-player]'); return this.inPlayer ? this : null; } }
  const highlighted = new Set(), scrolls = [];
  const target = { classList: { add(value) { highlighted.add(value); }, remove(value) { highlighted.delete(value); } }, scrollIntoView(value) { scrolls.push(value); }, getClientRects: () => extra.hiddenTarget ? [] : [{}], closest: () => null, parentElement: null, hidden: false };
  const media = { ...events(), matches: !!extra.reducedMotion };
  const window = { ...events(), matchMedia: () => media, getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1' }), requestAnimationFrame(fn) { const id = ++nextTimer; frames.set(id, fn); return id; }, cancelAnimationFrame(id) { frames.delete(id); } };
  const document = { ...events(), visibilityState: 'visible', querySelectorAll: () => extra.missingTarget ? [] : [target] };
  let options = {
    scope: `test-${Math.random()}`, initial: initial(), autoPlay: true, target: null, route: [], routeKey: '/demo', projectIds,
    onNavigate: (route) => { navigations.push(plain(route)); return extra.blockNavigation ? false : true; },
    onProgress: (progress) => progressWrites.push(plain(progress)), ...extra,
  };
  const { useGuidePlayback } = load('lib/studio/use-guide-playback.ts', { react, './guide-playback': guide }, {
    window, document, Element,
    setTimeout(fn, milliseconds) { const id = ++nextTimer; timers.set(id, { fn, milliseconds }); return id; },
    clearTimeout(id) { timers.delete(id); },
  });
  const api = {
    timers, frames, window, document, media, highlighted, scrolls, navigations, progressWrites, Element,
    settle(next = {}) {
      options = { ...options, ...next }; dirty = true;
      let renders = 0;
      while (dirty) {
        assert.ok(++renders < 30, 'Must settle without an effect/render loop');
        dirty = false; cursor = 0; result = useGuidePlayback(options);
        for (const { index, fn, deps } of pendingEffects.splice(0)) { effects.get(index)?.cleanup?.(); effects.set(index, { deps, fn, cleanup: fn() }); }
        if (extra.autoTarget !== false && options.target?.stepId !== result.scene.id) { options.target = { stepId: result.scene.id, status: 'visible' }; dirty = true; }
      }
      return result;
    },
    get state() { return result; },
    timer() { assert.equal(timers.size, 1); const [id, timer] = [...timers][0]; timers.delete(id); timer.fn(); return api.settle(); },
    arrive() { const route = navigations.at(-1); assert.ok(route); return api.settle({ route, routeKey: `/demo/${route.join('/')}` }); },
    frame() { for (const [id, fn] of [...frames]) { frames.delete(id); fn(); } },
    strictReplay() { const previous = [...effects]; for (const [, effect] of previous) effect.cleanup?.(); for (const [index, effect] of previous) effects.set(index, { ...effect, cleanup: effect.fn() }); return api.settle(); },
    unmount() { for (const effect of effects.values()) effect.cleanup?.(); effects.clear(); },
  };
  api.settle();
  return api;
}

test('walkthrough persists a validated cursor without changing goal, selections, page steps, or milestones', () => {
  const state = onboarding.createInitialOnboardingState();
  state.goal = 'product'; state.selectedProjectId = 'project-a'; state.tours.ideas = { stepId: 'selection', status: 'skipped' };
  state.selections.ideas = 'existing-idea'; state.verifiedMilestones.createIdea = '2026-10-02T00:00:00.000Z';
  const loaded = onboarding.parseOnboardingState({ ...state, walkthrough: { ...initial(['ideas']), stepId: 'tasks' } }, projectIds);
  assert.equal(loaded.walkthrough.stepId, 'tasks');
  for (const key of ['goal', 'selectedProjectId', 'tours', 'selections', 'verifiedMilestones']) assert.deepEqual(plain(loaded[key]), plain(state[key]));
  assert.equal(onboarding.parseOnboardingState(state, projectIds).walkthrough, null);
});

test('route allowlist rejects external, action, injected, unavailable-project and malformed persisted routes', () => {
  for (const route of [['https://evil.example'], ['ideas?action=create'], ['projects', 'missing'], ['projects', 'project-a', 'delete'], ['settings', 'invite'], ['tasks', 'new'], ['projects', 'project-a', 'canvas', 'extra'], ['..'], {}, [7]]) {
    assert.equal(guide.safeWalkthroughRoute(route, projectIds), null, JSON.stringify(route));
    assert.equal(guide.parseWalkthroughProgress({ stepId: 'start', originRoute: route }, projectIds), null);
  }
  assert.equal(guide.safeWalkthroughRoute(['projects', '../escape'], ['../escape']), null);
  assert.deepEqual(plain(guide.safeWalkthroughRoute(['projects', 'project-a', 'canvas'], projectIds)), ['projects', 'project-a', 'canvas']);
});

test('only an explicitly selected or current project is visited, and current route wins', () => {
  assert.ok(guide.walkthroughSteps(initial()).every(step => step.route.length <= 1));
  const progress = initial(['projects', 'project-a', 'canvas'], 'project-b');
  assert.equal(progress.projectId, 'project-a');
  assert.ok(guide.walkthroughSteps(progress).filter(step => step.route[0] === 'projects' && step.route[1]).every(step => step.route[1] === 'project-a'));
  const removed = guide.parseWalkthroughProgress({ ...initial([], 'project-a'), stepId: 'canvas' }, []);
  assert.equal(removed.projectId, null);
  assert.equal(removed.stepId, 'start');
});

test('forward/back restore exact prior scenes and routes; restart preserves the launch route and project', () => {
  const origin = initial(['projects', 'project-a', 'files']);
  let progress = { ...origin, stepId: 'projects' };
  const advanced = guide.moveWalkthrough(progress, 1);
  assert.equal(advanced.stepId, 'library');
  assert.deepEqual(plain(guide.moveWalkthrough(advanced, -1)), plain(progress));
  assert.deepEqual(plain(guide.moveWalkthrough(advanced, 'restart')), plain(origin));
  assert.deepEqual(plain(guide.moveWalkthrough(origin, -1)), plain(origin));
  const finish = { ...origin, stepId: 'finish', completed: true };
  assert.deepEqual(plain(guide.moveWalkthrough(finish, 1)), plain(finish));
  assert.equal(guide.sameWalkthroughRoute(['projects', 'project-a'], ['projects', 'project-a', 'overview']), true);
});

test('Play advances on one timer and pauses before inputs/actions without clicking or mutating', () => {
  const h = host();
  assert.equal(h.state.playing, true);
  assert.equal([...h.timers.values()][0].milliseconds, guide.WALKTHROUGH_DELAY_MS);
  h.timer(); assert.equal(h.state.scene.id, 'home');
  h.timer(); assert.equal(h.state.scene.id, 'ideas'); assert.equal(h.state.pending, true);
  assert.deepEqual(h.navigations, [['ideas']]);
  assert.equal([...h.timers.values()][0].milliseconds, guide.WALKTHROUGH_NAVIGATION_TIMEOUT_MS);
  h.arrive(); assert.equal(h.state.pending, false); assert.equal(h.state.playing, true);
  h.timer(); assert.equal(h.state.scene.id, 'ideas-input'); assert.equal(h.state.playing, false); assert.equal(h.timers.size, 0);
  assert.match(h.state.message, /Paused before input/);
  h.state.play(); h.settle(); assert.equal(h.state.scene.id, 'projects'); assert.equal(h.state.pending, true);
  h.unmount();
});

test('resuming a saved checkpoint stays on that step and waits for an explicit continuation', () => {
  const h = host({ initial: { ...initial(), stepId: 'ideas-input' }, route: ['ideas'], routeKey: '/demo/ideas' });
  assert.equal(h.state.scene.id, 'ideas-input'); assert.equal(h.state.playing, false); assert.equal(h.timers.size, 0);
  h.state.play(); h.settle(); assert.equal(h.state.scene.id, 'projects'); h.unmount();
});

test('Pause and close/unmount cancel timers, animation frames and listeners without decorating workspace nodes', () => {
  const h = host(); h.frame(); assert.equal(h.highlighted.size, 0);
  h.state.pause(); h.settle(); assert.equal(h.timers.size, 0);
  h.state.play(); h.settle(); assert.equal(h.timers.size, 1);
  h.unmount();
  assert.equal(h.timers.size, 0); assert.equal(h.frames.size, 0); assert.equal(h.highlighted.size, 0);
  assert.equal(h.window.listeners.size, 0); assert.equal(h.document.listeners.size, 0); assert.equal(h.media.listeners.size, 0);
});

test('Back navigates to the previous route and repeated presses cannot queue competing transitions', () => {
  const h = host({ initial: { ...initial(), stepId: 'projects' }, autoPlay: false, route: ['projects'], routeKey: '/demo/projects' });
  h.state.back(); h.state.back(); h.settle();
  assert.equal(h.navigations.length, 1); assert.deepEqual(h.navigations[0], ['ideas']);
  assert.equal(h.state.scene.id, 'ideas-input'); assert.equal(h.state.playing, false);
  h.arrive(); h.state.back(); h.settle(); assert.equal(h.state.scene.id, 'ideas');
  h.state.back(); h.settle(); assert.equal(h.state.scene.id, 'home'); assert.deepEqual(h.navigations.at(-1), []);
  h.unmount();
});

test('background, window blur, browser history and workspace interaction pause synchronously', () => {
  for (const interrupt of [h => { h.document.visibilityState = 'hidden'; h.document.fire('visibilitychange'); }, h => h.window.fire('blur'), h => h.window.fire('pagehide'), h => h.window.fire('popstate'), h => h.document.fire('pointerdown', { target: new h.Element() }), h => h.document.fire('focusin', { target: new h.Element() }), h => h.document.fire('input', { target: new h.Element() })]) {
    const h = host(); interrupt(h); assert.equal(h.timers.size, 0); h.settle(); assert.equal(h.state.playing, false); h.unmount();
  }
  const h = host(); h.document.fire('pointerdown', { target: new h.Element(true) }); h.settle(); assert.equal(h.state.playing, true); h.unmount();
});

test('unexpected navigation cancels autoplay and Play returns to its saved scene', () => {
  const h = host(); h.settle({ route: ['tasks'], routeKey: '/demo/tasks' });
  assert.equal(h.state.playing, false); assert.equal(h.timers.size, 0); assert.equal(h.state.scene.id, 'start');
  h.state.play(); h.settle(); assert.deepEqual(h.navigations.at(-1), []); assert.equal(h.state.pending, true);
  h.arrive(); assert.equal(h.state.playing, true); h.unmount();
});

test('blocked, timed-out, or interrupted navigation stops cleanly and does not lose the prior cursor', () => {
  const blocked = host({ blockNavigation: true }); blocked.timer(); blocked.timer();
  assert.equal(blocked.state.scene.id, 'home'); assert.equal(blocked.state.playing, false); assert.equal(blocked.state.pending, false); assert.equal(blocked.timers.size, 0); assert.match(blocked.state.message, /protect your work/); blocked.unmount();
  const slow = host(); slow.timer(); slow.timer(); slow.timer();
  assert.equal(slow.state.pending, false); assert.equal(slow.state.playing, false); assert.equal(slow.timers.size, 0); assert.match(slow.state.message, /not opened/); slow.unmount();
  const away = host(); away.timer(); away.timer(); away.window.fire('blur'); away.settle();
  assert.equal(away.state.pending, false); assert.equal(away.state.playing, false); assert.equal(away.timers.size, 0); away.unmount();
});

test('reduced motion disables smooth scrolling and strict effect replay retains exactly one timer', () => {
  const h = host({ reducedMotion: true }); h.frame();
  assert.ok(h.scrolls.length); assert.ok(h.scrolls.every(scroll => scroll.behavior === 'auto'));
  h.strictReplay(); assert.equal(h.state.playing, true); assert.equal(h.timers.size, 1);
  h.timer(); assert.equal(h.state.scene.id, 'home'); h.unmount();
});

test('unstable parent arrays/callbacks do not create loops, reset cursor, or duplicate timers', () => {
  const h = host(); h.timer(); const writes = h.progressWrites.length;
  for (let i = 0; i < 20; i++) h.settle({ route: [], projectIds: [...projectIds], onNavigate: () => true, onProgress: progress => h.progressWrites.push(progress) });
  assert.equal(h.progressWrites.length, writes); assert.equal(h.state.scene.id, 'home'); assert.equal(h.timers.size, 1); h.unmount();
});

test('permission loss pauses a project tour before another navigation can occur', () => {
  const h = host({ initial: { ...initial([], 'project-a'), stepId: 'canvas' }, route: ['projects', 'project-a', 'canvas'], routeKey: '/demo/projects/project-a/canvas' });
  h.settle({ projectIds: [] }); assert.equal(h.state.playing, false); assert.equal(h.timers.size, 0); assert.match(h.state.message, /no longer available/); h.unmount();
});

test('automatic navigation survives an actual player unmount and remount on the exact requested page', () => {
  const scope = 'remount-tour';
  const first = host({ scope, initial: initial(['ideas']), route: ['ideas'], routeKey: '/demo/ideas' });
  first.timer(); assert.equal(first.state.scene.id, 'home'); assert.equal(first.state.pending, true);
  first.unmount(); assert.equal(first.timers.size, 0);
  const transfer = guide.readWalkthroughHandoff(scope, [], projectIds);
  assert.ok(transfer); assert.equal(transfer.playing, true); assert.equal(transfer.progress.stepId, 'home');
  const second = host({ scope, initial: transfer.progress, autoPlay: transfer.playing, route: [], routeKey: '/demo' });
  guide.clearWalkthroughHandoff(scope, transfer.token);
  assert.equal(second.state.scene.id, 'home'); assert.equal(second.state.playing, true); assert.equal(second.timers.size, 1);
  second.timer(); assert.equal(second.state.scene.id, 'ideas'); second.unmount();
  guide.clearWalkthroughHandoff(scope);
});

test('reverse navigation carries its paused cursor across a remount', () => {
  const scope = 'reverse-remount';
  const first = host({ scope, initial: { ...initial(['ideas']), stepId: 'projects' }, autoPlay: false, route: ['projects'], routeKey: '/demo/projects' });
  first.state.back(); first.settle(); first.unmount();
  const transfer = guide.readWalkthroughHandoff(scope, ['ideas'], projectIds);
  assert.ok(transfer); assert.equal(transfer.playing, false); assert.equal(transfer.progress.stepId, 'ideas-input');
  const second = host({ scope, initial: transfer.progress, autoPlay: transfer.playing, route: ['ideas'], routeKey: '/demo/ideas' });
  guide.clearWalkthroughHandoff(scope, transfer.token);
  assert.equal(second.state.scene.id, 'ideas-input'); assert.equal(second.state.playing, false); assert.equal(second.timers.size, 0); second.unmount();
});

test('handoffs cannot resume after an unrelated route, account/workspace change, close, expiration or reload', () => {
  const scope = 'handoff-security';
  const progress = { ...initial(), stepId: 'ideas' };
  guide.prepareWalkthroughHandoff(scope, progress, ['ideas'], true, 1000);
  assert.equal(guide.readWalkthroughHandoff('another-scope', ['ideas'], projectIds, 1001), null);
  assert.equal(guide.readWalkthroughHandoff(scope, ['tasks'], projectIds, 1001), null);
  assert.equal(guide.readWalkthroughHandoff(scope, ['ideas'], projectIds, 1001), null);
  guide.prepareWalkthroughHandoff(scope, progress, ['ideas'], true, 1000);
  assert.equal(guide.readWalkthroughHandoff(scope, ['ideas'], projectIds, 1000 + guide.WALKTHROUGH_NAVIGATION_TIMEOUT_MS), null);
  guide.prepareWalkthroughHandoff(scope, progress, ['ideas'], true);
  const reloadedModule = load('lib/studio/guide-playback.ts');
  assert.equal(reloadedModule.readWalkthroughHandoff(scope, ['ideas'], projectIds), null);
  guide.clearWalkthroughHandoff(scope);
  const h = host({ scope }); h.timer(); h.timer(); h.state.pause(); h.settle(); h.unmount();
  assert.equal(guide.readWalkthroughHandoff(scope, ['ideas'], projectIds), null);
});

test('a new OnboardingGuide instance reopens the transferred player instead of its launcher', () => {
  const scope = JSON.stringify(['user', 'demo']);
  guide.prepareWalkthroughHandoff(scope, { ...initial(['ideas']), stepId: 'home' }, [], true);
  const hook = load('lib/studio/use-guide-playback.ts', { react: React, './guide-playback': guide });
  const component = load('components/studio/onboarding-guide.tsx', { react: React, 'react/jsx-runtime': jsxRuntime, 'lucide-react': icons, '@/lib/studio/onboarding': onboarding, '@/lib/studio/guide-playback': guide, '@/lib/studio/use-guide-playback': hook, './guide': primitives });
  const page = renderToStaticMarkup(React.createElement(component.OnboardingGuide, { pageId: 'home', route: [], routeKey: '/demo', data: { workspace: { id: 'demo' } }, userId: 'user', state: onboarding.createInitialOnboardingState(), onChange() {}, onAction() { throw Error('Never call work actions'); }, onNavigate() {} }));
  assert.match(page, /data-guide-player/); assert.match(page, /Pick up your next idea/); assert.doesNotMatch(page, /Run walkthrough/);
  guide.clearWalkthroughHandoff(scope);
});

test('UI presents named playback controls with non-submitting buttons and preserves the page-guide entry', () => {
  const hook = load('lib/studio/use-guide-playback.ts', { react: React, './guide-playback': guide });
  const component = load('components/studio/onboarding-guide.tsx', { react: React, 'react/jsx-runtime': jsxRuntime, 'lucide-react': icons, '@/lib/studio/onboarding': onboarding, '@/lib/studio/guide-playback': guide, '@/lib/studio/use-guide-playback': hook, './guide': primitives });
  const player = renderToStaticMarkup(React.createElement(component.WalkthroughPlayer, { scope: 'test', initial: initial(), route: [], routeKey: '/demo', projectIds, onNavigate() {}, onProgress() {}, onClose() {} }));
  for (const label of ['Play guide', 'Previous guide step', 'Next guide step', 'Restart guide', 'Close guide']) assert.ok(player.includes(label), label);
  assert.ok((player.match(/<button\b[^>]*>/g) || []).every(button => /type="button"/.test(button)));
  const page = renderToStaticMarkup(React.createElement(component.OnboardingGuide, { pageId: 'home', route: [], data: {}, userId: 'user', state: onboarding.createInitialOnboardingState(), onChange() {}, onAction() {}, onNavigate() {} }));
  assert.match(page, /Run walkthrough/); assert.match(page, /Choose a goal/); assert.doesNotMatch(page, /fs-onboarding-(?:card|popover)/);
});


test('autoplay only advances after fresh visible geometry for the current scene', () => {
  const h = host({ autoTarget: false });
  assert.equal(h.state.targetReady, false);
  assert.equal([...h.timers.values()][0].milliseconds, guide.WALKTHROUGH_TARGET_TIMEOUT_MS);
  h.settle({ target: { stepId: 'start', status: 'visible' } });
  assert.equal(h.state.targetReady, true);
  assert.equal([...h.timers.values()][0].milliseconds, guide.WALKTHROUGH_DELAY_MS);
  h.timer(); assert.equal(h.state.scene.id, 'home');
  assert.equal(h.state.targetReady, false, 'Previous scene geometry cannot authorize autoplay');
  assert.equal([...h.timers.values()][0].milliseconds, guide.WALKTHROUGH_TARGET_TIMEOUT_MS);
  h.timer(); assert.equal(h.state.playing, false); assert.equal(h.timers.size, 0);
  assert.match(h.state.message, /not visible/);
  h.settle({ target: { stepId: 'home', status: 'visible' } });
  assert.equal(h.state.playing, false, 'Reacquisition after a stop requires Play');
  h.unmount();
});

test('missing, hidden, obscured, and offscreen controls pause without infinite waiting; Next can skip', () => {
  for (const status of ['missing', 'hidden', 'obscured', 'offscreen']) {
    const h = host({ autoTarget: false, target: { stepId: 'start', status } });
    h.timer(); assert.equal(h.state.playing, false); assert.equal(h.timers.size, 0);
    h.state.next(); h.settle(); assert.equal(h.state.scene.id, 'home'); assert.equal(h.state.playing, false);
    h.unmount();
  }
});

test('scrolling never substitutes a broad page target or opens a hidden menu', () => {
  for (const options of [{ missingTarget: true }, { hiddenTarget: true }]) {
    const h = host(options); h.frame(); assert.deepEqual(h.scrolls, []); h.unmount();
  }
  const source = fs.readFileSync(new URL('../lib/studio/use-guide-playback.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /querySelector[^;]+data-guide-page|classList\.add|\.click\(|dispatchEvent\(/);
});

test('wheel, touch, and typing pause before workspace interaction; guide controls stay usable', () => {
  for (const event of ['wheel', 'touchstart', 'keydown']) {
    const h = host(); h.document.fire(event, { target: new h.Element() }); h.settle();
    assert.equal(h.state.playing, false); assert.equal(h.timers.size, 0); h.unmount();
  }
});

test('source-first tour uses concrete controls and pauses at real work checkpoints', () => {
  const scenes = guide.walkthroughSteps(initial([], 'project-a'));
  const index = id => scenes.findIndex(scene => scene.id === id);
  assert.ok(index('library') < index('canvas'));
  assert.ok(index('files') < index('canvas'));
  assert.ok(scenes.every(scene => scene.target && !/data-guide-page|fs-home-heading|fp-project-index|fp-canvas-layout/.test(scene.target)));
  for (const id of ['ideas-input', 'project-overview', 'files', 'canvas-input', 'tasks', 'settings-input']) assert.equal(scenes[index(id)].checkpoint, true, id);
  const projectSource = fs.readFileSync(new URL('../components/studio/projects.tsx', import.meta.url), 'utf8');
  assert.match(projectSource, /data-guide-target="canvas-note"/);
});

test('compact guide has no modal, backdrop, fake click dispatch, or page-sized catcher', () => {
  const source = fs.readFileSync(new URL('../components/studio/onboarding-guide.tsx', import.meta.url), 'utf8');
  const css = fs.readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8').split('/* The guide owns only compact edge controls;')[1];
  assert.doesNotMatch(source, /fs-onboarding-card|fs-walkthrough-card|aria-modal|dispatchEvent|\.click\(/);
  assert.match(css, /\.fs-guide-dock[^}]+pointer-events: none/);
  assert.doesNotMatch(css, /inset: 0|backdrop-filter|100vw[^;]+100vh/);
  assert.match(source, /player\.pause\(\); onClose\(\)/);
});


test('repeated pending Back, Next, and Restart retain the navigation timeout', () => {
  const h = host({ initial: { ...initial(), stepId: 'projects' }, autoPlay: false, route: ['projects'], routeKey: '/demo/projects' });
  h.state.next(); h.settle();
  assert.equal(h.state.pending, true);
  h.state.back(); h.state.next(); h.state.restart(); h.settle();
  assert.equal(h.navigations.length, 1);
  assert.equal([...h.timers.values()][0].milliseconds, guide.WALKTHROUGH_NAVIGATION_TIMEOUT_MS);
  h.timer(); assert.equal(h.state.pending, false); assert.equal(h.state.playing, false); h.unmount();
});


test('the current profile settings route is retained as the tour origin and restored at finish', () => {
  const progress = initial(['settings', 'profile']);
  assert.deepEqual(plain(progress.originRoute), ['settings', 'profile']);
  assert.deepEqual(plain(guide.walkthroughSteps(progress).at(-1).route), ['settings', 'profile']);
});


test('pointer travel stays within the mounted run and Restart invalidates its old origin', () => {
  const source = fs.readFileSync(new URL('../components/studio/onboarding-guide.tsx', import.meta.url), 'utf8');
  assert.match(source, /runKey=\{`\$\{scope\}:\$\{runSequence\}`\}/);
  assert.match(source, /setRunSequence\(\(value\) => value \+ 1\); player\.restart\(\)/);
  assert.doesNotMatch(source, /localStorage.*(?:point|position)|sessionStorage.*(?:point|position)/);
});
