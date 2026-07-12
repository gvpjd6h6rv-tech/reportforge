import test from 'node:test';
import assert from 'node:assert/strict';
import { checkNonScoreableOwnership } from '../../../tools/salad-score/subsystem-gate/checkers/check_non_scoreable_ownership.mjs';

test('T40: non-scoreable (JSON/config) files are verified against the ownership map by CANONICAL RELATIVE PATH, independent of the scanner', () => {
  const ownershipMap = { subsystems: [{ owner: 'repository-package-manifest', allowedFiles: ['package.json'] }] };
  const ok = checkNonScoreableOwnership('/repo', ['package.json'], ownershipMap);
  assert.equal(ok.value, true);
  const bad = checkNonScoreableOwnership('/repo', ['package.json', 'subsystem_scope_map.json'], ownershipMap);
  assert.equal(bad.value, false);
  assert.deepEqual(bad.evidence, ['subsystem_scope_map.json']);
});
