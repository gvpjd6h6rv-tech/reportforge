import test from 'node:test';
import assert from 'node:assert/strict';

import fs from 'node:fs';
import { collectFileTestEvidence } from '../../../tools/e2r-v2/collectors/collect_file_test_evidence.mjs';

test('test evidence fixture has 14 cases', () => {
  const fixture = JSON.parse(fs.readFileSync('reportforge/tests/e2r-v2/fixtures/test_evidence_14_cases.json', 'utf8'));
  assert.equal(fixture.cases.length, 14);
  assert.equal(collectFileTestEvidence(fixture.cases).canonicalExecutionCount, 14);
});
