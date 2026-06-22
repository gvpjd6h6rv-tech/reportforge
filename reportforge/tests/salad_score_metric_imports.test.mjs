'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import { metricImports } from '../../tools/salad-score/metrics/metric_imports.mjs';

test('metricImports — counts import-from and require() statements', () => {
  const text = `import { a } from 'a.mjs';\nconst b = require('b.js');\n`;
  const r = metricImports(text);
  assert.equal(r.value, 2);
  assert.equal(r.evidence.length, 2);
});

test('metricImports — zero for a file with no imports', () => {
  assert.equal(metricImports('const x = 1;').value, 0);
});
