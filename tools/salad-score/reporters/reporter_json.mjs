'use strict';

/** Machine-readable JSON report — the full per-file contract array plus the repo score. */
export function reporterJson(results, repoScore, filesScanned = results.length) {
  return JSON.stringify({
    repoScore,
    filesScanned,
    generatedAt: new Date().toISOString(),
    files: results,
  }, null, 2);
}
