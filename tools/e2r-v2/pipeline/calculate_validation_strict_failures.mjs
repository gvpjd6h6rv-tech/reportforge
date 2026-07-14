'use strict';

export function calculateValidationStrictFailures({ schema, checks = [] } = {}) {
  const schemaFailure = schema?.value === true ? 0 : 1;
  const failingChecks = [];
  for (const check of Array.isArray(checks) ? checks : []) {
    if (check?.value !== true) failingChecks.push(check?.name || 'unknown');
  }
  const value = schemaFailure + failingChecks.length;
  return {
    value,
    evidence: { schemaFailure, failingChecks, totalChecks: Array.isArray(checks) ? checks.length : 0 },
    diagnostics: value === 0 ? [] : [{ code: 'STRICT_FAILURES_RECORDED', failingChecks }],
  };
}
