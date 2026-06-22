'use strict';

/** SP_TOTAL_SCORE = round(SP_FILE_SCORE * weights.file + SP_BEHAVIOR_SCORE * weights.behavior). */
export function scoreTotal(fileScore, behaviorScore, weights) {
  return Math.round(fileScore * weights.file + behaviorScore * weights.behavior);
}
