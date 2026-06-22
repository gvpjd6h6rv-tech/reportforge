'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import { metricFunctions } from '../../tools/salad-score/metrics/metric_functions.mjs';

test('metricFunctions — counts function keyword + arrow occurrences', () => {
  const text = 'function a(){} const b = () => 1; const c = (x) => x + 1;';
  assert.equal(metricFunctions(text).value, 3);
});
