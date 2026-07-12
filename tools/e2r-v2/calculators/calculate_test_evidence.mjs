'use strict';
function normalizeStrength(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  switch (String(value || '').toUpperCase()) {
    case 'IMPORT_OR_REQUIRE_ONLY': return 1;
    case 'SCRIPT_LOAD_ONLY': return 1;
    case 'DIRECT_CALL_ASSERTION': return 1;
    case 'RUNTIME_TRACE': return 1;
    default: return 0;
  }
}

function normalizeOutcome(value) {
  if (value === true || value === 'PASS' || value === 'PASSING' || value === 1) return 1;
  if (value === false || value === 'FAIL' || value === 'FAILURE' || value === 0) return 0;
  if (value === null || value === undefined) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

export function calculateTestEvidence(records = []) {
  if (!records.length) return { status: 'NOT_OBSERVABLE', score: null, canonicalExecutionCount: 0 };
  let sum = 0;
  let observed = 0;
  for (const record of records) {
    const outcome = normalizeOutcome(record.outcome);
    if (outcome === null) continue;
    observed += 1;
    sum += normalizeStrength(record.evidenceStrength) * outcome;
  }
  if (!observed) return { status: 'NOT_OBSERVABLE', score: null, canonicalExecutionCount: records.length };
  return { status: 'COMPLETE', score: 100 * sum / records.length, canonicalExecutionCount: records.length };
}
