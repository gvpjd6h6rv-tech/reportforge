'use strict';

/** SP_REPO_SCORE: base weighted average of every file's sp_total_score, weighted by LOC. */
export function scoreRepo(files) {
  let sumWeighted = 0;
  let sumLoc = 0;
  for (const f of files) {
    sumWeighted += f.sp_total_score * (f.loc || 0);
    sumLoc += f.loc || 0;
  }
  return sumLoc === 0 ? 0 : sumWeighted / sumLoc;
}
