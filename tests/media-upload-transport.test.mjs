import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModule, media, userId, otherUserId, staged, registered, deferred, tick, plain } from './media-test-harness.mjs';

const endpoint = 'https://xljhxmyigtxhjtxxzuwk.storage.supabase.co/storage/v1/upload/resumable';
const freshSession = (extra = {}) => ({ user: { id: userId }, access_token: 'test-session-initial', expires_at: Math.floor(Date.now() / 1000) + 3600, ...extra });
const statusError = status => Object.assign(new Error('secret-provider-message https://private-resume.test token=do-not-show'), { originalResponse: { getStatus: () => status } });

function harness(options = {}) {
  const instances = [], authCalls = [], storageCalls = [], clientCalls = [], fetchCalls = [];
  const navigator = { onLine: true };
  let session = options.session === undefined ? freshSession() : options.session;
  const supabase = {
    auth: {
      async getSession() { authCalls.push('get'); return { data: { session }, error: options.sessionError ?? null }; },
      async refreshSession() {
        authCalls.push('refresh');
        session = options.refreshSession ?? freshSession({ access_token: 'test-session-refreshed' });
        return { data: { session }, error: options.refreshError ?? null };
      },
    },
    storage: { from(bucket) { return { async list(folder, params) {
      storageCalls.push({ bucket, folder, params });
      if (options.list) return options.list(folder, params);
      return options.listResult ?? { data: [], error: null };
    } }; } },
  };
  class MockUpload {
    constructor(file, config) { this.file = file; this.options = config; this.starts = 0; this.resumed = []; this.aborts = []; instances.push(this); }
    async findPreviousUploads() {
      if (options.findPrevious) return options.findPrevious();
      return options.previous ?? [];
    }
    resumeFromPreviousUpload(previous) { this.resumed.push(previous); }
    start() { this.starts++; }
    async abort(terminate) { this.aborts.push(terminate); }
  }
  const transport = loadModule('lib/studio/media-upload-transport.ts', {
    'tus-js-client': { Upload: MockUpload },
    '@/lib/supabase/client': { createClient: () => { clientCalls.push(true); return supabase; } },
    '@/lib/studio/media': media,
  }, {
    navigator,
    fetch: async (url, init) => {
      fetchCalls.push({ url, init });
      if (!options.fetch) throw new Error('Unexpected fetch; tests must not use real services');
      return options.fetch(url, init);
    },
  });
  return { ...transport, instances, authCalls, storageCalls, clientCalls, fetchCalls, navigator, setSession: value => { session = value; } };
}

async function begin(h, item = staged(), abort = new AbortController(), progress = () => {}) {
  const promise = h.uploadMediaOriginal(item, userId, abort.signal, progress);
  // Attach immediately so intentional later rejections cannot become unhandled.
  promise.catch(() => {});
  await tick();
  return { promise, upload: h.instances[0], abort, item };
}
const request = (url = `${endpoint}/upload-resource`) => {
  const headers = [];
  return { headers, getURL: () => url, getMethod: () => 'PATCH', setHeader: (key, value) => headers.push([key, value]) };
};

test('TUS uses approved direct storage host, exact 6 MiB chunks and immutable non-upsert metadata', async () => {
  const h = harness(), item = staged();
  const { promise, upload } = await begin(h, item);
  const opts = upload.options;
  assert.equal(h.MEDIA_TUS_ENDPOINT, endpoint);
  assert.equal(opts.endpoint, endpoint);
  assert.equal(h.MEDIA_TUS_CHUNK_SIZE, 6 * 1024 * 1024);
  assert.equal(opts.chunkSize, 6 * 1024 * 1024);
  assert.equal(opts.uploadDataDuringCreation, true);
  assert.equal(opts.removeFingerprintOnSuccess, true);
  assert.equal(opts.metadata.bucketName, 'workspace-media');
  assert.equal(opts.metadata.objectName, item.path);
  assert.equal(opts.metadata.contentType, item.type);
  assert.equal(opts.metadata.cacheControl, "0", "private originals must not outlive signed URL expiry in cache");
  assert.equal(Object.keys(opts.headers).some(key => key.toLowerCase() === 'x-upsert'), false);
  assert.equal(opts.headers.authorization, undefined);
  assert.equal(upload.starts, 1);
  upload.options.onSuccess();
  await promise;
});

