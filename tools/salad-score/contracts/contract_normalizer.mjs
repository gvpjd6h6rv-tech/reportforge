'use strict';
/** Shape every normalizers/*.mjs function must return: number in [0,100]. */
export function isValidNormalizedValue(value) {
  return typeof value === 'number' && value >= 0 && value <= 100;
}
