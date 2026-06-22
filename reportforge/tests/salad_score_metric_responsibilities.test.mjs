'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import { metricResponsibilities } from '../../tools/salad-score/metrics/metric_responsibilities.mjs';

test('metricResponsibilities — detects io, dom-mutation, state-mutation, event-wiring categories', () => {
  const text = `
    fs.readFileSync('x');
    window.X = 1;
    DS.setSnapToGrid(true, 's');
    document.addEventListener('keydown', () => {});
  `;
  const r = metricResponsibilities(text);
  assert.ok(r.value.includes('io'));
  assert.ok(r.value.includes('dom-mutation'));
  assert.ok(r.value.includes('state-mutation'));
  assert.ok(r.value.includes('event-wiring'));
});

test('metricResponsibilities — adds business-logic only above the function-count threshold', () => {
  const many = Array.from({ length: 6 }, (_, i) => `function f${i}(){}`).join('\n');
  assert.ok(metricResponsibilities(many).value.includes('business-logic'));
  assert.ok(!metricResponsibilities('function f0(){}').value.includes('business-logic'));
});

test('metricResponsibilities — returns an array, not a count', () => {
  assert.ok(Array.isArray(metricResponsibilities('const x = 1;').value));
});
