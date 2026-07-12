import test from 'node:test';
import assert from 'node:assert/strict';
import { checkResultNoEmptyScopePass } from '../../../tools/salad-score/subsystem-gate/contracts/check_result_no_empty_scope_pass.mjs';

test('T22E: an empty DECLARED_FILES set must never yield FINAL_GATE_STATUS=PASS', () => {
  assert.equal(checkResultNoEmptyScopePass({ ALL_OWNED_FILES: [], FINAL_GATE_STATUS: 'FAIL' }).value, true);
  assert.equal(checkResultNoEmptyScopePass({ ALL_OWNED_FILES: [], FINAL_GATE_STATUS: 'PASS' }).value, false);
  assert.equal(checkResultNoEmptyScopePass({ ALL_OWNED_FILES: ['a.mjs'], FINAL_GATE_STATUS: 'PASS' }).value, true);
});
