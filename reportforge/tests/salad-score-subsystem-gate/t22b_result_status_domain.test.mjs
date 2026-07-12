import test from 'node:test';
import assert from 'node:assert/strict';
import { checkResultStatusDomain } from '../../../tools/salad-score/subsystem-gate/contracts/check_result_status_domain.mjs';

test('T22B: FINAL_GATE_STATUS and every CHECKS entry must be PASS or FAIL only', () => {
  assert.equal(checkResultStatusDomain({ CHECKS: { a: 'PASS' }, FINAL_GATE_STATUS: 'PASS' }).value, true);
  assert.equal(checkResultStatusDomain({ CHECKS: { a: 'MAYBE' }, FINAL_GATE_STATUS: 'PASS' }).value, false);
  assert.equal(checkResultStatusDomain({ CHECKS: {}, FINAL_GATE_STATUS: 'ERROR' }).value, false);
});
