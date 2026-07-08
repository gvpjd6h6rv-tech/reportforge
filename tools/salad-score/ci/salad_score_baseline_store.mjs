'use strict';
import fs from 'node:fs';

/**
 * salad_score_baseline_store — load/save the committed Salad Score
 * ratchet baseline. Nothing else.
 *
 * Responsibility: read a baseline JSON file into a plain
 * { [path]: sp_total_score } map, and write an updated one back out in a
 * stable (sorted-keys) format so diffs stay readable. Does NOT run the
 * scorer, does NOT decide what counts as a regression (see
 * salad_score_ratchet_check.mjs), does NOT touch process exit codes.
 */

export function loadBaseline(baselinePath) {
  if (!fs.existsSync(baselinePath)) return {};
  const raw = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
  return raw && typeof raw === 'object' && raw.scores ? raw.scores : {};
}

export function buildBaselineFromResults(files) {
  const scores = {};
  for (const f of files) scores[f.path] = f.sp_total_score;
  return { scores };
}

export function saveBaseline(baselinePath, files) {
  const baseline = buildBaselineFromResults(files);
  const sorted = { scores: {} };
  for (const key of Object.keys(baseline.scores).sort()) {
    sorted.scores[key] = baseline.scores[key];
  }
  fs.writeFileSync(baselinePath, JSON.stringify(sorted, null, 2) + '\n');
}
