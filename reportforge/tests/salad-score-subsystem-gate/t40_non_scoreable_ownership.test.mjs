import test from 'node:test';
import assert from 'node:assert/strict';
import { checkNonScoreableOwnership } from '../../../tools/salad-score/subsystem-gate/checkers/check_non_scoreable_ownership.mjs';

test('T40: non-scoreable ownership accepts exact allowedPaths and legacy allowedFiles without basename leakage', () => {
  const ownershipMap = {
    subsystems: [
      { id: 'legacy', owner: 'repository-package-manifest', allowedFiles: ['package.json'] },
      { id: 'exact', owner: 'exact-owner', allowedPaths: ['audit/subsystem_scope_map.json'] },
    ],
  };
  const ok = checkNonScoreableOwnership('/repo', ['package.json'], ownershipMap);
  assert.equal(ok.value, true);
  const exact = checkNonScoreableOwnership('/repo', ['/repo/audit/subsystem_scope_map.json'], ownershipMap);
  assert.equal(exact.value, true);
  const homonym = checkNonScoreableOwnership('/repo', ['fixtures/subsystem_scope_map.json'], ownershipMap);
  assert.equal(homonym.value, false);
  const bad = checkNonScoreableOwnership('/repo', ['package.json', 'subsystem_scope_map.json'], ownershipMap);
  assert.equal(bad.value, false);
  assert.deepEqual(bad.evidence, ['subsystem_scope_map.json']);
  const conflicting = checkNonScoreableOwnership('/repo', ['audit/subsystem_scope_map.json'], {
    subsystems: [
      { owner: 'one', allowedPaths: ['audit/subsystem_scope_map.json'] },
      { owner: 'two', allowedPaths: ['audit/subsystem_scope_map.json'] },
    ],
  });
  assert.equal(conflicting.value, false);
});
