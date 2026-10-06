import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
const root = new URL('../', import.meta.url);
const read = path => fs.readFileSync(new URL(path, root));
const hash = path => createHash('sha256').update(read(path)).digest('hex');
const snapshot = JSON.parse(read('tests/fixtures/photo-only-source.json'));
const owned = JSON.parse(read('tests/fixtures/private-business-owned-files.json'));
const expected = {
  'app/api/studio/private-business/route.ts': ['6b23a7f6d33862ef96599c2b128dd6e675293d9803bdee0304c6c814d40b31be', '4cae3a50453ac7f10e396b16b3918c465bcf5600017092cf5170c3a805cdc3fa'],
  'components/studio/private-business/board.tsx': ['307f3894cd1a120b6ac0a5d2dfaa9fbdb8f74db7d6408456edfbed4c66e0bd37', '6aacbc6da48b89b6f45090fe27e263915fe5f7507090c3f34a10fd449707f4f2'],
  'lib/studio/private-business/client.ts': ['5a5cbdf107c06bfdee54aefa03a14eae8f9e79a4b0fd502eaa9bd3b9697bd9eb', 'a3d6f8435d813b20c436f55196ae93c26cf7558453edf1fe16632b60f94affab'],
  'lib/studio/private-business/contracts.ts': ['9fb1e3812991409b0527326103955cd902dc70b675e6506b3115c1768d637529', 'b21baa682cf458074cfb8ac8b3f807858a0192074355a794af5fe6a39930d0f7'],
  'lib/studio/private-business/server.ts': ['b060707e48fa7fc7cb58cfe658149971c4a859164958fe0b2c1fd07367129b8c', 'cc76d698af3e07559bbb530f5d45e786c0c8af7becf1418fe1818cf21f10037b'],
};

test('account security release pins exactly five deliberate production changes with historical hashes', () => {
  const reviewed = snapshot.reviewed_private_account_security;
  assert.equal(reviewed.baseline, 'fairway-guide-release');
  assert.equal(reviewed.schema_changes, 0);
  assert.deepEqual(reviewed.production_files.map(row => row.path).sort(), Object.keys(expected).sort());
  for (const row of reviewed.production_files) {
    const [before, after] = expected[row.path];
    assert.equal(row.before_sha256, before, row.path + ' historical bytes');
    assert.equal(row.sha256, after, row.path + ' reviewed bytes');
    assert.equal(hash(row.path), after, row.path + ' actual bytes');
    assert.match(row.reviewed_change, /not claimed unchanged/);
    for (const entries of [snapshot.preserved_baseline, owned.owned_production_files]) {
      const manifestRow = entries.find(item => item.path === row.path);
      assert.ok(manifestRow, row.path);
      assert.equal(manifestRow.pre_account_binding_sha256, before);
      assert.equal(manifestRow.sha256, after);
      assert.match(manifestRow.reviewed_account_binding_change, /not claimed unchanged/);
    }
  }
});

test('security-only board change supplies current user and imports no unrelated feature', () => {
  const board = read('components/studio/private-business/board.tsx').toString();
  assert.match(board, /new PrivateBusinessClient\(workspaceId, userId\)/);
  assert.doesNotMatch(board, /ProtonPanel|ProtonNavigation|apparel|relationships/i);
  for (const path of ['lib/studio/proton', 'components/studio/proton', 'app/api/studio/proton', 'lib/studio/apparel', 'components/studio/apparel', 'app/api/studio/apparel']) {
    assert.equal(fs.existsSync(new URL(path, root)), false, path);
  }
});