test('fingerprints scope resume state to account, canonical path, original file and MIME', () => {
  const h = harness(), item = staged();
  const original = h.mediaUploadFingerprint(item, userId);
  assert.equal(h.mediaUploadFingerprint(item, userId), original);
  for (const changed of [
    { ...item, path: item.path.replace('upload-1', 'upload-2') },
    { ...item, file: { ...item.file, size: item.file.size + 1 } },
    { ...item, file: { ...item.file, name: 'other.png' } },
    { ...item, file: { ...item.file, lastModified: 222 } },
    { ...item, type: 'image/jpeg' },
  ]) assert.notEqual(h.mediaUploadFingerprint(changed, userId), original);
  assert.notEqual(h.mediaUploadFingerprint(item, otherUserId), original);
  const parsed = JSON.parse(original);
  assert.ok(parsed.includes('workspace-media'));
  assert.ok(parsed.includes(userId));
  assert.ok(parsed.includes(item.path));
});

test('every TUS request reads the current JWT and refreshes a near-expiry session', async () => {
  const h = harness();
  const { promise, upload } = await begin(h);
  h.setSession(freshSession({ access_token: 'test-session-current' }));
  const first = request();
  await upload.options.onBeforeRequest(first);
  assert.deepEqual(first.headers, [['authorization', 'Bearer test-session-current']]);
  h.setSession(freshSession({ access_token: 'test-session-expiring', expires_at: Math.floor(Date.now() / 1000) + 20 }));
  const second = request();
  await upload.options.onBeforeRequest(second);
  assert.deepEqual(second.headers, [['authorization', 'Bearer test-session-refreshed']]);
  assert.deepEqual(h.authCalls, ['get', 'get', 'get', 'refresh']);
  upload.options.onSuccess();
  await promise;
});

test('changed account cannot create or continue an upload with another account JWT', async () => {
  const changed = harness({ session: freshSession({ user: { id: otherUserId } }) });
  await assert.rejects(changed.uploadMediaOriginal(staged(), userId, new AbortController().signal, () => {}), /account changed/);
  assert.equal(changed.instances.length, 0);
  const h = harness();
  const { promise, upload } = await begin(h);
  h.setSession(freshSession({ user: { id: otherUserId }, access_token: 'wrong-account' }));
  const req = request();
  await assert.rejects(upload.options.onBeforeRequest(req), /account changed/);
  await assert.rejects(promise, /account changed/);
  assert.deepEqual(req.headers, []);
});

test('missing session, failed refresh, offline state and pre-aborted calls fail before TUS construction', async () => {
  for (const options of [{ session: null }, { sessionError: new Error('bad session') }, { session: freshSession({ expires_at: 1 }), refreshError: new Error('bad refresh') }]) {
    const h = harness(options);
    await assert.rejects(h.uploadMediaOriginal(staged(), userId, new AbortController().signal, () => {}), /Sign in|session expired/);
    assert.equal(h.instances.length, 0);
  }
  const offline = harness();
  offline.navigator.onLine = false;
  await assert.rejects(offline.uploadMediaOriginal(staged(), userId, new AbortController().signal, () => {}), /offline/);
  assert.equal(offline.clientCalls.length, 0);
  const aborted = harness(), abort = new AbortController();
  abort.abort();
  await assert.rejects(aborted.uploadMediaOriginal(staged(), userId, abort.signal, () => {}), { name: 'AbortError' });
  assert.equal(aborted.clientCalls.length, 0);
});

test('resume uses only the exact original path, size and bucket', async () => {
  const item = staged();
  const match = { uploadUrl: `${endpoint}/matching-resource`, size: item.file.size, metadata: { bucketName: media.MEDIA_BUCKET, objectName: item.path, contentType: item.type } };
  const others = [
    { ...match, metadata: { ...match.metadata, bucketName: 'other-bucket' } },
    { ...match, metadata: { ...match.metadata, objectName: `${item.path}.other` } },
    { ...match, size: item.file.size + 1 },
  ];
  const h = harness({ previous: [...others, match] });
  const { promise, upload } = await begin(h, item);
  assert.deepEqual(upload.resumed, [match]);
  upload.options.onSuccess();
  await promise;
});

test('resume rejects unapproved URLs before attaching authorization to TUS requests', async () => {
  const item = staged();
  const unsafe = [
    'https://unapproved.example.test/upload-resource',
    endpoint.replace('https:', 'http:') + '/resource',
    endpoint.replace('.storage.supabase.co', '.storage.supabase.co.evil.test') + '/resource',
    endpoint.replace('https://', 'https://name:secret@') + '/resource',
    'https://xljhxmyigtxhjtxxzuwk.storage.supabase.co/other-resource',
  ];
  for (const uploadUrl of unsafe) {
    const h = harness({ previous: [{ uploadUrl, size: item.file.size, metadata: { bucketName: media.MEDIA_BUCKET, objectName: item.path, contentType: item.type } }] });
    const { promise, upload } = await begin(h, item);
    upload.options.onSuccess();
    await promise;
    assert.deepEqual(upload.resumed, [], uploadUrl);
  }
});

