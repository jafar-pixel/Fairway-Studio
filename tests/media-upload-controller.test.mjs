import test from 'node:test';
import assert from 'node:assert/strict';
import { controller, media, workspaceId, userId, fakeFile, registered, metadata, deferred, tick, plain } from './media-test-harness.mjs';

const { MediaUploadController, validateSelectedMedia, mediaContextNote, mediaBytes } = controller;
function queue(overrides = {}) {
  let next = 0;
  return new MediaUploadController({
    workspaceId, userId, randomId: () => `upload-${++next}`,
    uploadOriginal: async () => {}, register: async input => registered(input.path), ...overrides,
  });
}
const current = q => q.getSnapshot().items[0];

test('accepts exactly 100,000,000 bytes; rejects one extra byte, zero, negative and invalid sizes', () => {
  assert.equal(media.MAX_MEDIA_BYTES, 100_000_000);
  assert.equal(validateSelectedMedia(fakeFile('original.png', { size: 100_000_000 })), 'image/png');
  for (const size of [100_000_001, 0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => validateSelectedMedia(fakeFile('original.png', { size })), undefined, String(size));
  }
  assert.match(mediaBytes(100_000_000), /^100\.0 MB$/);
});

test('MIME must match the extension; empty/generic MIME uses the supported extension', () => {
  for (const [name, type, expected] of [
    ['photo.JPG', '', 'image/jpeg'], ['clip.mov', '', 'video/quicktime'], ['movie.mkv', 'application/octet-stream', 'video/x-matroska'],
    ['song.mp3', 'audio/mp3', 'audio/mpeg'], ['photo.heic', 'image/heic-sequence', 'image/heic'],
    ['photo.png', 'image/png; charset=binary', 'image/png'],
  ]) assert.equal(validateSelectedMedia(fakeFile(name, { type })), expected);
  for (const [name, type] of [['photo.png', 'image/jpeg'], ['clip.mp4', 'audio/mpeg'], ['photo.svg', 'image/svg+xml'], ['file.exe', ''], ['no-extension', 'image/png']]) {
    assert.throws(() => validateSelectedMedia(fakeFile(name, { type })), /matching file type/);
  }
});

test('combined provenance and note has a strict 500-character boundary', () => {
  const base = metadata({ creatorName: 'Artist', sourceUrl: 'https://example.test/work', sourceKind: 'reference' });
  const prefix = mediaContextNote({ ...base, contextNote: 'x' });
  const remaining = 500 - prefix.length + 1;
  assert.equal(mediaContextNote({ ...base, contextNote: 'x'.repeat(remaining) }).length, 500);
  assert.throws(() => mediaContextNote({ ...base, contextNote: 'x'.repeat(remaining + 1) }), /500/);
});

test('provenance validates HTTPS sources, credentials and creator line breaks', () => {
  for (const sourceUrl of ['http://example.test/a', 'javascript:alert(1)', 'https://user:secret@example.test/a', 'example.test/a', 'https://example.test/a\nSource: forged', 'https://example.test/\ra']) {
    assert.throws(() => mediaContextNote(metadata({ sourceUrl })));
  }
  for (const creatorName of ['Artist\nAnother', 'Artist\rAnother']) assert.throws(() => mediaContextNote(metadata({ creatorName })), /one line/);
  const note = mediaContextNote(metadata({ sourceKind: 'ai', creatorName: ' Artist ', sourceUrl: ' https://example.test/a ', contextNote: '  Keep this note  ' }));
  assert.match(note, /Origin: AI-assisted/);
  assert.match(note, /Artist/);
  assert.match(note, /https:\/\/example\.test\/a/);
  assert.ok(note.endsWith('Keep this note'));
});

test('origin must be an actual allowed origin rather than an inherited object property', () => {
  for (const sourceKind of ['unknown', 'constructor', 'toString', '__proto__']) {
    assert.throws(() => mediaContextNote(metadata({ sourceKind })));
  }
  for (const sourceKind of ['manual', 'ai', 'reference']) assert.match(mediaContextNote(metadata({ sourceKind })), /^Origin: /);
});

