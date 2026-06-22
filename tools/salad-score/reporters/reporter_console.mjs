'use strict';

/** Human-readable console report: SP_REPO_SCORE + top-N worst files by sp_total_score. */
export function reporterConsole(results, repoScore, top = 20) {
  const lines = [];
  lines.push(`SP_REPO_SCORE: ${repoScore.toFixed(2)}`);
  lines.push(`files scanned: ${results.length}`);
  lines.push('');
  const sorted = top > 0 ? [...results].sort((a, b) => b.sp_total_score - a.sp_total_score).slice(0, top) : [];
  for (const r of sorted) {
    lines.push(`${String(r.sp_total_score).padStart(3)}  ${r.level.padEnd(20)}  ${r.path}`);
  }
  return lines.join('\n');
}
