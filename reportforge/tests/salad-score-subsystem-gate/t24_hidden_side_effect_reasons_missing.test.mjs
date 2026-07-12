import test from 'node:test';
import assert from 'node:assert/strict';
import { checkNoHiddenSideEffectsInScope } from '../../../tools/salad-score/subsystem-gate/checkers/check_no_hidden_side_effects_in_scope.mjs';

test('T24: a scoped result with NO reasons array at all fails (never silently PASS)', () => {
  const r = checkNoHiddenSideEffectsInScope([{ path: 'x.mjs', owner: 'o' /* no reasons key */ }]);
  assert.equal(r.value, false);
  assert.deepEqual(r.suspectEvidence, ['x.mjs']);
});
