'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkRoleViolation } from '../../tools/salad-score/checkers/check_role_violation.mjs';

test('checkRoleViolation — true when a "guard" file has dom-mutation responsibility', () => {
  assert.equal(checkRoleViolation('guard', ['dom-mutation']).value, true);
});

test('checkRoleViolation — false when responsibilities do not contradict the file type', () => {
  assert.equal(checkRoleViolation('engine', ['dom-mutation']).value, false);
  assert.equal(checkRoleViolation('guard', ['io']).value, false);
});
