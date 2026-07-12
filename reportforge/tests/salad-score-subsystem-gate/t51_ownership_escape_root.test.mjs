import test from 'node:test';
import assert from 'node:assert/strict';
import { checkNonScoreableOwnership } from '../../../tools/salad-score/subsystem-gate/checkers/check_non_scoreable_ownership.mjs';

test('T51: a path with ".." escaping root resolves outside root and is correctly reported as unowned (never matched by accident)', () => {
  const ownershipMap = { subsystems: [{ owner: 'owner-a', allowedFiles: ['secrets.json'] }] };
  const result = checkNonScoreableOwnership('/root/sub', ['../secrets.json'], ownershipMap);
  assert.equal(result.value, false);
  assert.equal(result.evidence[0], '../secrets.json');
});
