'use strict';
/** RULE: the (already-normalized) declared file list must contain no
 *  duplicates. Does not normalize -- see normalize_subsystem_path.mjs. */
export function checkNoDuplicateScopePaths(normalizedPaths) {
  const seen = new Set();
  const dupes = [];
  for (const p of normalizedPaths) { if (seen.has(p)) dupes.push(p); seen.add(p); }
  return { value: dupes.length === 0, evidence: dupes };
}
