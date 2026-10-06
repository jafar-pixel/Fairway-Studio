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
