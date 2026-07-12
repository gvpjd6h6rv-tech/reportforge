'use strict';
/** Contract ID: SCOPE-COMPLETENESS-01. Single gate key: allOwnedFilesComplete
 *  (evidence key ALL_OWNED_FILES_INCOMPLETE-equivalent). RULE: the
 *  INDEPENDENTLY-DECLARED `allOwnedFiles` list must be exactly the set union
 *  of the scoreable and non-scoreable partitions -- neither more nor less.
 *  Unlike a derived union (which can never disagree with itself), this
 *  compares two independent sources and fails loudly on ANY mismatch, so a
 *  file omitted from every partition, or a partition file never declared in
 *  allOwnedFiles, both surface as evidence instead of being silently absorbed. */
export function checkAllOwnedFilesComplete(allOwnedRelative, scoreableRelative, nonScoreableRelative) {
  const allOwnedSet = new Set(allOwnedRelative);
  const unionSet = new Set([...scoreableRelative, ...nonScoreableRelative]);
  const missingFromPartitions = allOwnedRelative
    .filter((f) => !unionSet.has(f))
    .map((f) => `MISSING_FROM_PARTITIONS:${f}`);
  const notDeclaredInAllOwned = [...unionSet]
    .filter((f) => !allOwnedSet.has(f))
    .map((f) => `PARTITION_FILE_NOT_DECLARED:${f}`);
  const evidence = [...missingFromPartitions, ...notDeclaredInAllOwned];
  return { value: evidence.length === 0, evidence };
}
