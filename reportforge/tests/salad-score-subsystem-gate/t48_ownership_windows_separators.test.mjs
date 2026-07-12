import test from 'node:test';
import assert from 'node:assert/strict';
import { checkNonScoreableOwnership } from '../../../tools/salad-score/subsystem-gate/checkers/check_non_scoreable_ownership.mjs';

test('T48: a path using Windows backslash separators resolves to the same canonical form as its forward-slash equivalent', () => {
  const ownershipMap = { subsystems: [{ owner: 'owner-a', allowedFiles: ['audit/subsystem_scope_map.json'] }] };
  const result = checkNonScoreableOwnership('/root', ['audit\\subsystem_scope_map.json'], ownershipMap);
  assert.equal(result.value, true);
});