test('selection reports invalid files but keeps valid selections with immutable workspace/user paths', () => {
  const q = queue();
  q.addFiles([fakeFile('valid.png'), fakeFile('too-big.png', { size: 100_000_001 }), fakeFile('mismatch.png', { type: 'video/mp4' })]);
  assert.equal(q.getSnapshot().items.length, 1);
  assert.equal(q.getSnapshot().selectionErrors.length, 2);
  assert.equal(current(q).path, `${workspaceId}/${userId}/upload-1.png`);
  const path = current(q).path;
  q.updateMetadata(current(q).id, { title: 'Renamed' });
  assert.equal(current(q).path, path);
  q.clearSelectionErrors();
  assert.equal(q.getSnapshot().selectionErrors.length, 0);
});

test('disabled or invalid-workspace queues fail before storage', () => {
  const disabled = queue({ disabled: true });
  disabled.addFiles([fakeFile()]);
  assert.equal(disabled.getSnapshot().items.length, 0);
  assert.match(disabled.getSnapshot().selectionErrors[0], /signed-in workspace/);
  const invalid = queue({ workspaceId: 'not-a-workspace' });
  invalid.addFiles([fakeFile()]);
  assert.equal(invalid.getSnapshot().items.length, 0);
});

test('all user metadata is validated before transferring original bytes', async () => {
  let uploads = 0;
  const q = queue({ uploadOriginal: async () => { uploads++; } });
  q.addFiles([fakeFile()]);
  q.updateMetadata(current(q).id, { contextNote: 'x'.repeat(500) });
  const result = await q.uploadAll();
  assert.equal(result.complete, false);
  assert.equal(uploads, 0);
  assert.match(current(q).error, /500/);
});

test('title and tag bounds are checked before upload, without silently truncating edited metadata', async () => {
  for (const change of [{ title: 'x'.repeat(161) }, { tags: Array(11).fill('golf') }, { tags: ['x'.repeat(41)] }]) {
    let uploads = 0;
    const q = queue({ uploadOriginal: async () => { uploads++; } });
    q.addFiles([fakeFile()]);
    q.updateMetadata(current(q).id, change);
    assert.equal((await q.uploadAll()).complete, false);
    assert.equal(uploads, 0);
    if (change.title) assert.equal(current(q).metadata.title.length, 161);
  }
  const q = queue();
  q.addFiles([fakeFile()]);
  q.updateMetadata(current(q).id, { title: 'x'.repeat(160), tags: Array(10).fill('x'.repeat(40)) });
  assert.equal((await q.uploadAll()).complete, true);
});

test('registration receives only the supported canonical payload', async () => {
  let input;
  const q = queue({ register: async value => { input = value; return registered(); } });
  q.addFiles([fakeFile()]);
  q.updateMetadata(current(q).id, { title: '  Saved title  ', creatorName: 'Photographer', sourceUrl: 'https://example.test/a', tags: ['golf'] });
  assert.equal((await q.uploadAll()).complete, true);
  assert.deepEqual(Object.keys(input).sort(), ['contextNote', 'path', 'tags', 'title', 'workspaceId']);
  assert.equal(input.workspaceId, workspaceId);
  assert.equal(input.title, 'Saved title');
  assert.deepEqual(plain(input.tags), ['golf']);
  assert.match(input.contextNote, /Photographer/);
  assert.match(input.contextNote, /https:\/\/example\.test\/a/);
});

test('queue awaits each onRegistered callback before starting the next original', async () => {
  const gate = deferred(), entered = deferred(), events = [];
  const q = queue({
    uploadOriginal: async item => { events.push(`upload:${item.id}`); },
    register: async input => { events.push(`register:${input.path.split('/').pop()}`); return registered(input.path); },
  });
  q.addFiles([fakeFile('first.png'), fakeFile('second.png')]);
  const run = q.uploadAll({ onRegistered: async (_file, item) => {
    events.push(`link-start:${item.id}`);
    if (item.id === 'upload-1') { entered.resolve(); await gate.promise; }
    events.push(`link-end:${item.id}`);
  } });
  await entered.promise;
  assert.deepEqual(events, ['upload:upload-1', 'register:upload-1.png', 'link-start:upload-1']);
  assert.equal(q.getSnapshot().items[1].state, 'staged');
  gate.resolve();
  const result = await run;
  assert.equal(result.complete, true);
  assert.ok(events.indexOf('link-end:upload-1') < events.indexOf('upload:upload-2'));
  assert.ok(q.getSnapshot().items.every(item => item.state === 'attached'));
});

