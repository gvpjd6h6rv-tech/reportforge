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

  // RF-SP-SCORE-HARDENING-1 (report-only, non-blocking): surfaces
  // normalized-LOC evidence without affecting sp_total_score/the ratchet.
  const warned = results.filter((r) => (r.loc_normalization_warning || []).length > 0);
  if (warned.length) {
    lines.push('');
    lines.push(`LOC NORMALIZATION WARNINGS (report-only, not blocking): ${warned.length} file(s)`);
    for (const r of warned) {
      lines.push(`  ${r.path}: ${r.loc_normalization_warning[0]}`);
    }
  }

  return lines.join('\n');
}
