'use strict';
export function checkSharedCanonicalOwner({ ownershipRows = [] } = {}) {
  const normalize = (value) => String(value || '').replace(/\\/g, '/');
  const violations = ownershipRows.filter((row) => row?.ownerState === 'SHARED_UNRESOLVED' && (row?.canonicalOwner !== null || (Array.isArray(row?.owners) && row.owners.length > 0))).map((row) => ({ code: 'SHARED_CANONICAL_OWNER_FABRICATED', path: normalize(row?.relative || row?.path), canonicalOwner: row?.canonicalOwner ?? null, owners: Array.isArray(row?.owners) ? row.owners : [] }));
  return { name: 'check_shared_canonical_owner', value: violations.length === 0, evidence: { violations, total: ownershipRows.length }, diagnostics: violations };
}
