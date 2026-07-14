'use strict';

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  return [value];
}

function normalizeCheck(name, raw) {
  const issues = [];
  const normalizedName = typeof raw?.name === 'string' && raw.name ? raw.name : name;
  if (typeof raw?.name !== 'string' || !raw.name) issues.push({ code: 'CONTRACT_NAME_INVALID', name });
  if (typeof raw?.value !== 'boolean') issues.push({ code: 'CONTRACT_VALUE_INVALID', name: normalizedName });
  if (raw?.evidence === undefined) issues.push({ code: 'CONTRACT_EVIDENCE_INVALID', name: normalizedName });
  if (!Array.isArray(raw?.diagnostics)) issues.push({ code: 'CONTRACT_DIAGNOSTICS_INVALID', name: normalizedName });
  const evidence = raw?.evidence === undefined ? { contract: 'missing-evidence', name: normalizedName } : raw.evidence;
  const diagnostics = asArray(raw?.diagnostics);
  return {
    normalized: {
      name: normalizedName,
      value: issues.length === 0 ? raw.value : false,
      evidence,
      diagnostics: issues.length === 0 ? diagnostics : [...diagnostics, ...issues],
    },
    valid: issues.length === 0,
    issues,
  };
}

function flattenGroups(groups) {
  const entries = [];
  for (const [groupName, group] of Object.entries(groups || {})) {
    for (const [key, raw] of Object.entries(group || {})) entries.push([groupName, key, raw]);
  }
  return entries;
}

export function validateCheckerContract(groups = {}) {
  const checks = [];
  const diagnostics = [];
  for (const [groupName, key, raw] of flattenGroups(groups)) {
    const { normalized, valid, issues } = normalizeCheck(key, raw);
    checks.push(normalized);
    if (!valid) diagnostics.push({ groupName, key, issues });
  }
  return {
    value: diagnostics.length === 0,
    evidence: { totalChecks: checks.length, invalidChecks: diagnostics.map((entry) => entry.key) },
    diagnostics,
    checks,
  };
}
