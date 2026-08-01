
'use strict';

function normalizePath(value) {
  return String(value ?? '').replace(/\\/g, '/').trim();
}

function fingerprint(record) {
  const safe = record || {};
  return [safe.name ?? '', normalizePath(safe.productionFile), normalizePath(safe.sourcePath), String(safe.evidenceStrength ?? ''), String(safe.outcome ?? '')].join('\\u0000');
}

export function checkTestEvidenceDuplicateRecords(records = []) {
  const seen = new Map();
  const diagnostics = [];
  const list = Array.isArray(records) ? records : [];
  for (const record of list) {
    const key = fingerprint(record);
    if (!key.trim()) continue;
    if (seen.has(key)) {
      diagnostics.push({
        code: 'TEST_EVIDENCE_DUPLICATE_RECORD',
        productionFile: normalizePath(record?.productionFile),
        sourcePath: normalizePath(record?.sourcePath),
        name: String(record?.name ?? '').trim() || null,
      });
      continue;
    }
    seen.set(key, record);
  }
  return {
    name: 'check_test_evidence_duplicate_records',
    value: diagnostics.length === 0,
    evidence: { total: list.length, duplicateCount: diagnostics.length },
    diagnostics,
  };
}
