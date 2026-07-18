'use strict';
import path from 'node:path';
import { normalizeRepoRelativePath } from './ownership_paths.mjs';

export function resolveOwnerFromIndex(filePath, ownershipIndex, root) {
  const baseName = path.basename(filePath);
  if (root == null) {
    if (ownershipIndex.hasRepoRelativeClaims) {
      throw new Error('collectOwner requires a root when allowedPaths are declared');
    }
    const engineClaim = ownershipIndex.claims.get(`engines/${baseName}`) || [];
    if (engineClaim.length === 1) return engineClaim[0];
    if (ownershipIndex.sharedFiles.has(`engines/${baseName}`)) return 'shared';
    return 'unowned';
  }
  const relPath = normalizeRepoRelativePath(path.relative(root, filePath).replace(/\\/g, '/'));
  const pathClaim = ownershipIndex.claims.get(relPath) || [];
  if (pathClaim.length === 1) return pathClaim[0];
  const engineClaim = ownershipIndex.claims.get(`engines/${baseName}`) || [];
  if (engineClaim.length === 1) return engineClaim[0];
  if (ownershipIndex.sharedFiles.has(`engines/${baseName}`)) return 'shared';
  return 'unowned';
}
