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

  return { claims, sharedFiles, errors, hasRepoRelativeClaims };
}
