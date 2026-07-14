'use strict';
export function checkOwnershipJoinConsistency({ ownershipRows = [] } = {}) {
  const normalize = (value) => String(value || '').replace(/\\/g, '/');
  const violations = ownershipRows.flatMap((row) => {
    const owners = Array.isArray(row?.owners) ? row.owners : [];
    const canonicalOwner = row?.canonicalOwner ?? null;
    const path = normalize(row?.relative || row?.path);
    return row?.ownerState === 'RESOLVED'
      ? owners.length === 1 && canonicalOwner === owners[0] ? [] : [{ code: 'OWNERSHIP_RESOLVED_CONSISTENCY', path, owners, canonicalOwner }]
      : row?.ownerState === 'CONFLICT'
        ? owners.length > 1 && canonicalOwner === null ? [] : [{ code: 'OWNERSHIP_CONFLICT_CONSISTENCY', path, owners, canonicalOwner }]
        : row?.ownerState === 'UNOWNED' || row?.ownerState === 'SHARED_UNRESOLVED'
          ? owners.length === 0 && canonicalOwner === null ? [] : [{ code: 'OWNERSHIP_UNRESOLVED_CONSISTENCY', path, owners, canonicalOwner, ownerState: row?.ownerState || null }]
          : [{ code: 'OWNERSHIP_STATE_INVALID', path, ownerState: row?.ownerState || null }];
  });
  return { name: 'check_ownership_join_consistency', value: violations.length === 0, evidence: { violations, total: ownershipRows.length }, diagnostics: violations };
}