test('registration failure keeps uploaded original and retries the same path without re-uploading', async () => {
  let uploads = 0, attempts = 0;
  const paths = [];
  const q = queue({ uploadOriginal: async () => { uploads++; }, register: async input => {
    paths.push(input.path);
    if (++attempts === 1) throw new Error('Registration temporarily unavailable');
    return registered();
  } });
  q.addFiles([fakeFile()]);
  const first = await q.uploadAll();
  assert.equal(first.complete, false);
  assert.equal(current(q).uploaded, true);
  assert.equal(current(q).registered, null);
  assert.equal(current(q).state, 'error');
  const second = await q.retry(current(q).id);
  assert.equal(second.complete, true);
  assert.equal(uploads, 1);
  assert.equal(attempts, 2);
  assert.equal(paths[0], paths[1]);
  assert.equal(current(q).registered.id, 'canonical-1');
});

test('link failure preserves canonical ID; retry links only once more and later submissions do not duplicate', async () => {
  let uploads = 0, registrations = 0, links = 0;
  const q = queue({ uploadOriginal: async () => { uploads++; }, register: async () => { registrations++; return registered(); } });
  q.addFiles([fakeFile()]);
  const onRegistered = async file => {
    assert.equal(file.id, 'canonical-1');
    if (++links === 1) throw new Error('Idea changed; retry with current revision');
  };
  assert.equal((await q.uploadAll({ onRegistered })).complete, false);
  assert.equal(current(q).registered.id, 'canonical-1');
  assert.equal(current(q).uploaded, true);
  assert.equal(current(q).attached, false);
  assert.equal((await q.retry(current(q).id)).complete, true);
  assert.equal((await q.uploadAll({ onRegistered })).complete, true);
  assert.equal((await q.retry(current(q).id)).complete, true);
  assert.deepEqual([uploads, registrations, links], [1, 1, 2]);
});

test('a failed original does not block remaining files; retry preserves successful work', async () => {
  const calls = [];
  let fail = true;
  const q = queue({ uploadOriginal: async item => {
    calls.push(item.id);
    if (item.id === 'upload-1' && fail) { fail = false; throw new Error('Interrupted'); }
  } });
  q.addFiles([fakeFile('one.png'), fakeFile('two.png')]);
  const first = await q.uploadAll();
  assert.equal(first.complete, false);
  assert.equal(first.saved.length, 1);
  assert.equal(q.getSnapshot().items[1].state, 'saved');
  assert.equal((await q.uploadAll()).complete, true);
  assert.deepEqual(calls, ['upload-1', 'upload-2', 'upload-1']);
});

test('multiple clicks and retries are single-flight while the queue is running', async () => {
  const entered = deferred(), gate = deferred();
  let uploads = 0;
  const q = queue({ uploadOriginal: async () => { uploads++; entered.resolve(); await gate.promise; } });
  q.addFiles([fakeFile()]);
  const first = q.uploadAll();
  const second = q.uploadAll();
  assert.equal(first, second);
  await entered.promise;
  assert.equal(q.retry(current(q).id), first);
  q.addFiles([fakeFile('extra.png')]);
  q.remove(current(q).id);
  q.updateMetadata(current(q).id, { title: 'should not change' });
  assert.equal(q.getSnapshot().items.length, 1);
  assert.equal(current(q).metadata.title, 'original.png');
  gate.resolve();
  assert.equal((await first).complete, true);
  assert.equal(uploads, 1);
  assert.equal(q.getSnapshot().busy, false);
});

