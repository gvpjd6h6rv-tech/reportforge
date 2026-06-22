'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreTotal } from '../../tools/salad-score/scoring/score_total.mjs';

test('scoreTotal — applies the 0.60/0.40 file/behavior weighting', () => {
  assert.equal(scoreTotal(100, 0, { file: 0.6, behavior: 0.4 }), 60);
  assert.equal(scoreTotal(0, 100, { file: 0.6, behavior: 0.4 }), 40);
});

test('scoreTotal — rounds to the nearest integer (both directions)', () => {
  assert.equal(scoreTotal(60.5 / 0.6, 0, { file: 0.6, behavior: 0.4 }), 61);
  assert.equal(scoreTotal(60.4 / 0.6, 0, { file: 0.6, behavior: 0.4 }), 60);
});
