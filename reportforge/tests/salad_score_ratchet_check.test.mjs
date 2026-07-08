'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkRatchet } from '../../tools/salad-score/ci/salad_score_ratchet_check.mjs';

test('salad_score_ratchet_detects_regression — a file scoring worse than baseline is flagged', () => {
  const current = [{ path: 'a.js', sp_total_score: 40 }];
  const baseline = { 'a.js': 20 };
  const result = checkRatchet(current, baseline);
  assert.equal(result.ok, false);
  assert.equal(result.regressions.length, 1);
  assert.equal(result.regressions[0].path, 'a.js');
  assert.equal(result.regressions[0].before, 20);
  assert.equal(result.regressions[0].after, 40);
  assert.equal(result.regressions[0].delta, 20);
});

test('salad_score_ratchet_allows_improvement — a file scoring better than baseline is not flagged', () => {
  const current = [{ path: 'a.js', sp_total_score: 10 }];
  const baseline = { 'a.js': 20 };
  const result = checkRatchet(current, baseline);
  assert.equal(result.ok, true);
  assert.equal(result.regressions.length, 0);
  assert.equal(result.improvements.length, 1);
});

test('salad_score_ratchet_allows_unchanged_score — an identical score is not flagged', () => {
  const current = [{ path: 'a.js', sp_total_score: 20 }];
  const baseline = { 'a.js': 20 };
  const result = checkRatchet(current, baseline);
  assert.equal(result.ok, true);
  assert.equal(result.regressions.length, 0);
  assert.equal(result.improvements.length, 0);
});

test('salad_score_ratchet_allows_new_file — a file absent from baseline is not flagged, listed as new', () => {
  const current = [{ path: 'brand-new.js', sp_total_score: 90 }];
  const baseline = {};
  const result = checkRatchet(current, baseline);
  assert.equal(result.ok, true);
  assert.equal(result.regressions.length, 0);
  assert.equal(result.newFiles.length, 1);
  assert.equal(result.newFiles[0].path, 'brand-new.js');
});

test('salad_score_ratchet_is_not_a_hard_ceiling — a pre-existing bad score with no change never fails on its own', () => {
  // The whole point of a ratchet vs. a hard --max-score gate: a file that
  // was already at 95 and stays at 95 must NOT fail the build.
  const current = [{ path: 'already-bad.js', sp_total_score: 95 }];
  const baseline = { 'already-bad.js': 95 };
  const result = checkRatchet(current, baseline);
  assert.equal(result.ok, true);
});

test('salad_score_ratchet respects a tolerance when explicitly given', () => {
  const current = [{ path: 'a.js', sp_total_score: 22 }];
  const baseline = { 'a.js': 20 };
  const strict = checkRatchet(current, baseline, 0);
  const tolerant = checkRatchet(current, baseline, 5);
  assert.equal(strict.ok, false);
  assert.equal(tolerant.ok, true);
});
