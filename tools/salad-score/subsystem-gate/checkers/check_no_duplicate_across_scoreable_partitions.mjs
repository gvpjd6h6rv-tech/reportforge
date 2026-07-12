'use strict';
/** RULE: a declared path must never appear in BOTH the scoreable (`files`)
 *  and non-scoreable (`nonScoreableFiles`) lists of the same subsystem --
 *  that would be a contradictory declaration (is this file scanned or not?). */
export function checkNoDuplicateAcrossScoreablePartitions(scoreableRelative, nonScoreableRelative) {
  const scoreableSet = new Set(scoreableRelative);
  const dupes = nonScoreableRelative.filter((f) => scoreableSet.has(f));
  return { value: dupes.length === 0, evidence: dupes };
}
