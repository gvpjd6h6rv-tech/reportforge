'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkGuardSingleRule } from '../../tools/salad-score/checkers/check_guard_single_rule.mjs';

test('checkGuardSingleRule — passes with exactly one export function', () => {
  assert.equal(checkGuardSingleRule('c.mjs', 'export function a() {}').value, true);
});

test('checkGuardSingleRule — fails with more than one export function', () => {
  assert.equal(checkGuardSingleRule('c.mjs', 'export function a() {}\nexport function b() {}').value, false);
});
