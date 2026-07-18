'use strict';
import { buildOwnershipIndex } from '../tools/salad-score/ownership/ownership_index.mjs';

export function collectOverlapErrors(ownershipMap) {
  const { claims, sharedFiles } = buildOwnershipIndex(ownershipMap);
  const errors = [];

  for (const [claim, owners] of claims.entries()) {
    if (owners.length > 1 && !sharedFiles.has(claim)) {
      errors.push({ rule: 'RULE-OVERLAP', subsystem: owners.join(', '), file: claim, detail: `${claim} claimed by multiple subsystems: [${owners.join(', ')}].` });
    }
  }

  return { errors, claims, sharedFiles };
}

export function collectOrphanWarnings({ diskFiles, claims, sharedFiles }) {
  const warnings = [];

  for (const f of diskFiles) {
    const key = `engines/${f}`;
    const ids = claims.get(key) || [];
    if (ids.length === 0 && !sharedFiles.has(key)) {
      warnings.push({ rule: 'RULE-ORPHAN', file: f, detail: `engines/${f} is not claimed by any subsystem — add to an allowedFiles list` });
    }
  }

  return warnings;
}
