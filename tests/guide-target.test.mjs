import test from 'node:test'
import assert from 'node:assert/strict'
import { loadComponent } from './guide-load-component.mjs'

class Events {
  events = new Map()
  addEventListener(name, fn) { if (!this.events.has(name)) this.events.set(name, new Set()); this.events.get(name).add(fn) }
  removeEventListener(name, fn) { this.events.get(name)?.delete(fn) }
  dispatch(name) { for (const fn of [...(this.events.get(name) ?? [])]) fn() }
  count() { return [...this.events.values()].reduce((n, x) => n + x.size, 0) }
}
class FakeElement {
  isConnected = true
  parentElement = null
  style = { display: 'block', visibility: 'visible', opacity: '1', overflowX: 'visible', overflowY: 'visible' }
  clientLeft = 0
  clientTop = 0
  hidden = false
  rendered = true
  constructor(doc, x = 100, y = 100, w = 120, h = 40) { this.ownerDocument = doc; this.move(x, y, w, h) }
  move(x, y, w = this.rect.width, h = this.rect.height) {
    this.rect = { left: x, top: y, right: x + w, bottom: y + h, width: w, height: h }
    this.clientWidth = this.offsetWidth = w; this.clientHeight = this.offsetHeight = h
  }
  getBoundingClientRect() { return this.rect }
  getClientRects() { return this.rendered ? [this.rect] : [] }
  hasAttribute(name) { return name === 'hidden' && this.hidden }
  contains(element) { for (let node = element; node; node = node.parentElement) if (node === this) return true; return false }
}
const api = loadComponent(new URL('../components/studio/guide/guide-target.ts', import.meta.url).pathname, { HTMLElement: FakeElement })
function fixture() {
  const doc = new Events()
  doc.visibilityState = 'visible'
  const win = new Events()
  win.innerWidth = 1000; win.innerHeight = 700
  win.getComputedStyle = el => el.style
  win.visualViewport = Object.assign(new Events(), { offsetLeft: 0, offsetTop: 0, width: 1000, height: 700 })
  let id = 0
  const frames = new Map()
  win.requestAnimationFrame = fn => { frames.set(++id, fn); return id }
  win.cancelAnimationFrame = id => frames.delete(id)
  const target = new FakeElement(doc)
  let found = [target]
  doc.querySelectorAll = selector => { if (selector === '[') throw new Error('bad selector'); return found }
  doc.elementFromPoint = () => target
  return { doc, win, target, frames, setFound: value => { found = value }, tick: time => { const pending = [...frames.values()]; frames.clear(); for (const fn of pending) fn(time) }, read: t => api.readGuideTarget(t === undefined ? '#target' : t, doc, win) }
}

