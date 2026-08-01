
'use strict';

import path from 'node:path';
import { buildEvidenceStage } from './build_evidence_stage.mjs';
import { collectTestEvidenceRecords } from '../collectors/collect_test_evidence_records.mjs';
import { collectTestEvidenceRelations } from '../collectors/collect_test_evidence_relations.mjs';
import { validateTestEvidenceRawSchema } from '../validators/validate_test_evidence_raw_schema.mjs';
import { checkTestEvidenceDuplicateRecords } from '../validators/check_test_evidence_duplicate_records.mjs';
import { checkTestEvidenceAmbiguousRelations } from '../validators/check_test_evidence_ambiguous_relations.mjs';
import { persistTestEvidenceRecords } from '../io/persist_test_evidence_records.mjs';
import { loadTestEvidenceRecords } from '../io/load_test_evidence_records.mjs';

export async function buildTestEvidenceStage({ root, physical, scoreResult, capabilityMap, testEvidenceRecords = null, auditPath = null } = {}) {
  const targetPath = path.resolve(root || process.cwd(), auditPath || 'audit/test_evidence_records.json');
  const produced = collectTestEvidenceRecords({ capabilityMap, records: testEvidenceRecords });
  const rawSchema = validateTestEvidenceRawSchema(produced.rawRecords);
  const duplicateGuard = checkTestEvidenceDuplicateRecords(produced.records);
  const ambiguityGuard = checkTestEvidenceAmbiguousRelations(produced.records);
  const relations = collectTestEvidenceRelations(produced.records);
  const persisted = persistTestEvidenceRecords(produced.records, targetPath);
  const loaded = loadTestEvidenceRecords(targetPath);
  const canonicalRecords = loaded.records.length > 0 ? loaded.records : produced.records;
  const baseEvidence = await buildEvidenceStage({ root, physical, scoreResult, testEvidenceRecords: canonicalRecords });
  const diagnostics = [
    ...(rawSchema.diagnostics || []),
    ...(duplicateGuard.diagnostics || []),
    ...(ambiguityGuard.diagnostics || []),
    ...(loaded.diagnostics || []),
    ...(relations.diagnostics || []),
  ];
  return {
    ...baseEvidence,
    authoritativeTestEvidencePath: targetPath,
    rawTestEvidenceRecords: produced.rawRecords,
    canonicalTestEvidenceRecords: produced.records,
    testEvidenceRecords: canonicalRecords,
    testEvidenceRelations: relations,
    rawSchema,
    duplicateGuard,
    ambiguityGuard,
    persistence: persisted,
    loaded,
    diagnostics,
  };
}
