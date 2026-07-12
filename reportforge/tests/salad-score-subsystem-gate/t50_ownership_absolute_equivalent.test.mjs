import test from 'node:test';
import assert from 'node:assert/strict';
import { checkNonScoreableOwnership } from '../../../tools/salad-score/subsystem-gate/checkers/check_non_scoreable_ownership.mjs';

test('T50: an ABSOLUTE path equivalent to root+relative resolves to the same canonical form', () => {
  const ownershipMap = { subsystems: [{ owner: 'owner-a', allowedFiles: ['audit/subsystem_scope_map.json'] }] };
  const result = checkNonScoreableOwnership('/root', ['/root/audit/subsystem_scope_map.json'], ownershipMap);
  assert.equal(result.value, true);
});
