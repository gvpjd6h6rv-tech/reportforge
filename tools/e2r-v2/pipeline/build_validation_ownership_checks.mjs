'use strict';
const checkOwnershipJoinConsistency = (await import('../checkers/check_ownership_join_consistency.mjs')).checkOwnershipJoinConsistency;
const checkSharedCanonicalOwner = (await import('../checkers/check_shared_canonical_owner.mjs')).checkSharedCanonicalOwner;
const checkCoverageOwnershipIdAlignment = (await import('../checkers/check_coverage_ownership_id_alignment.mjs')).checkCoverageOwnershipIdAlignment;
export const buildValidationOwnershipChecks = (input) => Object.fromEntries([
  ['ownershipJoinConsistency', checkOwnershipJoinConsistency(Object.fromEntries([['ownershipRows', input?.inventory?.ownership?.rows || []]]))],
  ['sharedCanonicalOwner', checkSharedCanonicalOwner(Object.fromEntries([['ownershipRows', input?.inventory?.ownership?.rows || []]]))],
  ['coverageOwnershipIdAlignment', checkCoverageOwnershipIdAlignment(Object.fromEntries([['scopeMap', input?.report?.scopeMap || Object.fromEntries([])], ['ownershipMap', input?.report?.ownershipMap || Object.fromEntries([])], ['coverageOwnershipIdExceptions', input?.report?.coverageOwnershipIdExceptions || Object.fromEntries([])]]))],
]);
