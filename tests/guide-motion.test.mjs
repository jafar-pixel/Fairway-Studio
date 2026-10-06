import test from 'node:test'
import assert from 'node:assert/strict'
import { loadComponent } from './guide-load-component.mjs'

const { createGuidePointerMotion } = loadComponent(new URL('../components/studio/guide/guide-motion.ts', import.meta.url).pathname)
const visible = (x, y) => ({ status: 'visible', point: { x, y }, rect: { left: x - 10, right: x + 10, top: y - 10, bottom: y + 10, width: 20, height: 20 }, viewport: null })
const unavailable = status => ({ status, point: null, rect: null, viewport: null })
function fixture() {
  const frames = new Map(), outputs = []
  let id = 0, now = 0
  const controller = createGuidePointerMotion({
    requestFrame: fn => { frames.set(++id, fn); return id },
    cancelFrame: id => frames.delete(id),
    now: () => now,
    onFrame: value => outputs.push(value),
  })
  return { controller, frames, outputs, update: (scene, snapshot, extra = {}) => controller.update({ scene, snapshot, active: true, playing: true, reducedMotion: false, run: 'run-1', ...extra }), tick: time => { now = time; const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn(time)) } }
}

test('first acquired target appears statically without inventing an origin', () => {
  const f = fixture(); f.update('first', visible(100, 100))
  assert.equal(f.frames.size, 0); assert.equal(f.outputs.at(-1).travelling, false); assert.equal(f.outputs.at(-1).point.x, 100)
})
test('scene change performs real eased point interpolation and ends at exact target', () => {
  const f = fixture(); f.update('first', visible(100, 100)); f.update('next', visible(500, 300))
  assert.equal(f.outputs.at(-1).point.x, 100); assert.equal(f.outputs.at(-1).destination.x, 500); assert.equal(f.outputs.at(-1).travelling, true)
  f.tick(70); const quarter = f.outputs.at(-1); assert.ok(quarter.point.x > 100 && quarter.point.x < 500); assert.ok(quarter.point.y > 100 && quarter.point.y < 300)
  f.tick(140); const half = f.outputs.at(-1); assert.equal(half.point.x, 450); assert.equal(half.point.y, 275)
  f.tick(280); const done = f.outputs.at(-1); assert.equal(done.point.x, 500); assert.equal(done.point.y, 300); assert.equal(done.travelling, false); assert.equal(f.frames.size, 0)
})
test('measurement gap on new scene retains origin but emits no old-target flash', () => {
  const f = fixture(); f.update('first', visible(100, 100)); const count = f.outputs.length
  f.update('next', unavailable('inactive')); assert.equal(f.outputs.length, count); assert.equal(f.frames.size, 0)
  f.update('next', visible(300, 200)); assert.equal(f.outputs.at(-1).point.x, 100); assert.equal(f.outputs.at(-1).destination.x, 300); assert.equal(f.outputs.at(-1).travelling, true)
})
test('unchanged React snapshot does not restart ongoing scene travel', () => {
  const f = fixture(); f.update('a', visible(0, 0)); f.update('b', visible(400, 400)); f.tick(140)
  const count = f.outputs.length; f.update('b', visible(400, 400)); assert.equal(f.outputs.length, count); assert.equal(f.frames.size, 1)
  f.tick(280); assert.equal(f.outputs.at(-1).point.x, 400); assert.equal(f.frames.size, 0)
})
test('rapid scene replacement travels from last drawn point rather than abandoned destination', () => {
  const f = fixture(); f.update('a', visible(0, 0)); f.update('b', visible(400, 0)); f.tick(140)
  assert.equal(f.outputs.at(-1).point.x, 350)
  f.update('c', unavailable('inactive')); f.update('c', visible(700, 100))
  assert.equal(f.outputs.at(-1).point.x, 350); assert.equal(f.outputs.at(-1).destination.x, 700)
  f.tick(420); assert.equal(f.outputs.at(-1).point.x, 700); assert.equal(f.frames.size, 0)
})
test('same-target scroll/layout geometry changes snap immediately and cancel travel', () => {
  const f = fixture(); f.update('a', visible(0, 0)); f.update('b', visible(400, 200)); f.tick(70)
  f.update('b', visible(400, 120)); assert.equal(f.outputs.at(-1).point.x, 400); assert.equal(f.outputs.at(-1).point.y, 120); assert.equal(f.outputs.at(-1).travelling, false); assert.equal(f.frames.size, 0)
  f.update('b', visible(430, 110)); assert.equal(f.outputs.at(-1).point.x, 430); assert.equal(f.frames.size, 0)
})
test('scroll/resize interruption cancels a frame before a React geometry update', () => {
  const f = fixture(); f.update('a', visible(0, 0)); f.update('b', visible(400, 200)); f.tick(70)
  f.controller.snap(); assert.equal(f.outputs.at(-1).point.x, 400); assert.equal(f.outputs.at(-1).travelling, false); assert.equal(f.frames.size, 0)
})
for (const status of ['missing', 'offscreen', 'obscured', 'hidden', 'background']) {
  test(`${status} hides/cancels travel, clears origin, and reacquires statically`, () => {
    const f = fixture(); f.update('a', visible(0, 0)); f.update('b', visible(400, 200)); f.tick(70)
    const count = f.outputs.length; f.update('b', unavailable(status)); assert.equal(f.outputs.length, count); assert.equal(f.frames.size, 0)
    f.update('c', visible(600, 300)); assert.equal(f.outputs.at(-1).point.x, 600); assert.equal(f.outputs.at(-1).travelling, false); assert.equal(f.frames.size, 0)
  })
}
test('Pause snaps to current real target; Resume does not replay an interrupted path', () => {
  const f = fixture(); f.update('a', visible(0, 0)); f.update('b', visible(400, 200)); f.tick(70)
  f.update('b', visible(400, 200), { playing: false }); assert.equal(f.frames.size, 0); assert.equal(f.outputs.at(-1).point.x, 400); assert.equal(f.outputs.at(-1).travelling, false)
  f.update('b', visible(400, 200)); assert.equal(f.frames.size, 0)
})
test('reduced motion prevents travel and immediately cancels an in-flight path', () => {
  const f = fixture(); f.update('a', visible(0, 0)); f.update('b', visible(400, 200), { reducedMotion: true }); assert.equal(f.frames.size, 0); assert.equal(f.outputs.at(-1).point.x, 400)
  f.update('c', visible(600, 300)); assert.equal(f.frames.size, 1); f.update('c', visible(600, 300), { reducedMotion: true }); assert.equal(f.frames.size, 0); assert.equal(f.outputs.at(-1).point.x, 600)
})
test('Close cancels frames and a reopened run never reuses old coordinates', () => {
  const f = fixture(); f.update('a', visible(0, 0)); f.update('b', visible(400, 200)); f.tick(70)
  f.update('b', unavailable('inactive'), { active: false }); assert.equal(f.frames.size, 0)
  f.update('c', visible(600, 300)); assert.equal(f.frames.size, 0); assert.equal(f.outputs.at(-1).point.x, 600)
})
test('new run key clears origin even when component remains mounted', () => {
  const f = fixture(); f.update('a', visible(0, 0)); f.update('b', visible(400, 200), { run: 'run-2' }); assert.equal(f.frames.size, 0); assert.equal(f.outputs.at(-1).point.x, 400)
})
test('Reverse animates toward previous scene and Dispose permanently stops frames', () => {
  const f = fixture(); f.update('a', visible(0, 0)); f.update('b', visible(400, 200)); f.tick(280); f.update('a', visible(0, 0)); assert.equal(f.outputs.at(-1).point.x, 400); assert.equal(f.frames.size, 1)
  f.controller.dispose(); f.controller.dispose(); assert.equal(f.frames.size, 0); const count = f.outputs.length; f.tick(600); f.update('c', visible(700, 100)); assert.equal(f.outputs.length, count)
})
