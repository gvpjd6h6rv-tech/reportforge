'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import { explainScoreDelta } from '../../tools/salad-score/scoring/score_delta_explainer.mjs';

test('explains a LOC change and reports the delta', () => {
  const before = { path: 'f.js', loc: 100, sp_file_score: 40, sp_behavior_score: 40, sp_total_score: 40, violated_rules: [] };
  const after = { path: 'f.js', loc: 90, sp_file_score: 38, sp_behavior_score: 40, sp_total_score: 39, violated_rules: [] };
  const result = explainScoreDelta(before, after);
  assert.equal(result.delta, -1);
  assert.ok(result.reasons.some((r) => r.includes('loc: 100 -> 90')));
  assert.ok(result.reasons.some((r) => r.includes('sp_file_score: 40 -> 38')));
});

test('explains resolved and newly introduced violated rules', () => {
  const before = { path: 'f.js', loc: 50, sp_file_score: 30, sp_behavior_score: 40, sp_total_score: 34, violated_rules: ['check_ownership_violation'] };
  const after = { path: 'f.js', loc: 50, sp_file_score: 30, sp_behavior_score: 15, sp_total_score: 24, violated_rules: ['check_no_minified_source'] };
  const result = explainScoreDelta(before, after);
  assert.ok(result.reasons.some((r) => r.includes('resolved rules: check_ownership_violation')));
  assert.ok(result.reasons.some((r) => r.includes('new violations: check_no_minified_source')));
});

test('never mutates the input objects', () => {
  const before = { path: 'f.js', loc: 50, sp_file_score: 30, sp_behavior_score: 40, sp_total_score: 34, violated_rules: [] };
  const after = { path: 'f.js', loc: 50, sp_file_score: 30, sp_behavior_score: 40, sp_total_score: 34, violated_rules: [] };
  const beforeCopy = JSON.parse(JSON.stringify(before));
  const afterCopy = JSON.parse(JSON.stringify(after));
  explainScoreDelta(before, after);
  assert.deepEqual(before, beforeCopy);
  assert.deepEqual(after, afterCopy);
});

test('no change produces zero delta and no reasons', () => {
  const same = { path: 'f.js', loc: 50, sp_file_score: 30, sp_behavior_score: 40, sp_total_score: 34, violated_rules: ['a'] };
  const result = explainScoreDelta(same, { ...same });
  assert.equal(result.delta, 0);
  assert.deepEqual(result.reasons, []);
});
