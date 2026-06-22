'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidFileResult, REQUIRED_FIELDS } from '../../tools/salad-score/contracts/contract_file_result.mjs';

const VALID = {
  path: 'a.js', owner: 'unowned', file_type: 'engine', loc: 10,
  responsibilities_detected: [], sp_file_score: 0, sp_behavior_score: 0, sp_total_score: 0,
  level: 'limpio', reasons: [], suggested_split: [], violated_rules: [], evidence: [],
};

test('isValidFileResult — accepts a fully-formed result', () => {
  assert.equal(isValidFileResult(VALID), true);
});

test('isValidFileResult — rejects a result missing any required field', () => {
  for (const field of REQUIRED_FIELDS) {
    const broken = { ...VALID };
    delete broken[field];
    assert.equal(isValidFileResult(broken), false, `should reject missing ${field}`);
  }
});

test('isValidFileResult — rejects reasons entries without rule/message/evidence', () => {
  assert.equal(isValidFileResult({ ...VALID, reasons: [{ rule: 'x' }] }), false);
});