test('every TUS request rejects foreign, credentialed, query-bearing or unrelated paths before reading a JWT', async () => {
  for (const url of ['https://foreign.example.test/resource', `${endpoint}?redirect=elsewhere`, `${endpoint}/resource#fragment`, endpoint.replace('https://', 'https://name:secret@'), endpoint.replace('/upload/resumable', '/upload/other')]) {
    const h = harness();
    const { promise, upload } = await begin(h);
    const readsBefore = h.authCalls.length;
    const req = request(url);
    await assert.rejects(upload.options.onBeforeRequest(req), /approved workspace storage/);
    await assert.rejects(promise, /approved workspace storage/);
    assert.deepEqual(req.headers, []);
    assert.equal(h.authCalls.length, readsBefore);
  }
});

test('parallel resume resources are not used for the single immutable upload', async () => {
  const item = staged();
  const candidate = { uploadUrl: `${endpoint}/resource`, parallelUploadUrls: [`${endpoint}/part-1`], size: item.file.size, metadata: { bucketName: media.MEDIA_BUCKET, objectName: item.path, contentType: item.type } };
  const h = harness({ previous: [candidate] });
  const { promise, upload } = await begin(h, item);
  assert.deepEqual(upload.resumed, []);
  upload.options.onSuccess();
  await promise;
});

test('blocked browser resume storage does not prevent a fresh upload', async () => {
  const h = harness({ findPrevious: async () => { throw new Error('localStorage is blocked'); } });
  const { promise, upload } = await begin(h);
  assert.equal(upload.starts, 1);
  assert.deepEqual(upload.resumed, []);
  upload.options.onSuccess();
  await promise;
});

test('TUS retries transient failures, never permanent errors, cancellation or offline requests', async () => {
  const h = harness();
  const { promise, upload, abort } = await begin(h);
  for (const status of [0, 408, 423, 429, 500, 503]) assert.equal(upload.options.onShouldRetry(statusError(status)), true, String(status));
  for (const status of [400, 401, 403, 404, 409, 413, 422]) assert.equal(upload.options.onShouldRetry(statusError(status)), false, String(status));
  h.navigator.onLine = false;
  assert.equal(upload.options.onShouldRetry(statusError(503)), false);
  h.navigator.onLine = true;
  abort.abort();
  assert.equal(upload.options.onShouldRetry(statusError(503)), false);
  await assert.rejects(promise, { name: 'AbortError' });
});

test('cancel preserves resumable resource and fingerprint; late progress and success are ignored', async () => {
  const h = harness(), progress = [];
  const { promise, upload, abort } = await begin(h, staged(), new AbortController(), value => progress.push(value));
  upload.options.onProgress(25, 100);
  abort.abort();
  await assert.rejects(promise, { name: 'AbortError' });
  assert.deepEqual(upload.aborts, [false]);
  upload.options.onProgress(100, 100);
  upload.options.onSuccess();
  assert.deepEqual(progress, [25]);
});

test('abort during asynchronous resume lookup never starts the upload', async () => {
  const lookup = deferred();
  const h = harness({ findPrevious: () => lookup.promise });
  const { promise, upload, abort } = await begin(h);
  abort.abort();
  lookup.resolve([]);
  await assert.rejects(promise, { name: 'AbortError' });
  await tick();
  assert.equal(upload.starts, 0);
  assert.ok(upload.aborts.every(terminate => terminate === false));
});

test('dropped final response recovers only a matching existing immutable original', async () => {
  for (const status of [400, 409]) {
    const item = staged(), progress = [];
    const name = item.path.split('/').pop();
    const h = harness({ listResult: { data: [{ name, metadata: { size: item.file.size, mimetype: item.type } }], error: null } });
    const { promise, upload } = await begin(h, item, new AbortController(), value => progress.push(value));
    upload.options.onError(statusError(status));
    await promise;
    assert.deepEqual(progress, [100]);
    assert.equal(h.storageCalls.length, 1);
    assert.equal(h.storageCalls[0].bucket, media.MEDIA_BUCKET);
    assert.equal(h.storageCalls[0].folder, item.path.slice(0, item.path.lastIndexOf('/')));
    assert.equal(h.storageCalls[0].params.search, name);
  }
});

