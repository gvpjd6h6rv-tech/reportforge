'use strict';

/**
 * Approximates max brace-nesting depth via balance counting. Declared
 * approximation — does not skip strings/comments, can over/under-count
 * around template literals containing literal braces.
 */
export function metricNesting(text) {
  let depth = 0;
  let max = 0;
  for (const ch of text) {
    if (ch === '{') {
      depth++;
      if (depth > max) max = depth;
    } else if (ch === '}') {
      depth = Math.max(0, depth - 1);
    }
  }
  return { value: max, evidence: [] };
}
