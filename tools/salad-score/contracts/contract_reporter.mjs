'use strict';
/** Shape every reporters/*.mjs function must return: a non-empty string. */
export function isValidReport(value) {
  return typeof value === 'string' && value.length > 0;
}
