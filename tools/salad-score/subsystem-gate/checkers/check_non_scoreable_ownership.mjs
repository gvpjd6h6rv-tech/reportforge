'use strict';
import path from 'node:path';
import { buildOwnershipIndex } from '../../ownership/ownership_index.mjs';

function normalizeDeclaredPath(root, rawPath) {
  const slashed = String(rawPath).replace(/\\/g, '/');
  const absolute = path.isAbsolute(slashed) ? slashed : path.resolve(root, slashed);
  return path.relative(root, absolute).replace(/\\/g, '/');
}

export function checkNonScoreableOwnership(root, declaredNonScoreableFiles, ownershipMap) {
  const index = buildOwnershipIndex({
    ...ownershipMap,
    subsystems: (ownershipMap.subsystems || []).map((subsystem) => ({ ...subsystem, allowedFiles: [] })),
  });
  const legacyClaims = new Map();
  for (const subsystem of ownershipMap.subsystems || []) {
    const owner = subsystem.owner || subsystem.id;
    for (const raw of subsystem.allowedFiles || []) {
      const pathKey = normalizeDeclaredPath(root, raw);
      const owners = legacyClaims.get(pathKey) || [];
      owners.push(owner);
      legacyClaims.set(pathKey, owners);
    }
  }
  const evidence = [];
  const diagnostics = [...index.errors];
  for (const raw of declaredNonScoreableFiles) {
    const relative = normalizeDeclaredPath(root, raw);
    const pathOwners = index.claims.get(relative) || [];
    const legacyOwners = legacyClaims.get(relative) || [];
    const owners = [...new Set([...pathOwners, ...legacyOwners])];
    if (owners.length !== 1) {
      evidence.push(relative);
      diagnostics.push({
        code: owners.length === 0 ? 'NON_SCOREABLE_PATH_UNOWNED' : 'NON_SCOREABLE_PATH_AMBIGUOUS',
        path: relative,
        owners,
      });
    }
  }
  return { value: evidence.length === 0 && diagnostics.every((d) => d.rule !== 'RULE-SCHEMA'), evidence, diagnostics };
}
