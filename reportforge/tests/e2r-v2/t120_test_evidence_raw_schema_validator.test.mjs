import test from 'node:test';
        import assert from 'node:assert/strict';

import { validateTestEvidenceRawSchema } from '../../../tools/e2r-v2/validators/validate_test_evidence_raw_schema.mjs';

test('t120_test_evidence_raw_schema_validator', () => {
  const valid = validateTestEvidenceRawSchema([{ name: 'alpha', productionFile: 'engines/Alpha.js', sourcePath: 'engines/Alpha.js', evidenceStrength: 'DIRECT_CALL_ASSERTION', outcome: 'PASS' }]);
  const invalid = validateTestEvidenceRawSchema([{ name: 'beta', productionFile: '/abs/Beta.js', sourcePath: '../Beta.js', evidenceStrength: 'maybe', outcome: 'unknown' }]);
  assert.equal(valid.value, true);
  assert.equal(valid.diagnostics.length, 0);
  assert.equal(invalid.value, false);
  assert.ok(invalid.diagnostics.some((entry) => entry.code === 'TEST_EVIDENCE_RAW_RECORD_INVALID_PRODUCTION_FILE'));
  assert.ok(invalid.diagnostics.some((entry) => entry.code === 'TEST_EVIDENCE_RAW_RECORD_INVALID_SOURCE_PATH'));
  assert.ok(invalid.diagnostics.some((entry) => entry.code === 'TEST_EVIDENCE_RAW_RECORD_INVALID_EVIDENCE_STRENGTH'));
  assert.ok(invalid.diagnostics.some((entry) => entry.code === 'TEST_EVIDENCE_RAW_RECORD_INVALID_OUTCOME'));
});
