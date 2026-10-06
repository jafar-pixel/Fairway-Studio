import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
const source = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8')
const handlers = {}
const context = vm.createContext({ URL, Set, Response, self: { addEventListener: (name, callback) => { handlers[name] = callback }, location: { origin: 'https://studio.test' } } })
vm.runInContext(source, context)
function allowed(path, options = {}) {
  return context.isPublicStatic(new Request(new URL(path, 'https://studio.test'), options), 'https://studio.test')
}
test('allows only same-origin public static shell files', () => {
  for (const path of ['/pwa/icon-192.png', '/offline.html', '/_next/static/chunks/a.js', '/_next/static/css/a.css']) assert.equal(allowed(path), true, path)
})
test('excludes private HTML, APIs, Supabase, signed URLs, RSC and mutations', () => {
  for (const path of ['/', '/ideas', '/api/ideas', '/auth/callback?code=abc', '/rest/v1/projects', '/storage/v1/object/sign/a?token=private', '/_next/image?url=private', '/pwa/icon-192.png?token=x', 'https://private.supabase.co/rest/v1/projects', 'https://elsewhere.test/_next/static/a.js']) assert.equal(allowed(path), false, path)
  assert.equal(allowed('/_next/static/a.js', { headers: { authorization: 'Bearer secret' } }), false)
  assert.equal(allowed('/_next/static/a.js', { headers: { rsc: '1' } }), false)
  assert.equal(allowed('/pwa/icon-192.png', { method: 'POST' }), false)
})
test('private requests are never intercepted for caching', () => {
  for (const path of ['/api/ideas', '/rest/v1/ideas', 'https://private.supabase.co/storage/v1/object/sign/file']) {
    let intercepted = false
    handlers.fetch({ request: new Request(new URL(path, 'https://studio.test')), respondWith() { intercepted = true } })
    assert.equal(intercepted, false)
  }
})
test('navigation fallback does not cache authenticated pages', async () => {
  const cached = []
  context.fetch = async () => { throw new Error('offline') }
  context.caches = { match: async key => { cached.push(key); return new Response('offline shell') } }
  let response
  handlers.fetch({ request: { mode: 'navigate', method: 'GET', url: 'https://studio.test/projects/secret' }, respondWith(value) { response = value } })
  assert.equal(await (await response).text(), 'offline shell')
  assert.deepEqual(cached, ['/offline.html'])
})
test('updates wait for a user message, never activate during install', () => {
  assert.equal(handlers.install.toString().includes('skipWaiting'), false)
  let activated = false
  context.self.skipWaiting = () => { activated = true }
  handlers.message({ data: { type: 'OTHER' } }); assert.equal(activated, false)
  handlers.message({ data: { type: 'ACTIVATE_UPDATE' } }); assert.equal(activated, true)
})
