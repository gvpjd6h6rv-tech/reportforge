'use strict';
import { calculateTestEvidence } from '../calculators/calculate_test_evidence.mjs';

export function collectFileTestEvidence(input = {}) {
  const cases = Array.isArray(input) ? input : Array.isArray(input?.cases) ? input.cases : Array.isArray(input?.records) ? input.records : [];
  const records = cases.map((record) => ({
    name: record.name || record.testName || null,
    productionFile: record.productionFile || record.file || null,
    evidenceStrength: record.evidenceStrength ?? record.strength ?? 0,
    outcome: record.outcome ?? record.status ?? null,
  }));
  const evidence = calculateTestEvidence(records);
  return { records, canonicalExecutionCount: records.length, ...evidence };
}
