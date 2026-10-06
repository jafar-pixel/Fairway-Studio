import { requestOrigin } from './request-origin-test-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';
import sharp from 'sharp';
const require = createRequire(import.meta.url);
const sandbox = { exports: {}, Buffer, Response, Request, URL, Uint8Array, TextDecoder, FormData, require: name => name === './request-origin' ? requestOrigin : require(name) };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../lib/studio/profile-photo-server.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, sandbox);
const api = sandbox.exports;
const owner = '11111111-1111-4111-8111-111111111111', teammate = '22222222-2222-4222-8222-222222222222';
const oldPath = `${owner}/33333333-3333-4333-8333-333333333333.jpg`;
const url = 'https://fairway.test/api/studio/profile-photo';
const fixture = await sharp({ create: { width: 700, height: 500, channels: 3, background: '#8a5c4a' } }).jpeg().toBuffer();
function row(path = oldPath, revision = 1) { return { user_id: owner, path, revision, updated_at: new Date().toISOString() }; }
function backend(options = {}) {
  const state = { row: options.row === undefined ? null : options.row, objects: new Map([[oldPath, new Blob([fixture])]]), uploads: [], removed: [], reads: 0, connections: 0 };
  const client = { auth: { getUser: async () => ({ data: { user: options.anonymous ? null : { id: options.userId ?? owner } }, error: null }) },
    from(table) {
      assert.equal(table, 'studio_profile_photos'); let action = 'read', update, filters = [];
      const q = { select() { return q; }, eq(k,v) { filters.push([k,v]); return q; }, insert(value) { action = 'insert'; update = value; return q; }, update(value) { action = 'update'; update = value; return q; },
        async maybeSingle() {
          if (options.schemaMissing) return { data: null, error: { code: 'PGRST205' } };
          if (action === 'read') {
            state.reads++;
            if (options.readHook) await options.readHook(state);
            return { data: state.row && filters.every(([k,v]) => state.row[k] === v) ? { ...state.row } : null, error: null };
          }
          if (options.writeHook) await options.writeHook(state);
          if (options.writeError) return { data: null, error: { code: 'XX000' } };
          if (action === 'insert' && state.row) return { data: null, error: { code: '23505' } };
          if (action === 'update' && (!state.row || !filters.every(([k,v]) => state.row[k] === v))) return { data: null, error: null };
          state.row = row(update.path, (state.row?.revision ?? 0) + 1);
          if (options.commitThenThrow) throw Error('connection interrupted after commit');
          return { data: { ...state.row }, error: null };
        } }; return q;
    }, storage: { from(bucket) { assert.equal(bucket, 'profile-photos'); return {
      async upload(path, data, settings) { state.uploads.push({ path, data, settings }); if (options.bucketMissing) return { error: { message: 'Bucket not found' } }; state.objects.set(path, new Blob([data])); return { error: null }; },
      async download(path) { if (options.downloadHook) await options.downloadHook(state); return { data: options.download ?? state.objects.get(path), error: null }; },
      async remove(paths) { state.removed.push(...paths); if (options.cleanupFails) return { error: { message: 'down' } }; for (const p of paths) state.objects.delete(p); return { error: null }; },
    }; } } };
  return { state, call: (request = new Request(url)) => api.handleProfilePhotoRequest(request, async () => { state.connections++; return client; }) };
}
function upload(expected = 0, bytes = fixture, extra = {}) {
  const form = new FormData(); form.set('photo', new Blob([bytes], { type: extra.mime ?? 'image/jpeg' }), 'avatar.jpg'); form.set('expectedRevision', String(expected));
  if (extra.field) form.set(extra.field, 'spoof');
  return new Request(extra.url ?? url, { method: 'POST', body: form, headers: { origin: 'https://fairway.test', 'X-Fairway-Profile-User': owner, ...extra.headers } });
}
function remove(expectedRevision = 1, extra = {}) { return new Request(url, { method: 'DELETE', headers: { origin: 'https://fairway.test', 'content-type': 'application/json', 'X-Fairway-Profile-User': owner }, body: JSON.stringify({ expectedRevision, ...extra }) }); }