test('recovery cannot accept mismatched name, size, MIME or storage error', async () => {
  const item = staged(), name = item.path.split('/').pop();
  for (const listResult of [
    { data: [{ name: 'other.png', metadata: { size: item.file.size, mimetype: item.type } }], error: null },
    { data: [{ name, metadata: { size: item.file.size + 1, mimetype: item.type } }], error: null },
    { data: [{ name, metadata: { size: item.file.size, mimetype: 'image/jpeg' } }], error: null },
    { data: [{ name, metadata: { size: item.file.size, mimetype: item.type } }], error: new Error('permission denied') },
  ]) {
    const h = harness({ listResult });
    const { promise, upload } = await begin(h, item);
    upload.options.onError(statusError(409));
    await assert.rejects(promise, /same file/);
  }
});

test('cancel during existing-object recovery cannot revive a canceled upload or update progress', async () => {
  const item = staged(), gate = deferred(), progress = [];
  const h = harness({ list: () => gate.promise });
  const { promise, upload, abort } = await begin(h, item, new AbortController(), value => progress.push(value));
  upload.options.onError(statusError(409));
  abort.abort();
  gate.resolve({ data: [{ name: item.path.split('/').pop(), metadata: { size: item.file.size, mimetype: item.type } }], error: null });
  await assert.rejects(promise, { name: 'AbortError' });
  await tick();
  assert.deepEqual(progress, []);
});

test('upload error messages disclose no raw TUS URLs, bearer credentials or provider response text', async () => {
  for (const [status, expected] of [[401, /session expired/], [403, /permission/], [413, /100 MB/], [500, /interrupted/]]) {
    const h = harness();
    const { promise, upload } = await begin(h);
    upload.options.onError(statusError(status));
    await assert.rejects(promise, error => {
      assert.match(error.message, expected);
      assert.doesNotMatch(error.message, /secret-provider|private-resume|do-not-show|Bearer/);
      return true;
    });
  }
});

test('registration uses same-origin PATCH with canonical payload and no storage overwrite', async () => {
  const saved = registered();
  const h = harness({ fetch: async () => ({ ok: true, status: 200, json: async () => saved }) });
  const item = staged(), signal = new AbortController().signal;
  const input = { workspaceId: item.path.split('/')[0], path: item.path, title: 'Original', contextNote: 'Origin: Manual', tags: ['golf'] };
  const result = await h.registerMediaOriginal(input, signal);
  assert.deepEqual(plain(result), saved);
  assert.equal(h.fetchCalls.length, 1);
  const { url, init } = h.fetchCalls[0];
  assert.equal(url, '/api/studio/media');
  assert.equal(init.method, 'PATCH');
  assert.equal(init.credentials, 'same-origin');
  assert.equal(init.signal, signal);
  assert.deepEqual(JSON.parse(init.body), input);
});

test('registration rejects missing IDs and handles expired session and invalid JSON clearly', async () => {
  for (const [response, expected] of [
    [{ ok: true, status: 200, json: async () => ({}) }, /Library ID/],
    [{ ok: false, status: 401, json: async () => ({ error: 'private authentication detail' }) }, /Sign in again/],
    [{ ok: false, status: 500, json: async () => { throw new Error('Not JSON'); } }, /same file/],
  ]) {
    const h = harness({ fetch: async () => response });
    await assert.rejects(h.registerMediaOriginal({}, new AbortController().signal), expected);
  }
  const h = harness({ fetch: async () => ({ ok: true, status: 200, json: async () => ({ id: 'recovered' }) }) });
  const result = await h.registerMediaOriginal({}, new AbortController().signal);
  assert.equal(result.id, 'recovered');
  assert.equal(result.job, null);
  assert.equal(result.worker.available, false);
  assert.equal(result.worker.automatic, false);
});

test('XHR receives Authorization exactly once, never comma-joined duplicated JWTs', async () => {
 const h=harness();const {promise,upload}=await begin(h);
 const headers=new Map();const req={getURL:()=>endpoint,getMethod:()=> 'POST',setHeader:(key,value)=>{key=key.toLowerCase();headers.set(key,headers.has(key)?headers.get(key)+', '+value:value);}};
 for(const [key,value] of Object.entries(upload.options.headers ?? {})) req.setHeader(key,value);
 await upload.options.onBeforeRequest(req);
 assert.equal(headers.get('authorization'),'Bearer test-session-initial');
 assert.equal(headers.get('authorization').includes(','),false);
 upload.options.onSuccess();await promise;
});
