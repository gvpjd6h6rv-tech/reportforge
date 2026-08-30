import test from 'node:test';
        import assert from 'node:assert/strict';

import { collectTestEvidenceRecords } from '../../../tools/e2r-v2/collectors/collect_test_evidence_records.mjs';
import { collectTestEvidenceRelations } from '../../../tools/e2r-v2/collectors/collect_test_evidence_relations.mjs';

test('t121_test_evidence_relation_contract', () => {
  const records = collectTestEvidenceRecords({ records: [
    { name: 'alpha', productionFile: 'engines/Alpha.js', sourcePath: 'engines/Alpha.js', evidenceStrength: 'DIRECT_CALL_ASSERTION', outcome: 'PASS' },
    { name: 'beta', productionFile: 'engines/Beta.js', sourcePath: 'engines/Beta.js', evidenceStrength: 'DIRECT_CALL_ASSERTION', outcome: 'PASS' },
  ] }).records;
  const relations = collectTestEvidenceRelations(records);
  assert.equal(relations.relationCount, 2);
  assert.equal(relations.exactMatchCount, 2);
  assert.equal(relations.byProductionFile['engines/Alpha.js'].length, 1);
  assert.equal(relations.bySourcePath['engines/Beta.js'].length, 1);
  assert.deepEqual(relations.byProductionFile['engines/Alpha.js'][0].productionFile, 'engines/Alpha.js');
  assert.deepEqual(relations.bySourcePath['engines/Beta.js'][0].sourcePath, 'engines/Beta.js');
});
