'use strict';
/** RULE: no scoped file's sp_total_score may exceed the structural gate limit. */
export function checkNoFilesOver20(scopedResults, limit = 20) {
  const over = scopedResults.filter((r) => r.sp_total_score > limit);
  return { value: over.length === 0, evidence: over.map((r) => `${r.path} (${r.sp_total_score})`) };
}
