import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
const root = new URL('../', import.meta.url);
const read = path => fs.readFileSync(new URL(path, root));
const hash = path => createHash('sha256').update(read(path)).digest('hex');
const fixture = JSON.parse(read('tests/fixtures/photo-only-source.json'));
const guide = fixture.reviewed_guide_integration;
const expectedPaths = [
  "app/globals.css",
  "components/studio/guide/guide-motion.ts",
  "components/studio/guide/guide-pointer.tsx",
  "components/studio/guide/guide-target.ts",
  "components/studio/guide/guide-toolbar.tsx",
  "components/studio/guide/guide.css",
  "components/studio/guide/index.ts",
  "components/studio/guide/use-guide-motion.ts",
  "components/studio/guide/use-guide-target.ts",
  "components/studio/onboarding-guide.tsx",
  "components/studio/projects.tsx",
  "lib/studio/guide-playback.ts",
  "lib/studio/use-guide-playback.ts",
  "tests/guide-components.test.mjs",
  "tests/guide-load-component.mjs",
  "tests/guide-motion.test.mjs",
  "tests/guide-playback.test.mjs",
  "tests/guide-target.test.mjs"
];
const expectedModifiedBefore = {
  "app/globals.css": "0d86d140a0154d43b36774462b5c1d84c7cea5ba993951b8ad41efa9f4c18a87",
  "components/studio/onboarding-guide.tsx": "710a05e878f86d898a12e046b34eec1ec6dfe6b755db58c6a5dc6c534ef98b8e",
  "components/studio/projects.tsx": "1fb11c0b5a2060e43596182d60d0dbe12190311d7252e9533db9516eae5ce2f5",
  "lib/studio/guide-playback.ts": "801f9cc4e3b8a0d38d10b918703b3bf4fd348e3a90db0612d725fad89a5c1a7f",
  "lib/studio/use-guide-playback.ts": "fa61e6d63dfd0f7170d60d7b355220b62f3b157713a6d02dd7a5a74bf0c0283d",
  "tests/guide-playback.test.mjs": "bfb3ba6f46d2c8e6e13b21eb5ec933d27e065915a918373fa9212e042f27f8db"
};
const expectedPrimitives = [
  "components/studio/guide/guide-motion.ts",
  "components/studio/guide/guide-pointer.tsx",
  "components/studio/guide/guide-target.ts",
  "components/studio/guide/guide-toolbar.tsx",
  "components/studio/guide/guide.css",
  "components/studio/guide/index.ts",
  "components/studio/guide/use-guide-motion.ts",
  "components/studio/guide/use-guide-target.ts"
];

test('reviewed guide scope is exactly the frozen 18 files, with six deliberate existing-file changes', () => {
  assert.equal(guide.baseline_commit, '91eb101b03ad3ad0384204eb86b2e81e167657ef');
  assert.equal(guide.manifest_sha256, 'ec8b300bda94d5992b8e458a5edbf0f48e06b91f7a54d5494fe5887007eabe9a');
  assert.equal(guide.modified_file_count, 6); assert.equal(guide.added_file_count, 12);
  assert.deepEqual(guide.files.map(row => row.path).sort(), expectedPaths);
  assert.deepEqual(guide.files.filter(row => row.status === 'modified').map(row => row.path).sort(), Object.keys(expectedModifiedBefore).sort());
  assert.equal(guide.files.filter(row => row.status === 'added').length, 12);
  for (const row of guide.files) {
    assert.equal(hash(row.path), row.sha256, row.path);
    if (row.status === 'modified') assert.equal(row.before_sha256, expectedModifiedBefore[row.path], row.path + ': historical source');
    else { assert.equal(row.status, 'added'); assert.equal(row.before_sha256, null); }
  }
});

test('changed guide sources keep the original baseline hashes rather than claiming byte preservation', () => {
  let deliberateChanges = 0;
  const snapshots = [...fixture.reviewed_profile_source, ...fixture.preserved_baseline];
  for (const row of guide.files.filter(row => row.status === 'modified')) {
    const snapshot = snapshots.find(item => item.path === row.path);
    if (!snapshot) { assert.equal(row.path, 'tests/guide-playback.test.mjs'); continue; }
    deliberateChanges++;
    assert.equal(snapshot.pre_guide_sha256, row.before_sha256, row.path);
    assert.equal(snapshot.sha256, row.sha256, row.path);
    assert.notEqual(snapshot.sha256, snapshot.pre_guide_sha256, row.path);
    assert.match(snapshot.reviewed_guide_change, /not claimed unchanged/);
  }
  assert.equal(deliberateChanges, 5, 'all five existing production sources are separately reviewed; the sixth modification is the guide test');
});

test('all guide primitive files are pinned, and app/auth seams retain protected bytes and private-client changes are explicitly pinned', () => {
  const actual = fs.readdirSync(new URL('components/studio/guide/', root)).map(name => 'components/studio/guide/' + name).sort();
  assert.deepEqual(actual, expectedPrimitives);
  assert.equal(hash('components/studio/app.tsx'), 'c8d8cddaa544e3fedd5315546b5738436e32fec5a6d6614bb12a29147d53995c');
  const accountClient = fixture.reviewed_private_account_security.production_files.find(row => row.path === 'lib/studio/private-business/client.ts');
  assert.equal(accountClient.before_sha256, '5a5cbdf107c06bfdee54aefa03a14eae8f9e79a4b0fd502eaa9bd3b9697bd9eb', 'historical reviewed client bytes remain pinned');
  assert.equal(accountClient.sha256, 'a3d6f8435d813b20c436f55196ae93c26cf7558453edf1fe16632b60f94affab', 'explicitly reviewed account-bound client bytes');
  assert.equal(hash('lib/studio/private-business/client.ts'), 'a3d6f8435d813b20c436f55196ae93c26cf7558453edf1fe16632b60f94affab');
  const protectedPaths = ['components/studio/app.tsx', 'lib/studio/private-business/client.ts', 'lib/supabase/client.ts', 'lib/supabase/server.ts', 'lib/supabase/proxy.ts'];
  for (const path of protectedPaths) assert.equal(guide.files.some(row => row.path === path), false, path);
});
