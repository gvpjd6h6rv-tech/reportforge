'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import { reporterJson } from '../../tools/salad-score/reporters/reporter_json.mjs';

test('reporterJson — produces valid JSON with repoScore, filesScanned, generatedAt, files', () => {
  const parsed = JSON.parse(reporterJson([{ path: 'a.js' }], 12.5, 1));
  assert.equal(parsed.repoScore, 12.5);
  assert.equal(parsed.filesScanned, 1);
  assert.ok(parsed.generatedAt);
  assert.equal(parsed.files.length, 1);
});
