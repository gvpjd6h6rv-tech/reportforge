'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import { metricClasses } from '../../tools/salad-score/metrics/metric_classes.mjs';

test('metricClasses — counts class declarations', () => {
  const r = metricClasses('class A {}\nclass B extends A {}');
  assert.equal(r.value, 2);
});

test('metricClasses — zero when there are none', () => {
  assert.equal(metricClasses('const x = 1;').value, 0);
});
