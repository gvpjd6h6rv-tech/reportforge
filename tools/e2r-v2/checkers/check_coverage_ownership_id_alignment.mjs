'use strict';
export function checkCoverageOwnershipIdAlignment({ scopeMap = {}, ownershipMap = {}, coverageOwnershipIdExceptions = {} } = {}) {
  const scopeIds = new Set(Object.keys(scopeMap || {}));
  const ownershipIds = new Set(Array.isArray(ownershipMap?.subsystems) ? ownershipMap.subsystems.map((entry) => String(entry?.owner || '').trim()).filter(Boolean) : Object.keys(ownershipMap || {}));
  const exceptions = Array.isArray(coverageOwnershipIdExceptions) ? coverageOwnershipIdExceptions : Array.isArray(coverageOwnershipIdExceptions?.exceptions) ? coverageOwnershipIdExceptions.exceptions : Object.entries(coverageOwnershipIdExceptions || {}).map(([subsystemId, entry]) => ({ subsystemId, ...entry }));
  const violations = exceptions.flatMap((exception) => {
    const subsystemId = String(exception?.subsystemId || '').trim();
    const canonicalOwner = String(exception?.canonicalOwner || '').trim();
    return !subsystemId || canonicalOwner !== subsystemId ? [{ code: 'COVERAGE_OWNERSHIP_ID_MISMATCH', subsystemId: subsystemId || null, canonicalOwner: canonicalOwner || null }] : [
      ...(scopeIds.size && !scopeIds.has(subsystemId) ? [{ code: 'COVERAGE_SCOPE_ID_MISSING', subsystemId }] : []),
      ...(ownershipIds.size && !ownershipIds.has(subsystemId) ? [{ code: 'COVERAGE_OWNERSHIP_ID_MISSING', subsystemId }] : []),
    ];
  });
  return { name: 'check_coverage_ownership_id_alignment', value: violations.length === 0, evidence: { violations, exceptions: exceptions.length }, diagnostics: violations };
}
