'use strict';

/**
 * explainScoreDelta — pure explainer: given two runSaladScore per-file
 * results for the SAME path (before/after), describes what changed and
 * why. Never mutates either score, never recomputes anything — only
 * reads the two result objects and reports the diff.
 */
export function explainScoreDelta(before, after) {
  const reasons = [];

  if (before.loc !== after.loc) {
    const diff = after.loc - before.loc;
    reasons.push(`loc: ${before.loc} -> ${after.loc} (${diff >= 0 ? '+' : ''}${diff})`);
  }
  if (before.sp_file_score !== after.sp_file_score) {
    reasons.push(`sp_file_score: ${before.sp_file_score} -> ${after.sp_file_score}`);
  }
  if (before.sp_behavior_score !== after.sp_behavior_score) {
    reasons.push(`sp_behavior_score: ${before.sp_behavior_score} -> ${after.sp_behavior_score}`);
  }

  const beforeRules = new Set(before.violated_rules || []);
  const afterRules = new Set(after.violated_rules || []);
  const resolved = [...beforeRules].filter((r) => !afterRules.has(r));
  const introduced = [...afterRules].filter((r) => !beforeRules.has(r));
  if (resolved.length) reasons.push(`resolved rules: ${resolved.join(', ')}`);
  if (introduced.length) reasons.push(`new violations: ${introduced.join(', ')}`);

  return {
    path: after.path,
    delta: after.sp_total_score - before.sp_total_score,
    reasons,
  };
}
