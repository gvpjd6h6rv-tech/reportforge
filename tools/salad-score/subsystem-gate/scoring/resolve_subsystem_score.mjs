'use strict';
import { calculateSubsystemScore } from './calculate_subsystem_score.mjs';

/** Single owner of the SP_SUBSYSTEM_SCORE decision: NOT_APPLICABLE for a
 *  structuralOnly subsystem with zero scoreable files by design (see
 *  check_scope_has_scoreable_files.mjs), NOT_OBSERVABLE when scoring throws
 *  (empty scoped result set that was NOT expected to be empty), or the real
 *  official score otherwise. Kept out of run_subsystem_gate.mjs so the
 *  runner itself never embeds a comparison -- see
 *  check_runner_only_orchestration_ast.mjs. */
export function resolveSubsystemScore(structuralOnly, scoreableRelative, scopedResults) {
  const isStructuralEmpty = structuralOnly && scoreableRelative.length === 0;
  if (isStructuralEmpty) return 'NOT_APPLICABLE';
  try {
    return calculateSubsystemScore(scopedResults);
  } catch (err) {
    return `NOT_OBSERVABLE: ${err.message}`;
  }
}
