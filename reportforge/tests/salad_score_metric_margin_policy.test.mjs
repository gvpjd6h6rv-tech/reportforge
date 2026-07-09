'use strict';
import test   from 'node:test';
import assert from 'node:assert/strict';
import { METRIC_MARGIN_POLICY } from '../../tools/salad-score/scoring/metric_margin_policy.mjs';

const REQUIRED_KEYS = [
  'loc', 'loc_normalized', 'sp_total_score', 'complexity', 'nesting',
  'sp_behavior_score', 'sp_file_score', 'bytes',
];

test('METRIC_MARGIN_POLICY covers the minimum required metric set', () => {
  const keys = METRIC_MARGIN_POLICY.map((e) => e.key);
  for (const required of REQUIRED_KEYS) assert.ok(keys.includes(required), `missing policy entry for ${required}`);
});

test('METRIC_MARGIN_POLICY — every entry has a valid kind and a label', () => {
  for (const entry of METRIC_MARGIN_POLICY) {
    assert.ok(['capped', 'baseline'].includes(entry.kind), `${entry.key}: invalid kind`);
    assert.equal(typeof entry.label, 'string');
    assert.ok(entry.label.length > 0);
  }
});

test('METRIC_MARGIN_POLICY — only sp_total_score uses the baseline rule', () => {
  const baselineEntries = METRIC_MARGIN_POLICY.filter((e) => e.kind === 'baseline');
  assert.deepEqual(baselineEntries.map((e) => e.key), ['sp_total_score']);
});
