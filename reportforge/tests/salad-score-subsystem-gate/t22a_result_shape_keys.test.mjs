import test from 'node:test';
import assert from 'node:assert/strict';
import { checkResultShapeKeys } from '../../../tools/salad-score/subsystem-gate/contracts/check_result_shape_keys.mjs';

const VALID = {
  SUBSYSTEM_ID: 'X', ALL_OWNED_FILES: ['a.mjs'], SP_SCOREABLE_FILES: ['a.mjs'], NON_SCOREABLE_FILES: [],
  SCANNED_SCOREABLE_FILES: ['a.mjs'], MISSING_SCOREABLE_FILES: [], MISSING_NON_SCOREABLE_FILES: [],
  UNOWNED_SCOREABLE_FILES: [], UNOWNED_NON_SCOREABLE_FILES: [], OWNERSHIP_VIOLATIONS: [], HIDDEN_SIDE_EFFECTS: [], FILES_OVER_20: [],
  SP_SUBSYSTEM_SCORE: 5, CHECKS: { a: 'PASS' }, FINAL_GATE_STATUS: 'PASS',
};

test('T22A: the result must contain every required key', () => {
  assert.equal(checkResultShapeKeys(VALID).value, true);
  const { SUBSYSTEM_ID, ...missing } = VALID;
  assert.equal(checkResultShapeKeys(missing).value, false);
});
