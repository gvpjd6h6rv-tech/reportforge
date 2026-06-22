'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import { metricLoc } from '../../tools/salad-score/metrics/metric_loc.mjs';

test('metricLoc — counts lines via the real audit/architecture/count_lines.mjs primitive', () => {
  const r = metricLoc('a\nb\nc');
  assert.equal(r.value, 3);
  assert.deepEqual(r.evidence, []);
});
