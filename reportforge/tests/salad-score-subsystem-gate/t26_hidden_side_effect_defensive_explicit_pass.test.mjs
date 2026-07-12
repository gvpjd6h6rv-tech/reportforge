import test from 'node:test';
import assert from 'node:assert/strict';
import { checkNoHiddenSideEffectsInScope } from '../../../tools/salad-score/subsystem-gate/checkers/check_no_hidden_side_effects_in_scope.mjs';

test('T26: DEFENSIVE (not the current real shape, since buildReasons omits passing rules): if a reasons entry ever explicitly carries pass=true, the checker must not treat it as a violation', () => {
  const r = checkNoHiddenSideEffectsInScope([{ path: 'x.mjs', owner: 'o', reasons: [{ rule: 'check_hidden_side_effect', pass: true }] }]);
  assert.equal(r.value, true);
  assert.deepEqual(r.evidence, []);
});
