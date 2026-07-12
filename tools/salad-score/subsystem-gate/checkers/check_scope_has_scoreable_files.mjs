'use strict';
/** RULE: a subsystem whose scoreable file list is empty (even if it has
 *  non-scoreable files) has NOTHING to compute SP_SUBSYSTEM_SCORE from --
 *  this must be caught explicitly so the score is reported NOT_OBSERVABLE,
 *  never silently 0. Distinct from checkSubsystemScopeNonempty, which
 *  checks the union (allOwnedFiles) is non-empty.
 *  EXCEPTION: `structuralOnly` subsystems (declared BY DESIGN as JSON-only
 *  governance registries, e.g. REPOSITORY-PACKAGE-MANIFEST) never had
 *  scoreable files to begin with -- for them this is not a gate failure,
 *  see run_subsystem_gate.mjs's NOT_APPLICABLE branch. */
export function checkScopeHasScoreableFiles(scoreableRelative, structuralOnly) {
  if (structuralOnly) return { value: true, evidence: [] };
  const empty = scoreableRelative.length === 0;
  return { value: !empty, evidence: empty ? ['no scoreable files declared -- SP_SUBSYSTEM_SCORE cannot be computed'] : [] };
}