test('normalizes generated JPEG, PNG and WebP to a fully decoded metadata-free square JPEG', async () => {
  for (const format of ['jpeg','png','webp']) {
    const input = await sharp(fixture).withMetadata({ orientation: 6 }).toFormat(format).toBuffer();
    const result = await api.normalizeProfilePhoto(input); const metadata = await sharp(result).metadata();
    assert.equal(metadata.format, 'jpeg'); assert.equal(metadata.width, 512); assert.equal(metadata.height, 512);
    assert.equal(metadata.exif, undefined); assert.equal(metadata.icc, undefined); assert.equal(metadata.orientation, undefined);
  }
});
test('rejects SVG pretending to be JPEG, GIF, broken JPEG, truncated pixels, oversized inputs and pixel bombs', async () => {
  const bomb = await sharp({ create: { width: 6400, height: 6400, channels: 3, background: '#fff' } }).png().toBuffer();
  for (const input of [Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), Buffer.from('GIF89a'), Buffer.from([255,216,255,0]), fixture.subarray(0, Math.floor(fixture.length * .8)), Buffer.alloc(api.MAX_PROFILE_PHOTO_BYTES + 1), bomb]) {
    await assert.rejects(api.normalizeProfilePhoto(input), e => [413,415].includes(e.status));
  }
});
test('validates revision and exact owned immutable JPEG paths', () => {
  for (const value of [0,1,'0','9999']) assert.equal(api.expectedPhotoRevision(value), Number(value));
  for (const value of [-1,NaN,'01','1x',null,undefined,'',true,2147483647]) assert.throws(() => api.expectedPhotoRevision(value));
  assert.equal(api.validProfilePhotoPath(oldPath, owner), true);
  for (const path of [oldPath + '/extra',oldPath.replace(owner,teammate),oldPath.replace('.jpg','.svg'),oldPath.replace('/','/../')]) assert.equal(api.validProfilePhotoPath(path,owner), false);
});
test('bounds streamed bodies even when Content-Length is missing or misleading', async () => {
  let cancelled = false;
  const stream = new ReadableStream({ start(c) { c.enqueue(new Uint8Array(8)); c.enqueue(new Uint8Array(8)); }, cancel() { cancelled = true; } });
  await assert.rejects(api.readBoundedPhotoBody(new Request(url, { method: 'POST', body: stream, duplex: 'half', headers: { 'content-length': '1' } }), 10), e => e.status === 413);
  assert.equal(cancelled,true);
  await assert.rejects(api.readBoundedPhotoBody(new Request(url, { method: 'POST', body:'small', headers:{'content-length':'99999'} }),10), e=>e.status===413);
});
test('authentication, origin and fetch metadata block before upload', async () => {
  for (const [options, request, status] of [[{anonymous:true}, upload(),401],[{},upload(0,fixture,{headers:{origin:'https://evil.test'}}),403],[{},upload(0,fixture,{headers:{'sec-fetch-site':'same-site'}}),403],[{},new Request(url,{headers:{'sec-fetch-site':'cross-site'}}),403]]) {
    const b = backend(options); assert.equal((await b.call(request)).status,status); assert.equal(b.state.uploads.length,0);
  }
});
test('mutation account-intent header rejects missing, mismatched and switched sessions before any mutation', async () => {
  for (const method of ['POST', 'DELETE']) {
    for (const scenario of ['missing', 'mismatch', 'switched']) {
      const request = method === 'POST' ? upload(1) : remove(1);
      if (scenario === 'missing') request.headers.delete('X-Fairway-Profile-User');
      if (scenario === 'mismatch') request.headers.set('X-Fairway-Profile-User', teammate);
      const b = backend({ row: row(), ...(scenario === 'switched' ? { userId: teammate } : {}) });
      const response = await b.call(request);
      assert.equal(response.status, 409, `${method}: ${scenario}`);
      assert.equal((await response.json()).code, 'SESSION_CHANGED');
      assert.equal(b.state.reads, 0, 'session check happens before metadata/body work');
      assert.equal(b.state.uploads.length, 0); assert.equal(b.state.removed.length, 0);
      assert.equal(b.state.row.path, oldPath); assert.equal(b.state.row.revision, 1);
    }
  }
});
test('GET returns own metadata and tombstone revision; invisible IDs do not expose metadata',async()=>{
  const b=backend({row:row(null,9)}); assert.deepEqual(await (await b.call()).json(),{photo:null,revision:9});
  assert.deepEqual(await (await b.call(new Request(`${url}?userId=${teammate}`))).json(),{photo:null,revision:0});
  assert.equal((await b.call(new Request(`${url}?userId=bad`))).status,400);
});
test('first upload and replacement are self-owned, private, normalized and non-upserting',async()=>{
  const b=backend(); const response=await b.call(upload()); assert.equal(response.status,200);const result=await response.json();
  assert.equal(result.revision,1);assert.equal(result.photo.user_id,owner);assert.match(result.photo.path,new RegExp(`^${owner}/[0-9a-f-]+\\.jpg$`));
  assert.equal(b.state.uploads[0].settings.upsert,false);assert.equal(b.state.uploads[0].settings.contentType,'image/jpeg');
  const firstPath=result.photo.path;assert.equal((await b.call(upload(1))).status,200);assert.equal(b.state.row.revision,2);assert.deepEqual(b.state.removed,[firstPath]);
});
test('uploads cannot set another owner or smuggle extra multipart fields',async()=>{
  for(const req of [upload(0,fixture,{url:`${url}?userId=${teammate}`}),upload(0,fixture,{field:'userId'})]){const b=backend();assert.equal((await b.call(req)).status,400);assert.equal(b.state.uploads.length,0);}
});
test('remove persists tombstone and stale saves cannot reappear (ABA)',async()=>{
  const b=backend({row:row()});const response=await b.call(remove());assert.equal(response.status,200);assert.deepEqual(await response.json(),{photo:null,revision:2});
  assert.equal(b.state.row.path,null);assert.equal(b.state.row.revision,2);assert.deepEqual(b.state.removed,[oldPath]);
  assert.equal((await b.call(upload(0))).status,409);assert.equal((await b.call(upload(1))).status,409);
  assert.equal((await b.call(upload(2))).status,200);assert.equal(b.state.row.revision,3);
  assert.equal((await b.call(remove(3,{userId:teammate}))).status,400);
});
test('CAS race cleans only the losing new upload and preserves the winner',async()=>{
  const b=backend({row:row(),writeHook:state=>{state.row=row(oldPath,2)}});assert.equal((await b.call(upload(1))).status,409);
  assert.equal(b.state.row.path,oldPath);assert.equal(b.state.objects.has(oldPath),true);assert.deepEqual(b.state.removed,[b.state.uploads[0].path]);
});
test('database failure keeps the old photo, and an ambiguous committed save is recovered',async()=>{
  const fail=backend({row:row(),writeError:true});assert.equal((await fail.call(upload(1))).status,503);assert.equal(fail.state.objects.has(oldPath),true);assert.deepEqual(fail.state.removed,[fail.state.uploads[0].path]);
  const committed=backend({row:row(),commitThenThrow:true});assert.equal((await committed.call(upload(1))).status,200);assert.equal(committed.state.objects.has(committed.state.row.path),true);assert.deepEqual(committed.state.removed,[oldPath]);
});
test('missing schema/bucket are actionable and cleanup failures do not undo successful saves',async()=>{
  for(const options of [{schemaMissing:true},{bucketMissing:true}]){const response=await backend(options).call(upload());assert.equal(response.status,503);assert.equal((await response.json()).code,'SCHEMA_REQUIRED');}
  const b=backend({row:row(),cleanupFails:true});const r=await b.call(upload(1));assert.equal(r.status,200);assert.match((await r.json()).warning,/saved/);
});
test('private image is served as no-store bytes without a signed URL, and direct-storage SVG is rejected',async()=>{
  const b=backend({row:row()});const response=await b.call(new Request(`${url}?image=1`));assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'image/jpeg');assert.match(response.headers.get('cache-control'),/no-store/);assert.equal(response.headers.get('location'),null);assert.equal(response.headers.get('x-content-type-options'),'nosniff');assert.equal((await sharp(Buffer.from(await response.arrayBuffer())).metadata()).width,512);
  const bad=backend({row:row(),download:new Blob(['<svg onload="alert(1)"/>'],{type:'image/jpeg'})});assert.equal((await bad.call(new Request(`${url}?image=1`))).status,415);
});
test('image rechecks visibility after download and never serves a revoked/replaced photo',async()=>{
  const b=backend({row:row(),downloadHook:state=>{state.row=null}});assert.equal((await b.call(new Request(`${url}?image=1`))).status,404);
  const c=backend({row:row(),downloadHook:state=>{state.row=row(null,2)}});assert.equal((await c.call(new Request(`${url}?image=1`))).status,404);
});


