import test from 'node:test';
        import assert from 'node:assert/strict';

import { validateTestEvidenceRawSchema } from '../../../tools/e2r-v2/validators/validate_test_evidence_raw_schema.mjs';

test('t131_raw_schema_invalid_count_counts_records', () => {
  // Exactly one record, deliberately failing two fields at once.
  const record = {
    name: 'multi-violation-record',
    productionFile: 'engines/AlignEngine.js',
    sourcePath: 'engines/AlignEngine.js',
    evidenceStrength: 2, // invalid
    outcome: 2,          // invalid
  };

  const result = validateTestEvidenceRawSchema([record]);

  assert.ok(result.diagnostics.length >= 2);
  assert.equal(result.evidence.total, 1);
  assert.equal(result.evidence.invalid, 1);
  assert.equal(result.evidence.valid, 0);

  assert.ok(result.evidence.valid >= 0);
  assert.ok(result.evidence.invalid <= result.evidence.total);
  assert.equal(result.evidence.valid + result.evidence.invalid, result.evidence.total);
});
