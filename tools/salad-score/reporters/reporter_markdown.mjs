'use strict';

/** Markdown report — top-N worst files as a table, mirrors audit/PIXEL_CONTRACTS.md's table style. */
export function reporterMarkdown(results, repoScore, top = 20) {
  const sorted = top > 0 ? [...results].sort((a, b) => b.sp_total_score - a.sp_total_score).slice(0, top) : [];
  const rows = sorted.map((r) => `| ${r.path} | ${r.sp_total_score} | ${r.level} |`).join('\n');
  return [
    '# Salad Point Score',
    '',
    `SP_REPO_SCORE: ${repoScore.toFixed(2)}`,
    `files scanned: ${results.length}`,
    '',
    '| path | score | level |',
    '|---|---|---|',
    rows,
    '',
  ].join('\n');
}
