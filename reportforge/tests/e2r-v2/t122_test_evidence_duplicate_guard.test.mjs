import test from 'node:test';
        import assert from 'node:assert/strict';

import { checkTestEvidenceDuplicateRecords } from '../../../tools/e2r-v2/validators/check_test_evidence_duplicate_records.mjs';

test('t122_test_evidence_duplicate_guard', () => {
  const records = [
    { name: 'alpha', productionFile: 'engines/Alpha.js', sourcePath: 'engines/Alpha.js', evidenceStrength: 1, outcome: 1 },
    { name: 'alpha', productionFile: 'engines/Alpha.js', sourcePath: 'engines/Alpha.js', evidenceStrength: 1, outcome: 1 },
  ];
  const result = checkTestEvidenceDuplicateRecords(records);
  assert.equal(result.value, false);
  assert.equal(result.evidence.duplicateCount, 1);
  assert.equal(result.diagnostics[0].code, 'TEST_EVIDENCE_DUPLICATE_RECORD');
});
