import test from 'node:test';
import assert from 'node:assert/strict';
import { checkNoHiddenSideEffectsInScope } from '../../../tools/salad-score/subsystem-gate/checkers/check_no_hidden_side_effects_in_scope.mjs';

test('T25: a reasons array that omits check_hidden_side_effect entirely is the OFFICIAL pass representation (buildReasons filters passing rules) -- not suspect', () => {
  const r = checkNoHiddenSideEffectsInScope([{ path: 'x.mjs', owner: 'o', reasons: [] }]);
  assert.equal(r.value, true);
  assert.deepEqual(r.evidence, []);
  assert.deepEqual(r.suspectEvidence, []);
});
