'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import { metricTopLevelSideEffects } from '../../tools/salad-score/metrics/metric_top_level_side_effects.mjs';

test('metricTopLevelSideEffects — flags a module-top-level window assignment (real BuildDebugPanel.js pattern)', () => {
  const text = `window.RF_BUILD_INFO = {\n  commit: 'x'\n};\n`;
  const r = metricTopLevelSideEffects(text);
  assert.equal(r.value, 1);
  assert.match(r.evidence[0], /L1/);
});

test('metricTopLevelSideEffects — does NOT flag the same pattern inside a function body', () => {
  const text = `function init() {\n  window.RF_BUILD_INFO = {};\n}\n`;
  assert.equal(metricTopLevelSideEffects(text).value, 0);
});