test('anchors the pointer tip to the real target center', () => {
  const f = fixture(); const state = f.read()
  assert.equal(state.status, 'visible'); assert.equal(state.point.x, 160); assert.equal(state.point.y, 120)
})
test('supports direct elements, getters, and null without page mutation', () => {
  const f = fixture(); assert.equal(f.read(f.target).status, 'visible'); assert.equal(f.read(() => f.target).status, 'visible'); assert.equal(f.read(null).status, 'missing')
})
test('invalid selectors and throwing resolver remain safely missing', () => {
  const f = fixture(); assert.equal(f.read('[').status, 'missing'); assert.equal(f.read(() => { throw Error('unmounted') }).status, 'missing')
})
test('absent or disconnected targets have no stale coordinates', () => {
  const f = fixture(); f.setFound([]); assert.equal(f.read().point, null); f.setFound([f.target]); f.target.isConnected = false; assert.equal(f.read().status, 'missing')
})
test('elements in another document are not followed', () => {
  const f = fixture(); f.target.ownerDocument = {}; assert.equal(f.read().status, 'missing')
})
test('offscreen targets hide; partial targets use their exposed portion', () => {
  const f = fixture(); f.target.move(-200, 100); assert.equal(f.read().status, 'offscreen')
  f.target.move(-80, 100); const state = f.read(); assert.equal(state.point.x, 20); assert.equal(state.rect.left, 0)
})
test('zero-sized and non-rendered targets hide', () => {
  const f = fixture(); f.target.rendered = false; assert.equal(f.read().status, 'hidden')
  f.target.rendered = true; f.target.move(10, 20, 0, 0); assert.equal(f.read().status, 'offscreen')
})
test('hidden, transparent, and collapsed targets or ancestors hide', () => {
  for (const style of [{ display: 'none' }, { visibility: 'hidden' }, { visibility: 'collapse' }, { opacity: '0' }]) {
    const f = fixture(); Object.assign(f.target.style, style); assert.equal(f.read().status, 'hidden')
    const g = fixture(); const parent = new FakeElement(g.doc); Object.assign(parent.style, style); g.target.parentElement = parent; assert.equal(g.read().status, 'hidden')
  }
})
test('hidden attribute hides a target even if a stylesheet overrides display', () => {
  const f = fixture(); f.target.hidden = true; assert.equal(f.read().status, 'hidden')
})
test('responsive selectors choose the visible copy rather than the first hidden copy', () => {
  const f = fixture(); const hidden = new FakeElement(f.doc); hidden.rendered = false; f.setFound([hidden, f.target]); assert.equal(f.read().status, 'visible')
})
test('nested scrolling parents clip the pointer to their visible interior', () => {
  const f = fixture(); const parent = new FakeElement(f.doc, 0, 110, 300, 200); parent.style.overflowY = 'auto'; f.target.parentElement = parent
  assert.equal(f.read().point.y, 125)
  parent.move(0, 200); assert.equal(f.read().status, 'offscreen')
})
test('horizontal clipping honors borders and scrollbar-free client width', () => {
  const f = fixture(); const parent = new FakeElement(f.doc, 0, 0, 130, 700); parent.style.overflowX = 'hidden'; parent.clientLeft = 5; parent.clientWidth = 110; f.target.parentElement = parent
  assert.equal(f.read().rect.right, 115); assert.equal(f.read().point.x, 107.5)
})
test('transformed clipping containers scale client geometry', () => {
  const f = fixture(); const parent = new FakeElement(f.doc, 0, 0, 250, 500); parent.style.overflowX = 'hidden'; parent.offsetWidth = 125; parent.clientWidth = 100; parent.clientLeft = 5; f.target.parentElement = parent
  assert.equal(f.read().rect.right, 210)
})
test('visual viewport excludes mobile keyboard/zoomed-out-of-view targets', () => {
  const f = fixture(); Object.assign(f.win.visualViewport, { offsetLeft: 130, offsetTop: 110, width: 200, height: 200 }); const state = f.read(); assert.equal(state.point.x, 175); assert.equal(state.point.y, 125)
  f.win.visualViewport.offsetTop = 400; assert.equal(f.read().status, 'offscreen')
})
test('layout viewport fallback works without visualViewport', () => {
  const f = fixture(); f.win.visualViewport = null; assert.equal(f.read().viewport.width, 1000)
})
test('occluding modal suppresses pointer and exposed interior can be reacquired', () => {
  const f = fixture(); const overlay = new FakeElement(f.doc); f.doc.elementFromPoint = () => overlay; assert.equal(f.read().status, 'obscured'); assert.ok(f.read().rect); assert.equal(f.read().point, null)
  f.doc.elementFromPoint = x => x < 150 ? f.target : overlay; const state = f.read(); assert.equal(state.status, 'visible'); assert.equal(state.point.x, 130)
})
test('a real child control counts as hitting the target', () => {
  const f = fixture(); const child = new FakeElement(f.doc); child.parentElement = f.target; f.doc.elementFromPoint = () => child; assert.equal(f.read().status, 'visible')
})
test('snapshot comparison suppresses redundant React updates', () => {
  const f = fixture(); const before = f.read(); assert.equal(api.sameGuideTarget(before, f.read()), true); f.target.move(100.1, 100.1); assert.equal(api.sameGuideTarget(before, f.read()), true); f.target.move(101, 100); assert.equal(api.sameGuideTarget(before, f.read()), false)
})
test('observer follows scroll, resize, CSS/layout motion, and target replacement', () => {
  const f = fixture(); const values = []; const stop = api.observeGuideTarget('#target', v => values.push(v), f)
  assert.equal(values.length, 1); assert.equal(f.frames.size, 1)
  f.tick(0); assert.equal(values.length, 1)
  f.target.move(100, 150); f.win.dispatch('scroll'); assert.equal(values.at(-1).point.y, 170)
  f.target.move(100, 200); f.win.dispatch('resize'); assert.equal(values.at(-1).point.y, 220)
  f.target.move(100, 250); f.tick(40); assert.equal(values.at(-1).point.y, 270)
  f.setFound([]); f.tick(80); assert.equal(values.at(-1).status, 'missing')
  f.setFound([f.target]); f.tick(120); assert.equal(values.at(-1).status, 'visible'); stop()
})
test('offscreen target remains observed and automatically reappears on return', () => {
  const f = fixture(); const values = []; const stop = api.observeGuideTarget('#target', v => values.push(v), f)
  f.target.move(100, 900); f.tick(0); assert.equal(values.at(-1).status, 'offscreen'); assert.equal(values.at(-1).point, null)
  f.target.move(100, 400); f.tick(40); assert.equal(values.at(-1).status, 'visible'); stop()
})
test('background cancels frames, hides pointer, and resumes by remeasuring', () => {
  const f = fixture(); const values = []; const stop = api.observeGuideTarget('#target', v => values.push(v), f)
  f.doc.visibilityState = 'hidden'; f.doc.dispatch('visibilitychange'); assert.equal(values.at(-1).status, 'background'); assert.equal(f.frames.size, 0)
  f.target.move(100, 300); f.win.dispatch('scroll'); assert.equal(values.at(-1).status, 'background')
  f.doc.visibilityState = 'visible'; f.doc.dispatch('visibilitychange'); assert.equal(values.at(-1).point.y, 320); assert.equal(f.frames.size, 1); stop()
})
test('starting in a background tab schedules no frame', () => {
  const f = fixture(); f.doc.visibilityState = 'hidden'; const values = []; const stop = api.observeGuideTarget('#target', v => values.push(v), f); assert.equal(values[0].status, 'background'); assert.equal(f.frames.size, 0); stop()
})
test('close/unmount cleanup removes every frame and listener and is idempotent', () => {
  const f = fixture(); const values = []; const stop = api.observeGuideTarget('#target', v => values.push(v), f)
  assert.equal(f.doc.count(), 1); assert.equal(f.win.count(), 2); assert.equal(f.win.visualViewport.count(), 2)
  stop(); stop(); assert.equal(f.frames.size, 0); assert.equal(f.doc.count(), 0); assert.equal(f.win.count(), 0); assert.equal(f.win.visualViewport.count(), 0)
  f.target.move(400, 300); f.win.dispatch('resize'); f.doc.dispatch('visibilitychange'); f.tick(100); assert.equal(values.length, 1)
})
test('visual viewport scroll and resize remeasure immediately', () => {
  const f = fixture(); const values = []; const stop = api.observeGuideTarget('#target', v => values.push(v), f)
  f.win.visualViewport.offsetLeft = 180; f.win.visualViewport.dispatch('scroll'); assert.equal(values.at(-1).point.x, 200)
  f.win.visualViewport.height = 100; f.win.visualViewport.dispatch('resize'); assert.equal(values.at(-1).status, 'offscreen'); stop()
})
