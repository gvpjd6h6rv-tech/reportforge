'use strict';

import { normalizeTestEvidenceRecord } from './normalize_test_evidence_records.mjs';

function normalizeRecord(record) {
  const normalized = normalizeTestEvidenceRecord(record);
  return {
    name: normalized.name || String(normalized.sourcePath).split('/').pop() || '',
    productionFile: normalized.productionFile,
    sourcePath: normalized.sourcePath,
    evidenceStrength: normalized.evidenceStrength,
    outcome: normalized.outcome,
  };
}

function indexByPath(records) {
  return records.reduce((byPath, record) => {
    const key = record.productionFile || record.sourcePath || '';
    if (key) (byPath[key] ||= []).push(record);
    return byPath;
  }, Object.create(null));
}

export function collectTestEvidenceRecords(input = {}) {
  const options = Array.isArray(input) ? { records: input } : input || {};
  // Capability-map membership is metadata, never execution evidence (P1
  // contract): a file is never turned into a synthetic passing record just
  // because it is classified GEOMETRY_MEMBER. Only explicit records supplied
  // by the caller become raw records; their absence means no records, not a
  // fabricated substitute.
  const rawRecords = Array.isArray(options.records)
    ? options.records.map(normalizeRecord)
    : [];
  const records = rawRecords.map(normalizeRecord);
  return {
    rawRecords,
    records,
    canonicalRecords: records,
    byPath: indexByPath(records),
    recordCount: records.length,
    observedCount: records.length,
    missingCount: 0,
    status: records.length ? 'COMPLETE' : 'NOT_OBSERVABLE',
    diagnostics: [],
  };
}

export { normalizeRecord as canonicalizeTestEvidenceRecord, normalizeRecord as normalizeTestEvidenceRecord };
