'use strict';
import { collectLegacyClaims, collectRepoRelativeClaims } from './ownership_claims.mjs';

export function buildOwnershipIndex(ownershipMap) {
  const claims = new Map();
  const sharedFiles = new Set((ownershipMap.sharedFiles || []).map((name) => `engines/${name}`));
  const errors = [];
  let hasRepoRelativeClaims = false;

  for (const ss of ownershipMap.subsystems || []) {
    if ((ss.allowedPaths || []).length > 0) hasRepoRelativeClaims = true;
    collectLegacyClaims(ss, claims, errors);
    collectRepoRelativeClaims(ss, claims, errors);
  }

  for (const [claim, owners] of claims.entries()) {
    if (owners.length < 2) continue;
    const uniqueOwners = new Set(owners);
    errors.push({
      rule: uniqueOwners.size === 1 ? 'RULE-DUPLICATE-CLAIM' : 'RULE-AMBIGUOUS-CLAIM',
      file: claim,
      detail: uniqueOwners.size === 1
        ? `ownership claim is duplicated: ${claim}`
        : `ownership claim has multiple owners: ${claim}`,
    });
  }

  return { claims, sharedFiles, errors, hasRepoRelativeClaims };
}
