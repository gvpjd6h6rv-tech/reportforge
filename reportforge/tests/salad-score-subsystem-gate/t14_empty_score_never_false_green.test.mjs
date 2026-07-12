import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateSubsystemScore } from '../../../tools/salad-score/subsystem-gate/scoring/calculate_subsystem_score.mjs';

test('T14: scoring an empty scoped set throws instead of silently returning 0/PASS', () => {
  assert.throws(() => calculateSubsystemScore([]), /SUBSYSTEM_SCOPE_RESULT_EMPTY/);
});
