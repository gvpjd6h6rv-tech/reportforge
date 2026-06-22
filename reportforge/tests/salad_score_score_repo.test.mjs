'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreRepo } from '../../tools/salad-score/scoring/score_repo.mjs';

test('scoreRepo — LOC-weighted average of sp_total_score', () => {
  const files = [
    { sp_total_score: 0, loc: 100 },
    { sp_total_score: 100, loc: 300 },
  ];
  // (0*100 + 100*300) / (100+300) = 75
  assert.equal(scoreRepo(files), 75);
});

test('scoreRepo — zero when there are no files (no division by zero)', () => {
  assert.equal(scoreRepo([]), 0);
});
