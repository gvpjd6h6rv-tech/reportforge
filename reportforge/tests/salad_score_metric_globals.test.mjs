'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import { metricGlobals } from '../../tools/salad-score/metrics/metric_globals.mjs';

test('metricGlobals — counts distinct configured globals referenced', () => {
  const r = metricGlobals('window.x; DS.foo(); document.bar();', ['window', 'document', 'DS', 'Facade']);
  assert.equal(r.value, 3);
  assert.deepEqual(r.evidence.sort(), ['DS', 'document', 'window']);
});

test('metricGlobals — zero when none of the configured identifiers appear', () => {
  assert.equal(metricGlobals('const x = 1;', ['window']).value, 0);
});
