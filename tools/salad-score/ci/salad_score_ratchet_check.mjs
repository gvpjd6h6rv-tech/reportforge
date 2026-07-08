'use strict';

/**
 * salad_score_ratchet_check — pure comparison logic. Given a baseline
 * snapshot ({ [path]: sp_total_score }) and the current run's file
 * results, decide which files REGRESSED (score got worse than baseline
 * by more than the allowed tolerance).
 *
 * Responsibility: ONLY the regression decision. No file I/O, no process
 * exit codes, no running the scorer itself — those belong to
 * salad_score_baseline_store.mjs and bin/salad-score-ratchet.mjs.
 *
 * This is a RATCHET, not a hard ceiling: a file already at a bad score is
 * NOT flagged just for existing above some threshold — only a file whose
 * score got WORSE than its own recorded baseline is a regression. A new
 * file (not yet in the baseline) is never flagged; it becomes the
 * baseline for next time. A file that improved is never flagged either.
 */

export function checkRatchet(currentFiles, baseline, tolerance = 0) {
  const regressions = [];
  const improvements = [];
  const newFiles = [];

  for (const file of currentFiles) {
    const before = baseline[file.path];
    if (before === undefined) {
      newFiles.push({ path: file.path, score: file.sp_total_score });
      continue;
    }
    const delta = file.sp_total_score - before;
    if (delta > tolerance) {
      regressions.push({ path: file.path, before, after: file.sp_total_score, delta });
    } else if (delta < 0) {
      improvements.push({ path: file.path, before, after: file.sp_total_score, delta });
    }
  }

  return { regressions, improvements, newFiles, ok: regressions.length === 0 };
}
