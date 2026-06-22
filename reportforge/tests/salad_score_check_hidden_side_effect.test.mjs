'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkHiddenSideEffect } from '../../tools/salad-score/checkers/check_hidden_side_effect.mjs';

test('checkHiddenSideEffect — true and forwards evidence when metric_top_level_side_effects found at least one', () => {
  const r = checkHiddenSideEffect({ value: 2, evidence: ['L1: window.x = 1'] });
  assert.equal(r.value, true);
  assert.deepEqual(r.evidence, ['L1: window.x = 1']);
});

test('checkHiddenSideEffect — false when the metric found none', () => {
  assert.equal(checkHiddenSideEffect({ value: 0, evidence: [] }).value, false);
});
