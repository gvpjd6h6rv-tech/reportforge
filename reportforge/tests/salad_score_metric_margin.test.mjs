'use strict';
import test   from 'node:test';
import assert from 'node:assert/strict';
import {
  marginForCappedMetric,
  marginForBaselineScore,
  computeFileMetricMargins,
} from '../../tools/salad-score/scoring/metric_margin.mjs';
import { METRIC_MARGIN_POLICY } from '../../tools/salad-score/scoring/metric_margin_policy.mjs';

// ── marginForCappedMetric — large-metric rule: OK<=floor(limit*0.90), WARNING<=limit, FAIL>limit ──

test('LOC 360/400 -> OK', () => {
  assert.equal(marginForCappedMetric(360, 400).status, 'OK');
});
test('LOC 361/400 -> WARNING', () => {
  assert.equal(marginForCappedMetric(361, 400).status, 'WARNING');
});
test('LOC 401/400 -> FAIL', () => {
  assert.equal(marginForCappedMetric(401, 400).status, 'FAIL');
});

test('capped metric with no limit -> NOT_APPLICABLE', () => {
  assert.equal(marginForCappedMetric(50, null).status, 'NOT_APPLICABLE');
  assert.equal(marginForCappedMetric(50, undefined).status, 'NOT_APPLICABLE');
});
test('capped metric with a non-numeric value but a valid limit -> UNKNOWN', () => {
  assert.equal(marginForCappedMetric(NaN, 400).status, 'UNKNOWN');
  assert.equal(marginForCappedMetric(undefined, 400).status, 'UNKNOWN');
});

// ── marginForBaselineScore — tiered by baseline magnitude ──────────────────────

test('Score 10/11 -> OK (baseline<20: okTarget=baseline-1)', () => {
  assert.equal(marginForBaselineScore(10, 11).status, 'OK');
});
test('Score 11/11 -> WARNING', () => {
  assert.equal(marginForBaselineScore(11, 11).status, 'WARNING');
});
test('Score 12/11 -> FAIL', () => {
  assert.equal(marginForBaselineScore(12, 11).status, 'FAIL');
});

test('Score 23/25 -> OK (baseline 20-39: okTarget=baseline-2)', () => {
  assert.equal(marginForBaselineScore(23, 25).status, 'OK');
});
test('Score 24/25 -> WARNING', () => {
  assert.equal(marginForBaselineScore(24, 25).status, 'WARNING');
});
test('Score 26/25 -> FAIL', () => {
  assert.equal(marginForBaselineScore(26, 25).status, 'FAIL');
});

test('Score 36/40 -> OK (baseline>=40: okTarget=floor(baseline*0.90))', () => {
  assert.equal(marginForBaselineScore(36, 40).status, 'OK');
});
test('Score 37/40 -> WARNING', () => {
  assert.equal(marginForBaselineScore(37, 40).status, 'WARNING');
});
test('Score 41/40 -> FAIL', () => {
  assert.equal(marginForBaselineScore(41, 40).status, 'FAIL');
});

test('sin baseline -> NOT_APPLICABLE (never invents a baseline)', () => {
  assert.equal(marginForBaselineScore(30, null).status, 'NOT_APPLICABLE');
  assert.equal(marginForBaselineScore(30, undefined).status, 'NOT_APPLICABLE');
});
test('baseline present but score not a number -> UNKNOWN', () => {
  assert.equal(marginForBaselineScore(NaN, 30).status, 'UNKNOWN');
});

// ── neither function ever returns STRUCTURAL_WARNING ───────────────────────────

test('STRUCTURAL_WARNING is never auto-assigned by either pure classifier', () => {
  const statuses = new Set();
  for (const v of [0, 1, 50, 100, 400, 1000]) {
    for (const l of [0, 1, 50, 100, 400, null, undefined, NaN]) {
      statuses.add(marginForCappedMetric(v, l).status);
      statuses.add(marginForBaselineScore(v, l).status);
    }
  }
  assert.equal(statuses.has('STRUCTURAL_WARNING'), false);
});

// ── computeFileMetricMargins — applies METRIC_MARGIN_POLICY to one file's values ──

const CAPS = { loc: 400, complexity: 80, nesting: 6 };

test('computeFileMetricMargins covers every policy entry, one result per key', () => {
  const values = {
    loc: 100, loc_normalized: 120, complexity: 20, nesting: 3,
    sp_file_score: 40, sp_behavior_score: 15, sp_total_score: 28, bytes: null,
  };
  const margins = computeFileMetricMargins(values, METRIC_MARGIN_POLICY, CAPS, 30);
  assert.equal(margins.length, METRIC_MARGIN_POLICY.length);
  assert.deepEqual(margins.map((m) => m.key).sort(), METRIC_MARGIN_POLICY.map((e) => e.key).sort());
});

test('computeFileMetricMargins: bytes has no cap in config -> NOT_APPLICABLE', () => {
  const values = { loc: 1, loc_normalized: 1, complexity: 1, nesting: 1, sp_file_score: 1, sp_behavior_score: 1, sp_total_score: 1, bytes: 12345 };
  const margins = computeFileMetricMargins(values, METRIC_MARGIN_POLICY, CAPS, 1);
  const bytes = margins.find((m) => m.key === 'bytes');
  assert.equal(bytes.status, 'NOT_APPLICABLE');
});

test('computeFileMetricMargins: sp_total_score with no registered baseline -> NOT_APPLICABLE', () => {
  const values = { loc: 1, loc_normalized: 1, complexity: 1, nesting: 1, sp_file_score: 1, sp_behavior_score: 1, sp_total_score: 31, bytes: null };
  const margins = computeFileMetricMargins(values, METRIC_MARGIN_POLICY, CAPS, undefined);
  const sp = margins.find((m) => m.key === 'sp_total_score');
  assert.equal(sp.status, 'NOT_APPLICABLE');
});

test('computeFileMetricMargins: sp_file_score/sp_behavior_score use fixedLimit=100 (contract_scorer [0,100]), not a config cap', () => {
  const values = { loc: 1, loc_normalized: 1, complexity: 1, nesting: 1, sp_file_score: 92, sp_behavior_score: 88, sp_total_score: 1, bytes: null };
  const margins = computeFileMetricMargins(values, METRIC_MARGIN_POLICY, CAPS, 1);
  const file = margins.find((m) => m.key === 'sp_file_score');
  const behavior = margins.find((m) => m.key === 'sp_behavior_score');
  assert.equal(file.limit, 100);
  assert.equal(file.status, 'WARNING'); // 92 > floor(100*0.90)=90, <=100
  assert.equal(behavior.limit, 100);
  assert.equal(behavior.status, 'OK'); // 88 <= floor(100*0.90)=90
});
