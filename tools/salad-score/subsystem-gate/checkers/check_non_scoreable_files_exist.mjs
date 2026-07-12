'use strict';
/** RULE: every declared non-scoreable file must exist -- pure decision over
 *  an already-collected existence map (see collect_path_existence.mjs for
 *  the I/O). */
export function checkNonScoreableFilesExist(existenceMap) {
  const missing = Object.entries(existenceMap).filter(([, exists]) => !exists).map(([p]) => p);
  return { value: missing.length === 0, evidence: missing };
}
