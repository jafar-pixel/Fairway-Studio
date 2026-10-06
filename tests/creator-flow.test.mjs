import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadModule, workspaceId, plain, deferred } from './media-test-harness.mjs';
const { IdeaSaveSession, creatorBody, creatorTags, sourceContext, normalizeIdeaCategory, CREATOR_SOURCES } = loadModule('lib/studio/creator-flow.ts');
const draft = (extra = {}) => ({ title: 'My idea', body: 'Keep\n\nthis text  ', category: 'General', tags: ['texture'], status: 'exploring', ...extra });
const row = (extra = {}) => ({ id: 'idea-1', workspace_id: workspaceId, revision: 1, ...draft(), ...extra });

test('existing description is preserved byte-for-byte without optional source context', () => {
  const original = 'Original title\n\n  Existing notes\n\nCreative context\nOrigin: Sketch  ';
  assert.equal(creatorBody(original, '', '', ''), original);
  assert.equal(creatorBody('A thought', 'Sketch', 'Original Artist', 'For our community'), 'A thought\n\nCreative context\nOrigin: Sketch\nSource creator / credit: Original Artist\nStory / team context: For our community');
  assert.equal(creatorBody('a'.repeat(3000), '', '', '').length, 3000);
  assert.throws(() => creatorBody('a'.repeat(3000), 'Photo', '', ''), /3,000/);
});
test('all six starting points and onboarding categories are preserved without forced AI', () => {
  assert.deepEqual(plain(CREATOR_SOURCES), ['Manual idea', 'Pinterest / reference', 'Photo', 'Sketch', 'Thought', 'AI-assisted']);
  assert.equal(normalizeIdeaCategory('brand_identity'), 'Brand identity');
  assert.equal(normalizeIdeaCategory('My original category'), 'My original category');
});
test('tags and source context reject overflow without silently truncating', () => {
  assert.deepEqual(plain(creatorTags(' Blue,BLUE, texture ')), ['blue', 'texture']);
  assert.throws(() => creatorTags(Array.from({ length: 21 }, (_, n) => `tag${n}`).join(',')), /20 tags/);
  assert.throws(() => creatorTags('x'.repeat(49)), /48/);
  assert.equal(sourceContext('n'.repeat(500), '').length, 500);
  assert.throws(() => sourceContext('n'.repeat(500), 'Artist'), /500/);
});
test('new idea creates once and serial links consume each returned revision', async () => {
  const calls = [];
  const session = new IdeaSaveSession(workspaceId, null, async (op, input) => {
    calls.push({ op, ...plain(input) });
    return op === 'createIdea' ? row() : { link: input, idea_revision: input.expected_revision + 1 };
  }, () => ({}));
  await session.save(draft());
  await session.link('file_id', 'first');
  await session.link('file_id', 'second');
  await session.link('file_id', 'first');
  await session.save(draft());
  assert.deepEqual(calls.map(c => c.op), ['createIdea', 'linkIdeaAsset', 'linkIdeaAsset']);
  assert.deepEqual(calls.slice(1).map(c => c.expected_revision), [1, 2]);
  assert.equal(session.idea.revision, 3);
  for (const call of calls) assert.ok(!('author_id' in call) && !('created_by' in call));
});
test('concurrent save clicks are single-flight and cannot create duplicate ideas', async () => {
  const wait = deferred(); let calls = 0;
  const session = new IdeaSaveSession(workspaceId, null, async () => { calls++; await wait.promise; return row(); }, () => ({}));
  const a = session.save(draft()); const b = session.save(draft());
  assert.equal(a, b); wait.resolve(); await a;
  assert.equal(calls, 1);
});
test('lost create response retries original payload before applying edited draft', async () => {
  const calls = []; let first = true;
  const session = new IdeaSaveSession(workspaceId, null, async (op, input) => {
    calls.push({ op, input: plain(input) });
    if (first) { first = false; throw Error('Response lost'); }
    return row({ ...input, revision: op === 'updateIdea' ? 2 : 1 });
  }, () => ({}));
  await assert.rejects(session.save(draft()), /Response lost/);
  await session.save(draft({ title: 'Edited while retrying' }));
  assert.deepEqual(calls.map(c => c.op), ['createIdea', 'createIdea', 'updateIdea']);
  assert.deepEqual(calls[0].input, calls[1].input);
  assert.equal(session.idea.id, 'idea-1');
  assert.equal(session.idea.title, 'Edited while retrying');
});
test('a committed link with lost response is reconciled and never duplicated', async () => {
  let linkCalls = 0; const state = { ideas: [row({ revision: 2 })], ideaAssets: [{ idea_id: 'idea-1', file_id: 'file-1', workspace_id: workspaceId }] };
  const session = new IdeaSaveSession(workspaceId, row(), async op => { if (op === 'refresh') return state; linkCalls++; throw Error('Lost link response'); }, () => ({}));
  await session.link('file_id', 'file-1');
  await session.link('file_id', 'file-1');
  assert.equal(linkCalls, 1); assert.equal(session.idea.revision, 2);
});
test('failed uncommitted link retains the idea and uses reconciled revision on retry', async () => {
  const calls = []; let first = true;
  const session = new IdeaSaveSession(workspaceId, row(), async (op, input) => {
    if (op === 'refresh') return { ideas: [row({ revision: 4 })], ideaAssets: [] };
    calls.push(plain(input));
    if (first) { first = false; throw Error('Conflict'); }
    return { idea_revision: 5 };
  }, () => ({}));
  await assert.rejects(session.link('file_id', 'file-1'), /Conflict/);
  await session.link('file_id', 'file-1');
  assert.deepEqual(calls.map(c => c.expected_revision), [1, 4]);
  assert.equal(session.idea.id, 'idea-1');
});
test('lost update response reconciles matching saved fields before applying subsequent edits', async () => {
  const calls = []; let first = true;
  const saved = draft({ body: 'Updated description' });
  const session = new IdeaSaveSession(workspaceId, row(), async (op, input) => {
    calls.push(op);
    if (op === 'refresh') return { ideas: [row({ ...saved, revision: 2 })] };
    if (first) { first = false; throw Error('Response lost'); }
    return row({ ...input, revision: 3 });
  }, () => ({}));
  await assert.rejects(session.save(saved), /Response lost/);
  await session.save({ ...saved, title: 'Next title' });
  assert.deepEqual(calls, ['updateIdea', 'refresh', 'updateIdea']);
  assert.equal(session.idea.title, 'Next title');
});
test('source link retries retain the canonical ID and preserve existing attribution', async () => {
  let creates = 0; let links = 0;
  const session = new IdeaSaveSession(workspaceId, row(), async (op) => {
    if (op === 'refresh') return {};
    if (op === 'createExternalFile') { creates++; return { id: 'source-1', workspace_id: workspaceId }; }
    if (++links === 1) throw Error('Link interrupted');
    return { idea_revision: 2 };
  }, () => ({}));
  const input = { url: 'https://example.com/source', title: 'My source', context_note: 'Source creator / credit: Artist' };
  await assert.rejects(session.saveSource('createExternalFile', input), /interrupted/);
  await session.saveSource('createExternalFile', { ...input, title: 'New title in draft' });
  assert.equal(creates, 1); assert.equal(links, 2);
});
test('uncertain source creation retries its frozen metadata even after edits', async () => {
  const inputs = []; let first = true;
  const session = new IdeaSaveSession(workspaceId, row(), async (op, input) => {
    if (op === 'createExternalFile') {
      inputs.push(plain(input)); if (first) { first = false; throw Error('Response lost'); }
      return { id: 'source-1', workspace_id: workspaceId };
    }
    return { idea_revision: 2 };
  }, () => ({}));
  const input = { url: 'https://example.com/source', title: 'My source' };
  await assert.rejects(session.saveSource('createExternalFile', input));
  await session.saveSource('createExternalFile', { ...input, title: 'Edited title' });
  assert.deepEqual(inputs, [input, input]);
});
test('source lookup and returned rows are constrained to the current workspace', async () => {
  let calls = 0;
  const foreign = { id: 'foreign', workspace_id: 'another-workspace', url: 'https://example.com/source' };
  const session = new IdeaSaveSession(workspaceId, row(), async () => { calls++; return foreign; }, () => ({ files: [foreign] }));
  await assert.rejects(session.saveSource('createExternalFile', { url: foreign.url }), /verified in this workspace/);
  assert.equal(calls, 1);
});
test('app routes New Idea to enhanced editor, retains walkthrough initial values and guards navigation', () => {
  const app = fs.readFileSync(new URL('../components/studio/app.tsx', import.meta.url), 'utf8');
  assert.match(app, /create === "Idea"[\s\S]*?<IdeaEditor[\s\S]*?initial=\{createInitial\}/);
  assert.match(app, /dispatchEvent\(new Event\(CREATOR_NAVIGATION_EVENT/);
  assert.match(app, /Promise\.allSettled\(\[result\.mutate\(\), workflow\.mutate\(\), linkedRecord\.mutate\(\)\]\)/);
  const collections = fs.readFileSync(new URL('../components/studio/collections.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(collections, /Upload an image|up to 10 MB|file\.size > 10/);
  assert.match(collections, /onCancel=\{\(event\) => \{ event\.preventDefault\(\); onClose\(\); \}\}/);
  assert.match(collections, /mode === "upload" \? <LibraryMediaComposer/);
  assert.match(collections, /privateMedia\) return[\s\S]*?<MediaPlayer/);
});
