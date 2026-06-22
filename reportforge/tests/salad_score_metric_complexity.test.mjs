'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import { metricComplexity } from '../../tools/salad-score/metrics/metric_complexity.mjs';

test('metricComplexity — reuses the real audit/architecture/count_decision_points.mjs primitive', () => {
  const r = metricComplexity('if (a) { for (b) {} }');
  assert.equal(r.value, 2);
});
