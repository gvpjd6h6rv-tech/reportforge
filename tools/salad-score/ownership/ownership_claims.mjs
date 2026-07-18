'use strict';
import { normalizeRepoRelativePath } from './ownership_paths.mjs';

function addClaim(claims, claim, subsystemId) {
  if (!claims.has(claim)) claims.set(claim, []);
  claims.get(claim).push(subsystemId);
}

export function collectLegacyClaims(subsystem, claims, errors) {
  const owner = subsystem.owner || subsystem.id;
  for (const raw of (subsystem.allowedFiles || [])) {
    const base = String(raw).split('/').pop();
    if (raw !== base || raw.includes('\\')) {
      errors.push({
        rule: 'RULE-SCHEMA',
        subsystem: subsystem.id,
        file: raw,
        detail: `allowedFiles entry "${raw}" must be a basename`,
      });
      continue;
    }
    addClaim(claims, `engines/${raw}`, owner);
  }
}

export function collectRepoRelativeClaims(subsystem, claims, errors) {
  const owner = subsystem.owner || subsystem.id;
  for (const raw of (subsystem.allowedPaths || [])) {
    try {
      addClaim(claims, normalizeRepoRelativePath(raw), owner);
    } catch (err) {
      errors.push({
        rule: 'RULE-SCHEMA',
        subsystem: subsystem.id,
        file: raw,
        detail: err.message,
      });
    }
  }
}
