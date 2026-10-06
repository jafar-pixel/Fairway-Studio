import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { loadComponent } from './guide-load-component.mjs'

const toolbar = loadComponent(new URL('../components/studio/guide/guide-toolbar.tsx', import.meta.url).pathname)
const pointer = loadComponent(new URL('../components/studio/guide/guide-pointer.tsx', import.meta.url).pathname)
const noop = () => {}
const props = { title: 'Choose a project', caption: 'Explore your existing projects.', playing: true, step: 2, total: 5, onTogglePlay: noop, onBack: noop, onNext: noop, onRestart: noop, onClose: noop }
const render = changes => renderToStaticMarkup(createElement(toolbar.GuideToolbar, { ...props, ...changes }))

test('all five controls have accessible names and cannot submit surrounding forms', () => {
  const html = render(); assert.equal((html.match(/<button/g) ?? []).length, 5)
  for (const label of ['Pause guide', 'Previous guide step', 'Next guide step', 'Restart guide', 'Close guide']) assert.ok(html.includes(`aria-label="${label}"`))
  assert.equal((html.match(/type="button"/g) ?? []).length, 5)
  assert.ok(html.includes('role="toolbar"')); assert.ok(html.includes('aria-label="Guide controls"'))
})
test('busy disables navigation/play/restart while leaving Close available', () => {
  const html = render({ busy: true }); assert.equal((html.match(/disabled=""/g) ?? []).length, 4)
  assert.ok(html.includes('data-guide-player=""')); assert.ok(html.includes('aria-busy="true"'))
  assert.doesNotMatch(html, /disabled="" aria-label="Close guide"/)
})
test('paused toolbar exposes Play and caption is announced politely', () => {
  const html = render({ playing: false }); assert.ok(html.includes('aria-label="Play guide"')); assert.ok(html.includes('aria-live="polite"')); assert.ok(html.includes('Choose a project'))
})
test('first and last steps disable unavailable navigation', () => {
  assert.match(render({ step: 1 }), /disabled="" aria-label="Previous guide step"/)
  assert.match(render({ step: 5 }), /disabled="" aria-label="Next guide step"/)
  assert.match(render({ canNext: false, step: 2 }), /disabled="" aria-label="Next guide step"/)
})
test('toolbar escapes supplied labels and only renders callbacks on user interaction', () => {
  const fail = () => assert.fail('Rendering must not invoke a callback')
  const html = render({ title: '<script>bad</script>', onTogglePlay: fail, onBack: fail, onNext: fail, onRestart: fail, onClose: fail }); assert.ok(html.includes('&lt;script&gt;')); assert.ok(!html.includes('<script>'))
})
test('toolbar has no modal, overlay, dialog, or focus trap', () => {
  const html = render(); assert.ok(!html.includes('aria-modal')); assert.ok(!html.includes('role="dialog"')); assert.ok(!html.includes('backdrop')); assert.ok(html.includes('data-position="bottom-right"'))
})
test('pointer and portal are SSR-safe and never render a stale unmeasured location', () => {
  assert.equal(renderToStaticMarkup(createElement(pointer.GuidePointer, { target: '#target' })), '')
  assert.equal(renderToStaticMarkup(createElement(pointer.GuidePortal, {}, 'controls')), '')
})
test('pointer subtree cannot intercept clicks and reduced-motion override is static', () => {
  const css = fs.readFileSync(new URL('../components/studio/guide/guide.css', import.meta.url), 'utf8')
  assert.match(css, /\.fw-guide-pointer \* \{ pointer-events: none !important/)
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/)
  assert.match(css, /animation: none !important/)
  assert.ok(!css.includes('backdrop-filter')); assert.ok(!css.includes('inset: 0'))
})
test('production primitives never dispatch pointer/click events or mutate controls', () => {
  for (const file of ['guide-pointer.tsx', 'guide-target.ts', 'use-guide-target.ts', 'guide-motion.ts', 'use-guide-motion.ts']) {
    const source = fs.readFileSync(new URL(`../components/studio/guide/${file}`, import.meta.url), 'utf8')
    assert.doesNotMatch(source, /\.click\s*\(|\.dispatchEvent\s*\(|\.focus\s*\(|\.scrollIntoView\s*\(|\.submit\s*\(/)
    assert.doesNotMatch(source, /fetch\s*\(|localStorage|sessionStorage/)
  }
})
test('scene changes preserve pointer identity and animation is on a wrapper, not the SVG', () => {
  const source = fs.readFileSync(new URL('../components/studio/guide/guide-pointer.tsx', import.meta.url), 'utf8')
  const css = fs.readFileSync(new URL('../components/studio/guide/guide.css', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /key=\{stepKey\}/)
  assert.match(source, /ref=\{wrapper\} className="fw-guide-pointer__travel"/)
  assert.match(css, /fw-guide-pointer__bounce \{ animation: fw-guide-bounce/)
  assert.doesNotMatch(css, /fw-guide-pointer__arrow \{ animation:/)
  assert.match(css, /fw-guide-pointer__travel \{ transform: none !important/)
})
