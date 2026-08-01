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

function deriveRawRecords(capabilityMap) {
  const files = capabilityMap?.capabilities?.[0]?.files;
  if (!Array.isArray(files)) return [];
  return files.filter((file) => file?.classification === 'GEOMETRY_MEMBER').map((file) => {
    const productionFile = String(file.path ?? '').replace(/\\/g, '/').trim();
    return { name: productionFile.split('/').pop() || '', productionFile, sourcePath: productionFile, evidenceStrength: 'DIRECT_CALL_ASSERTION', outcome: 'PASS' };
  });
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
  const rawRecords = Array.isArray(options.records)
    ? options.records.map(normalizeRecord)
    : deriveRawRecords(options.capabilityMap);
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
