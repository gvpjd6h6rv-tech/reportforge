'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreFile } from '../../tools/salad-score/scoring/score_file.mjs';

test('scoreFile — weighted sum of the 9 structural metrics, capped-normalized', () => {
  const metrics = { loc: 200, complexity: 0, imports: 0, functions: 0, classes: 0, nesting: 0, responsibilities: 0, globals: 0, topLevelSideEffects: 0 };
  const weights = { loc: 1, complexity: 0, imports: 0, functions: 0, classes: 0, nesting: 0, responsibilities: 0, globals: 0, topLevelSideEffects: 0 };
  const caps = { loc: 400 };
  assert.equal(scoreFile(metrics, weights, caps), 50);
});

test('scoreFile — zero metrics produce a zero score', () => {
  const zeros = { loc: 0, complexity: 0, imports: 0, functions: 0, classes: 0, nesting: 0, responsibilities: 0, globals: 0, topLevelSideEffects: 0 };
  const weights = { loc: 0.5, complexity: 0.5 };
  assert.equal(scoreFile(zeros, weights, { loc: 400, complexity: 80 }), 0);
});
