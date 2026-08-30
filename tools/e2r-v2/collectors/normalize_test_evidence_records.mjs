'use strict';

const strengthLookup = { IMPORT_OR_REQUIRE_ONLY: 1, SCRIPT_LOAD_ONLY: 1, DIRECT_CALL_ASSERTION: 1, RUNTIME_TRACE: 1 };
const outcomeLookup = { PASS: 1, PASSING: 1, FAIL: 0, FAILURE: 0 };
const pickDefined = (record, fields) => {
  const safe = record || {};
  for (const field of fields) {
    const value = safe[field];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return '';
};
const normalize = (value) => String(value || '').replace(/\\/g, '/');
const toStrength = (value) => Number.isFinite(value) ? Number(value) : value == null || value === '' ? null : strengthLookup[String(value).toUpperCase()] ?? null;
const toOutcome = (value) => value === true || value === 1 ? 1 : value === false || value === 0 ? 0 : value == null || value === '' ? null : (outcomeLookup[String(value).toUpperCase()] ?? (Number.isFinite(Number(value)) ? Number(value) : null));
export const normalizeTestEvidenceRecord = (record) => {
  const safe = record || {};
  return {
    ...safe,
    name: safe.name || safe.testName || null,
    productionFile: normalize(pickDefined(safe, ['productionFile', 'file', 'path'])),
    sourcePath: normalize(pickDefined(safe, ['sourcePath', 'source', 'file', 'path', 'productionFile'])),
    evidenceStrength: toStrength(pickDefined(safe, ['evidenceStrength', 'strength'])),
    outcome: toOutcome(pickDefined(safe, ['outcome', 'status'])),
  };
};

export function normalizeTestEvidenceRecords(input = []) {
  return input.map((record) => normalizeTestEvidenceRecord(record));
}
