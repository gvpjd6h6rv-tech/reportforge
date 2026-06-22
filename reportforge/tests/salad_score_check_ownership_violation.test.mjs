'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkOwnershipViolation } from '../../tools/salad-score/checkers/check_ownership_violation.mjs';

test('checkOwnershipViolation — true when owner is "unowned"', () => {
  assert.equal(checkOwnershipViolation('unowned').value, true);
});

test('checkOwnershipViolation — false when owner is claimed', () => {
  assert.equal(checkOwnershipViolation('designer-runtime/document-state').value, false);
});
