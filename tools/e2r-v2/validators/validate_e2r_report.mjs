'use strict';
export function validateE2RReport(report) {
  const required = ['phaseId', 'capabilityId', 'generatedAt', 'files', 'summary'];
  const missing = required.filter((k) => !(k in report));
  return { value: missing.length === 0 && Array.isArray(report.files), evidence: missing };
}
