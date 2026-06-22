'use strict';

/** Reuses metric_top_level_side_effects' result as a discrete behavior signal — does not recompute it. */
export function checkHiddenSideEffect(topLevelSideEffectsResult) {
  const value = (topLevelSideEffectsResult?.value || 0) > 0;
  return { value, evidence: topLevelSideEffectsResult?.evidence || [] };
}
