'use strict';
/** RULE: no scoped file may fail the official check_hidden_side_effect rule.
 *  Reuses runSaladScore's own `reasons[]` -- never recomputes the metric.
 *  CONFIRMED CONTRACT (buildReasons.mjs: `.filter(e => !e.pass)`): reasons
 *  only ever lists FAILING rules -- a rule's ABSENCE from reasons is the
 *  normal, official representation of "this rule passed", not a suspect
 *  state. The only structurally-invalid case is `reasons` not being an
 *  array at all (the real tool always sets it, even if empty []). */
export function checkNoHiddenSideEffectsInScope(scopedResults) {
  const violators = [];
  const suspect = [];
  for (const r of scopedResults) {
    if (!Array.isArray(r.reasons)) { suspect.push(r.path); continue; }
    const entry = r.reasons.find((x) => x.rule === 'check_hidden_side_effect');
    if (entry && !entry.pass) violators.push(r.path);
    // entry absent -> official "this rule passed" representation, NOT suspect.
  }
  return {
    value: violators.length === 0 && suspect.length === 0,
    evidence: violators,
    suspectEvidence: suspect, // only reasons-key-missing/malformed cases
  };
}