test('photo proxy saves and removals accept only the exact HTTPS production/preview targets', async () => {
  for (const origin of ['https://sports-brand-collaboration-setup.vercel.app', 'https://sports-brand-collaboration-setup.v0.build']) {
    for (const header of ['host', 'x-forwarded-host']) {
      const b = backend();
      const headers = { origin, [header]: new URL(origin).host, 'x-forwarded-proto': 'https', 'sec-fetch-site': 'same-origin' };
      const add = upload(0, fixture, { url: 'http://127.0.0.1:3000/api/studio/profile-photo', headers });
      assert.equal((await b.call(add)).status, 200);
      assert.equal(b.state.uploads.length, 1);
      const del = new Request('http://127.0.0.1:3000/api/studio/profile-photo', { method: 'DELETE', headers: { ...headers, 'content-type': 'application/json', 'X-Fairway-Profile-User': owner }, body: JSON.stringify({ expectedRevision: 1 }) });
      assert.equal((await b.call(del)).status, 200);
      assert.equal(b.state.row.path, null); assert.equal(b.state.row.revision, 2);
    }
  }
});
test('photo origin and Fetch Metadata fail closed before client creation for POST and DELETE', async () => {
  const publicOrigin = 'https://sports-brand-collaboration-setup.v0.build';
  for (const method of ['POST', 'DELETE']) for (const change of [
    { origin: undefined }, { origin: 'null' }, { origin: '' }, { origin: 'https://evil.test' },
    { origin: publicOrigin + ', ' + publicOrigin }, { origin: publicOrigin + '/' },
    { origin: 'https://evil.test', 'x-forwarded-host': 'evil.test' },
    { origin: 'https://evil.test', host: 'evil.test' },
    { origin: publicOrigin, 'x-forwarded-host': new URL(publicOrigin).host + ', evil.test' },
    { origin: publicOrigin, 'x-forwarded-proto': 'https, http' },
    { origin: publicOrigin.replace('https:', 'http:') },
    { 'sec-fetch-site': 'cross-site' }, { 'sec-fetch-site': 'same-site' },
  ]) {
    const headers = { origin: publicOrigin, 'x-forwarded-host': new URL(publicOrigin).host, 'x-forwarded-proto': 'https', 'sec-fetch-site': 'same-origin', 'X-Fairway-Profile-User': owner, ...change };
    if (headers.origin === undefined) delete headers.origin;
    const req = new Request('http://127.0.0.1:3000/api/studio/profile-photo', { method, headers, body: 'body must not be consumed' });
    const b = backend({ row: row() });
    assert.equal((await b.call(req)).status, 403, `${method}: ${JSON.stringify(change)}`);
    assert.equal(req.bodyUsed, false); assert.equal(b.state.connections, 0);
    assert.equal(b.state.uploads.length, 0); assert.equal(b.state.removed.length, 0);
    assert.equal(b.state.row.path, oldPath); assert.equal(b.state.row.revision, 1);
  }
});
