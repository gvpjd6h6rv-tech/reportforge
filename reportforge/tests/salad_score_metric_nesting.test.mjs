'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import { metricNesting } from '../../tools/salad-score/metrics/metric_nesting.mjs';

test('metricNesting — measures max brace depth', () => {
  assert.equal(metricNesting('{ { { } } }').value, 3);
});

test('metricNesting — never goes negative on unbalanced closing braces', () => {
  assert.equal(metricNesting('} } {').value, 1);
});
