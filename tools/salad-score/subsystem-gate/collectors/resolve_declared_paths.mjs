'use strict';
import { normalizeSubsystemPath } from '../checkers/normalize_subsystem_path.mjs';

/** Prepares path representations for both scoreable and non-scoreable
 *  declared lists: relative-normalized (for duplicate/partition/escape
 *  checks) and root-resolved-absolute (scoreable only -- compared against
 *  scanned paths). Single responsibility: path-list preparation. */
export function resolveDeclaredPaths(scopeRaw, idKnown, root) {
  const rawScoreable = idKnown.value ? scopeRaw.scoreableFiles : [];
  const rawNonScoreable = idKnown.value ? scopeRaw.nonScoreableFiles : [];
  const rawAllOwned = idKnown.value ? scopeRaw.allOwnedFiles : [];
  return {
    scoreableRelative: rawScoreable.map((p) => normalizeSubsystemPath(p)),
    scoreableFiles: rawScoreable.map((p) => normalizeSubsystemPath(p, root)),
    nonScoreableRelative: rawNonScoreable.map((p) => normalizeSubsystemPath(p)),
    allOwnedRelative: rawAllOwned.map((p) => normalizeSubsystemPath(p)),
    structuralOnly: idKnown.value ? scopeRaw.structuralOnly === true : false,
    allowedOwners: idKnown.value ? scopeRaw.allowedOwners : [],
  };
}
