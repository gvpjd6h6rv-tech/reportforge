import test from 'node:test';
import assert from 'node:assert/strict';
import { checkResultNotObservablePreserved } from '../../../tools/salad-score/subsystem-gate/contracts/check_result_not_observable_preserved.mjs';

test('T22D: SP_SUBSYSTEM_SCORE must never collapse to a falsy value when the scoreable set is empty', () => {
  assert.equal(checkResultNotObservablePreserved({ SP_SCOREABLE_FILES: [], SP_SUBSYSTEM_SCORE: 'NOT_OBSERVABLE: reason' }).value, true);
  assert.equal(checkResultNotObservablePreserved({ SP_SCOREABLE_FILES: [], SP_SUBSYSTEM_SCORE: 0 }).value, false);
  assert.equal(checkResultNotObservablePreserved({ SP_SCOREABLE_FILES: ['a.mjs'], SP_SUBSYSTEM_SCORE: 0 }).value, true);
});
