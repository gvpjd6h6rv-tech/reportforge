
'use strict';

const RAW_STRENGTH = new Set(['IMPORT_OR_REQUIRE_ONLY', 'SCRIPT_LOAD_ONLY', 'DIRECT_CALL_ASSERTION', 'RUNTIME_TRACE', 1, 0, '1', '0']);
const RAW_OUTCOME = new Set(['PASS', 'PASSING', 'FAIL', 'FAILURE', 1, 0, true, false, '1', '0']);

function normalizePath(value) {
  return String(value ?? '').replace(/\\/g, '/').trim();
}

function isRepoRelativePath(value) {
  const normalized = normalizePath(value);
  if (!normalized) return false;
  if (normalized.startsWith('/') || normalized.startsWith('./') || normalized.startsWith('../')) return false;
  if (normalized.includes('/./') || normalized.includes('/../')) return false;
  return normalized === normalized.replace(/\/+/g, '/');
}

function validateRecord(record, index) {
  const diagnostics = [];
  const safe = record && typeof record === 'object' && !Array.isArray(record) ? record : null;
  if (!safe) {
    diagnostics.push({ code: 'TEST_EVIDENCE_RAW_RECORD_NOT_OBJECT', index });
    return diagnostics;
  }
  if (typeof safe.name !== 'string' || !safe.name.trim()) diagnostics.push({ code: 'TEST_EVIDENCE_RAW_RECORD_MISSING_NAME', index });
  if (typeof safe.productionFile !== 'string' || !isRepoRelativePath(safe.productionFile)) diagnostics.push({ code: 'TEST_EVIDENCE_RAW_RECORD_INVALID_PRODUCTION_FILE', index, value: safe.productionFile ?? null });
  if (typeof safe.sourcePath !== 'string' || !isRepoRelativePath(safe.sourcePath)) diagnostics.push({ code: 'TEST_EVIDENCE_RAW_RECORD_INVALID_SOURCE_PATH', index, value: safe.sourcePath ?? null });
  if (!RAW_STRENGTH.has(safe.evidenceStrength)) diagnostics.push({ code: 'TEST_EVIDENCE_RAW_RECORD_INVALID_EVIDENCE_STRENGTH', index, value: safe.evidenceStrength ?? null });
  if (!RAW_OUTCOME.has(safe.outcome)) diagnostics.push({ code: 'TEST_EVIDENCE_RAW_RECORD_INVALID_OUTCOME', index, value: safe.outcome ?? null });
  return diagnostics;
}

export function validateTestEvidenceRawSchema(input = []) {
  const records = Array.isArray(input) ? input : Array.isArray(input?.records) ? input.records : [];
  const diagnostics = [];
  for (let index = 0; index < records.length; index += 1) diagnostics.push(...validateRecord(records[index], index));
  const invalidCount = diagnostics.length;
  return {
    name: 'validate_test_evidence_raw_schema',
    value: invalidCount === 0,
    evidence: { total: records.length, valid: records.length - invalidCount, invalid: invalidCount },
    diagnostics,
  };
}
