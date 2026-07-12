import test from 'node:test';
import assert from 'node:assert/strict';
import { checkNonScoreableOwnership } from '../../../tools/salad-score/subsystem-gate/checkers/check_non_scoreable_ownership.mjs';

test('T47: two files with the SAME basename in DIFFERENT directories are resolved independently by canonical path -- owning one does not own the other', () => {
  const ownershipMap = { subsystems: [{ owner: 'owner-a', allowedFiles: ['repo-a/package.json'] }] };
  const homonymElsewhere = checkNonScoreableOwnership('/root', ['fixtures/repo-b/package.json'], ownershipMap);
  assert.equal(homonymElsewhere.value, false, 'a package.json owned at repo-a/package.json must NOT be confused with one at fixtures/repo-b/package.json');
});