test('cancel in-flight upload pauses without registration and retry uses the same immutable path', async () => {
  const entered = deferred();
  let attempts = 0, registrations = 0;
  const paths = [];
  const q = queue({ uploadOriginal: async (item, signal) => {
    paths.push(item.path);
    if (++attempts > 1) return;
    entered.resolve();
    await new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('Canceled', 'AbortError')), { once: true }));
  }, register: async () => { registrations++; return registered(); } });
  q.addFiles([fakeFile()]);
  const run = q.uploadAll();
  await entered.promise;
  q.cancel(current(q).id);
  assert.equal((await run).complete, false);
  assert.equal(current(q).state, 'canceled');
  assert.equal(registrations, 0);
  assert.equal((await q.uploadAll()).complete, false);
  assert.equal(attempts, 1);
  assert.equal((await q.retry(current(q).id)).complete, true);
  assert.deepEqual(paths, [paths[0], paths[0]]);
  assert.equal(registrations, 1);
});

test('canceling a queued selection requires explicit retry and does not block other selections', async () => {
  const uploaded = [];
  const q = queue({ uploadOriginal: async item => { uploaded.push(item.id); } });
  q.addFiles([fakeFile('one.png'), fakeFile('two.png')]);
  q.cancel('upload-1');
  assert.equal((await q.uploadAll()).complete, false);
  assert.deepEqual(uploaded, ['upload-2']);
  assert.equal((await q.retry('upload-1')).complete, true);
  assert.deepEqual(uploaded, ['upload-2', 'upload-1']);
});

test('cancellation cannot discard a saved canonical ID or an in-flight idea link', async () => {
  const entered = deferred(), gate = deferred();
  const q = queue();
  q.addFiles([fakeFile()]);
  const run = q.uploadAll({ onRegistered: async () => { entered.resolve(); await gate.promise; } });
  await entered.promise;
  q.cancel(current(q).id);
  assert.equal(current(q).state, 'linking');
  assert.ok(current(q).registered.id);
  gate.resolve();
  assert.equal((await run).complete, true);
  q.cancel(current(q).id);
  assert.equal(current(q).state, 'attached');
});

test('dispose aborts outstanding transfer and activate permits explicit same-path retry', async () => {
  const entered = deferred();
  let uploads = 0;
  const q = queue({ uploadOriginal: async (_item, signal) => {
    if (++uploads > 1) return;
    entered.resolve();
    await new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
  } });
  q.addFiles([fakeFile()]);
  const run = q.uploadAll();
  await entered.promise;
  q.dispose();
  assert.equal((await run).complete, false);
  assert.equal(current(q).state, 'canceled');
  q.activate();
  assert.equal((await q.retry(current(q).id)).complete, true);
});

test('progress is bounded and missing canonical IDs are recoverable without another upload', async () => {
  let attempts = 0, uploads = 0;
  const seen = [];
  const q = queue({ uploadOriginal: async (_item, _signal, progress) => { uploads++; progress(-10); progress(150); }, register: async () => registered(++attempts === 1 ? '' : 'canonical-recovered') });
  q.subscribe(() => { if (current(q)?.state === 'uploading') seen.push(current(q).progress); });
  q.addFiles([fakeFile()]);
  assert.equal((await q.uploadAll()).complete, false);
  assert.ok(seen.every(value => value >= 0 && value <= 100));
  assert.match(current(q).error, /Library ID/);
  assert.equal((await q.retry(current(q).id)).complete, true);
  assert.equal(uploads, 1);
  assert.equal(current(q).registered.id, 'canonical-recovered');
});

test('successful registration is immutable and removing selection performs no extra transport work', async () => {
  let calls = 0;
  const q = queue({ uploadOriginal: async () => { calls++; }, register: async () => { calls++; return registered(); } });
  q.addFiles([fakeFile()]);
  await q.uploadAll();
  const id = current(q).id;
  q.updateMetadata(id, { title: 'Changed after save' });
  assert.equal(current(q).metadata.title, 'original.png');
  q.remove(id);
  assert.equal(q.getSnapshot().items.length, 0);
  assert.equal(calls, 2);
  assert.equal((await q.retry(id)).complete, true);
  await tick();
});
