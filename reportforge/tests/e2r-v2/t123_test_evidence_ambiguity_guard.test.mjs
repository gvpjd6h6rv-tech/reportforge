import test from 'node:test';
        import assert from 'node:assert/strict';

import { checkTestEvidenceAmbiguousRelations } from '../../../tools/e2r-v2/validators/check_test_evidence_ambiguous_relations.mjs';

test('t123_test_evidence_ambiguity_guard', () => {
  const result = checkTestEvidenceAmbiguousRelations([
    { name: 'alpha', productionFile: 'engines/Alpha.js', sourcePath: 'tests/Alpha.test.mjs', evidenceStrength: 1, outcome: 1 },
    { name: 'alpha', productionFile: 'engines/Alpha.js', sourcePath: 'tests/Alpha.alt.mjs', evidenceStrength: 1, outcome: 1 },
  ]);
  assert.equal(result.value, false);
  assert.equal(result.evidence.ambiguousProductionFileCount, 1);
  assert.ok(result.diagnostics.some((entry) => entry.code === 'TEST_EVIDENCE_RELATION_AMBIGUOUS'));
});
