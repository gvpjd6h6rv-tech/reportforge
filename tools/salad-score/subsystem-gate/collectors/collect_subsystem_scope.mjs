'use strict';
import fs from 'node:fs';

/** Reads a subsystem_scope_map.json and returns the RAW (unvalidated,
 *  unnormalized) entry for a subsystemId: scoreable files (`files`),
 *  non-scoreable files (`nonScoreableFiles`, defaults []), the
 *  INDEPENDENTLY-DECLARED `allOwnedFiles` (defaults [] -- NOT derived from
 *  the other two; completeness against their union is a separate checker's
 *  job, see check_all_owned_files_complete.mjs), `structuralOnly` (defaults
 *  false -- a scope with zero scoreable files BY DESIGN, e.g. a JSON-only
 *  governance registry), and `allowedOwners`. Pure I/O + structural
 *  extraction -- normalization is normalize_subsystem_path.mjs's sole
 *  responsibility. */
export function collectSubsystemScope(scopeMapPath, subsystemId) {
  const map = JSON.parse(fs.readFileSync(scopeMapPath, 'utf8'));
  const entry = (map.subsystems || {})[subsystemId];
  if (!entry) {
    return { exists: false, scoreableFiles: [], nonScoreableFiles: [], allOwnedFiles: [], structuralOnly: false, allowedOwners: [] };
  }
  return {
    exists: true,
    scoreableFiles: entry.files || [],
    nonScoreableFiles: entry.nonScoreableFiles || [],
    allOwnedFiles: entry.allOwnedFiles || [],
    structuralOnly: entry.structuralOnly === true,
    allowedOwners: entry.allowedOwners || [],
  };
}
