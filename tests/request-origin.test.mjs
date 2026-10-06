import test from 'node:test';
import assert from 'node:assert/strict';
import { requestOrigin as api } from './request-origin-test-loader.mjs';
const publicOrigins = ['https://sports-brand-collaboration-setup.vercel.app', 'https://sports-brand-collaboration-setup.v0.build'];
const internal = 'http://127.0.0.1:3000/api/studio/workflow';
const request = (url = internal, headers = {}) => new Request(url, { method: 'POST', headers });

test('direct same-origin uses the exact scheme, host and port from the framework URL', () => {
  for (const url of ['https://fairway.test/api', 'http://localhost:3000/api', 'http://[::1]:3000/api', ...publicOrigins]) {
    const origin = new URL(url).origin;
    assert.equal(api.isTrustedOrigin(request(url), origin), true);
    for (const foreign of ['https://evil.test', origin + '.evil.test', origin + '/', origin + ':8443', 'null', '', null]) {
      assert.equal(api.isTrustedOrigin(request(url), foreign), false, `${url}: ${foreign}`);
    }
  }
});

test('known HTTPS production and preview proxy targets work through Host or forwarded host', () => {
  for (const origin of publicOrigins) for (const header of ['host', 'x-forwarded-host']) {
    for (const host of [new URL(origin).host, new URL(origin).host.toUpperCase(), new URL(origin).host + ':443']) {
      const req = request(internal, { [header]: host, 'x-forwarded-proto': 'https', origin });
      assert.equal(api.isSameOriginWrite(req), true);
      assert.deepEqual([...api.trustedOrigins(req)].sort(), ['http://127.0.0.1:3000', origin].sort());
      assert.equal(api.isTrustedOrigin(req, origin.replace('https:', 'http:')), false, 'internal HTTP never becomes public HTTP');
    }
    assert.equal(api.isTrustedOrigin(request('https://internal.test/api', { [header]: new URL(origin).host }), origin), true);
  }
});

test('untrusted Host, forwarded host and protocol cannot introduce arbitrary origins', () => {
  for (const origin of ['https://evil.test', 'https://unrelated.vercel.app', 'https://unrelated.v0.build', 'https://sports-brand-collaboration-setup.vercel.app.evil.test']) {
    for (const header of ['host', 'x-forwarded-host']) {
      const req = request(internal, { [header]: new URL(origin).host, 'x-forwarded-proto': 'https', origin });
      assert.equal(api.isSameOriginWrite(req), false, `${header}: ${origin}`);
      assert.deepEqual([...api.trustedOrigins(req)], ['http://127.0.0.1:3000']);
    }
  }
});

test('forwarded HTTPS never creates a downgraded public origin or upgrades an internal origin', () => {
  const host = new URL(publicOrigins[0]).host;
  const req = request(internal, { host: 'internal.test:8080', 'x-forwarded-host': host, 'x-forwarded-proto': 'https' });
  for (const origin of [`http://${host}`, 'https://127.0.0.1:3000', 'https://internal.test:8080', 'http://internal.test:8080']) assert.equal(api.isTrustedOrigin(req, origin), false);
  for (const protocol of ['http', 'ftp', 'https,http', 'https, https', 'https https', 'https:', '', 'null']) {
    assert.equal(api.isTrustedOrigin(request(internal, { 'x-forwarded-host': host, 'x-forwarded-proto': protocol }), publicOrigins[0]), false, protocol);
  }
  assert.equal(api.isTrustedOrigin(request(internal, { 'x-forwarded-host': host }), publicOrigins[0]), false, 'no guessed HTTPS when protocol is absent');
});

test('ambiguous or malformed forwarded host values never supply a public fallback', () => {
  const host = new URL(publicOrigins[0]).host;
  for (const malformed of [`${host}, evil.test`, `evil.test, ${host}`, `${host}, ${host}`, `${host} evil.test`, `${host}/`, `${host}?x`, `${host}#x`, `${host}@evil.test`, `evil@${host}`, `${host}:65536`, `${host}:443:443`, `${host}.`, `${host}\\evil`, `%73${host.slice(1)}`, '[::1]', '', 'null']) {
    for (const header of ['host', 'x-forwarded-host']) assert.equal(api.isTrustedOrigin(request(internal, { [header]: malformed, 'x-forwarded-proto': 'https' }), publicOrigins[0]), false, malformed);
  }
});

test('malformed, opaque, credentialed, path-bearing and multiple Origin values are rejected', () => {
  const origin = publicOrigins[0];
  for (const value of ['', 'null', origin + '/', origin + '/api', origin + '?x', origin + '#x', origin + ' ' + publicOrigins[1], origin + ', ' + origin, 'https://user@' + new URL(origin).host, 'https://*.vercel.app', origin.toUpperCase(), origin + ':443']) {
    assert.equal(api.isSameOriginWrite(request(internal, { host: new URL(origin).host, 'x-forwarded-proto': 'https', origin: value })), false, value);
  }
  const headers = new Headers({ origin }); headers.append('origin', origin);
  assert.equal(api.isSameOriginWrite(request(origin, headers)), false);
});

test('missing-Origin semantics remain unchanged; literal null is never missing', () => {
  for (const site of ['', 'same-origin', 'same-site', 'cross-site', 'none']) {
    assert.equal(api.isSameOriginWrite(request(internal, site ? { 'sec-fetch-site': site } : {})), true);
    assert.equal(api.isTrustedOrigin(request(internal), null), false, 'photo mutations must still supply Origin');
  }
  assert.equal(api.isSameOriginWrite(request(internal, { origin: 'null' })), false);
});
