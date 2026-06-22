'use strict';
/** Shape every scoring/score_*.mjs function must return: number in [0,100]. */
export function isValidScore(value) {
  return typeof value === 'number' && value >= 0 && value <= 100;
}
