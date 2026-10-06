import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModule } from './media-test-harness.mjs';
const wb = loadModule('lib/studio/whiteboard.ts');
const id = '30000000-0000-4000-8000-000000000001', owner = '10000000-0000-4000-8000-000000000001', mate = '10000000-0000-4000-8000-000000000002';
const team = { id, workspace_id: id, idea_id: id, scope: 'team', owner_id: owner, created_at: '' };
const item = (extra = {}) => ({ id, board_id: id, kind: 'note', title: '', body: '', created_by: owner, checked_out_by: null, revision: 0, ...extra });

test('input validation mirrors the database before a round trip', () => {
  assert.equal(wb.boardInputError('ensureBoards', { idea_id: id }), null);
  assert.match(wb.boardInputError('dropTable', {}), /Unsupported/);
  assert.match(wb.boardInputError('addItem', { board_id: id, kind: 'note', created_by: owner }), /server/);
  assert.match(wb.boardInputError('addItem', { board_id: id, kind: 'library' }), /Library item/);
  assert.match(wb.boardInputError('addItem', { board_id: id, kind: 'swatch', color: 'red' }), /colour/);
  assert.match(wb.boardInputError('addItem', { board_id: id, kind: 'image', image_url: 'javascript:alert(1)' }), /https/);
  assert.match(wb.boardInputError('updateItem', { id, x: 1 }), /Reload/);
  assert.match(wb.boardInputError('updateItem', { id, expected_revision: 0, x: 1e9 }), /outside/);
  assert.match(wb.boardInputError('addComment', { board_id: id, body: '   ' }), /comment/);
  assert.equal(wb.boardInputError('addItem', { board_id: id, kind: 'swatch', title: 'Green', color: '#1F4D3A', x: 10, y: 10 }), null);
});

test('only the board owner moves; teammates add, comment, check out and copy', () => {
  const asOwner = wb.itemPermissions(team, item({ created_by: mate }), owner);
  assert.deepEqual({ ...asOwner }, { move: true, edit: true, remove: true, checkOut: true, checkIn: false, copyToPrivate: true });
  const asMateOnOwners = wb.itemPermissions(team, item(), mate);
  assert.equal(asMateOnOwners.move, false); assert.equal(asMateOnOwners.edit, false); assert.equal(asMateOnOwners.remove, false);
  assert.equal(asMateOnOwners.checkOut, true); assert.equal(asMateOnOwners.copyToPrivate, true);
  const asMateOnOwn = wb.itemPermissions(team, item({ created_by: mate }), mate);
  assert.equal(asMateOnOwn.move, false); assert.equal(asMateOnOwn.edit, true);
  const checkedOut = wb.itemPermissions(team, item({ checked_out_by: mate }), mate);
  assert.equal(checkedOut.checkOut, false); assert.equal(checkedOut.checkIn, true);
  assert.equal(wb.itemPermissions(team, item({ checked_out_by: owner }), mate).checkIn, false);
  assert.match(wb.boardRulesSummary({ ...team, scope: 'private', owner_id: mate }, mate), /Only you/);
  assert.match(wb.boardRulesSummary(team, mate), /Only the idea's owner moves/);
});

const seed = loadModule('lib/studio/whiteboard-seed.ts');
test('starter board comes from the idea: photo, brief with tags, spec sheet of what is missing, photo colours', () => {
  const idea = { title: 'Connected golf bag', body: 'Heritage craftsmanship meets modern technology.\nMaterials: full-grain leather', category: 'Product concept', status: 'exploring', tags: ['Golf bags', 'mockup-idea:x'] };
  const items = seed.seedItems(idea, ['#2A140B', '#B79A45'], 'https://example.com/bag.jpg');
  assert.deepEqual(Array.from(items, i => i.kind), ['image', 'note', 'note', 'swatch', 'swatch']);
  assert.match(items[1].body, /Tags: Golf bags$/m); assert.doesNotMatch(items[1].body, /mockup-idea/);
  assert.match(items[2].body, /✓ Materials \/ fabric: full-grain leather/);
  assert.match(items[2].body, /☐ Stitch pattern: missing/); assert.match(items[2].body, /Technology \/ electronics: missing/);
  assert.match(items[2].body, /Pockets & compartments/); assert.match(items[2].title, /missing/);
  assert.equal(items[3].title, 'Espresso'); assert.equal(items[4].title, 'Gold');
  assert.equal(seed.seedItems(idea, [], null).some(i => i.kind === 'image'), false);
});
test('only https or same-origin photos are stored; colours come from the most common distinct pixels', () => {
  assert.equal(seed.storableImage('/demo/bag.png', 'https://fairway.app'), 'https://fairway.app/demo/bag.png');
  assert.equal(seed.storableImage('/demo/bag.png', 'http://localhost:3000'), null);
  assert.equal(seed.storableImage('supabase-storage://x', 'https://fairway.app'), null);
  assert.equal(seed.storableImage('//evil.example/x.png', 'https://fairway.app'), null);
  const px = []; for (let i = 0; i < 90; i++) px.push(42, 20, 11, 255); for (let i = 0; i < 10; i++) px.push(183, 154, 69, 255); px.push(0, 0, 0, 0);
  assert.deepEqual(Array.from(seed.dominantColours(px)), ['#2A140B', '#B79A45']);
  assert.equal(seed.colourName('#E9D7CA'), 'Cream'); assert.equal(seed.colourName('#974718'), 'Cognac'); assert.equal(seed.colourName('#1F4D3A'), 'Deep Green');
});
