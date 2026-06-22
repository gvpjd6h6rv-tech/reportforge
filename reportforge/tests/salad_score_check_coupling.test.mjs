'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkCoupling } from '../../tools/salad-score/checkers/check_coupling.mjs';

test('checkCoupling — returns the raw import count as the magnitude value', () => {
  assert.equal(checkCoupling(7, 10).value, 7);
});

test('checkCoupling — emits evidence only when the count exceeds the cap', () => {
  assert.deepEqual(checkCoupling(3, 10).evidence, []);
  assert.equal(checkCoupling(15, 10).evidence.length, 1);
});
