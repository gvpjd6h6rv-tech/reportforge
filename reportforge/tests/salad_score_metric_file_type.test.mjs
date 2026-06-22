'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import { metricFileType } from '../../tools/salad-score/metrics/metric_file_type.mjs';

test('metricFileType — classifies by path pattern', () => {
  assert.equal(metricFileType('/repo/engines/X.js'), 'engine');
  assert.equal(metricFileType('/repo/tools/Y.js'), 'tool');
  assert.equal(metricFileType('/repo/reportforge/tests/z.test.mjs'), 'test');
  assert.equal(metricFileType('/repo/audit/guard.mjs'), 'guard');
  assert.equal(metricFileType('/repo/some.config.json'), 'config');
  assert.equal(metricFileType('/repo/unknown/file.js'), 'other');
});
