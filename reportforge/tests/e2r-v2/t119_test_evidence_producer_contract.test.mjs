import test from 'node:test';
        import assert from 'node:assert/strict';

import { collectTestEvidenceRecords } from '../../../tools/e2r-v2/collectors/collect_test_evidence_records.mjs';

test('t119_test_evidence_producer_contract', () => {
  const result = collectTestEvidenceRecords({
    records: [
      {
        name: 'alpha-contract',
        productionFile: 'engines/Alpha.js',
        sourcePath: 'engines/Alpha.js',
        evidenceStrength: 'DIRECT_CALL_ASSERTION',
        outcome: 'PASS',
      },
      {
        testName: 'beta-contract',
        file: 'engines/Beta.js',
        source: 'engines/Beta.js',
        strength: 'RUNTIME_TRACE',
        status: 'PASSING',
      },
    ],
  });
  assert.equal(result.records.length, 2);
  assert.deepEqual(result.records[0], {
    name: 'alpha-contract',
    productionFile: 'engines/Alpha.js',
    sourcePath: 'engines/Alpha.js',
    evidenceStrength: 1,
    outcome: 1,
  });
  assert.deepEqual(result.records[1], {
    name: 'beta-contract',
    productionFile: 'engines/Beta.js',
    sourcePath: 'engines/Beta.js',
    evidenceStrength: 1,
    outcome: 1,
  });
  assert.equal(result.byPath['engines/Alpha.js'].length, 1);
  assert.equal(result.byPath['engines/Beta.js'].length, 1);
  assert.equal(result.status, 'COMPLETE');
});
