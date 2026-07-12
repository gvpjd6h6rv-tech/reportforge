import test from 'node:test';
import assert from 'node:assert/strict';
import { contractSubsystemResult } from '../../../tools/salad-score/subsystem-gate/contracts/contract_subsystem_result.mjs';

const VALID = {
  SUBSYSTEM_ID: 'X', ALL_OWNED_FILES: ['a.mjs'], SP_SCOREABLE_FILES: ['a.mjs'], NON_SCOREABLE_FILES: [],
  SCANNED_SCOREABLE_FILES: ['a.mjs'], MISSING_SCOREABLE_FILES: [], MISSING_NON_SCOREABLE_FILES: [],
  UNOWNED_SCOREABLE_FILES: [], UNOWNED_NON_SCOREABLE_FILES: [], OWNERSHIP_VIOLATIONS: [], HIDDEN_SIDE_EFFECTS: [], FILES_OVER_20: [],
  SP_SUBSYSTEM_SCORE: 5, CHECKS: { a: 'PASS' }, FINAL_GATE_STATUS: 'PASS',
};

test('T22F (integration, distinct from T22A-E): contract_subsystem_result orchestrates all 5 atomic checkers -- a violation of ANY one fails the aggregate', () => {
  assert.equal(contractSubsystemResult(VALID).value, true);
  assert.equal(contractSubsystemResult({ ...VALID, ALL_OWNED_FILES: ['b.mjs', 'a.mjs'] }).value, false); // unsorted
  assert.equal(contractSubsystemResult({ ...VALID, SP_SCOREABLE_FILES: [], SP_SUBSYSTEM_SCORE: 0 }).value, false); // collapsed
});
