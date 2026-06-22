'use strict';
/** Shape every checkers/*.mjs module must return: { value, evidence }. */
export function isValidCheckerResult(result) {
  return !!result
    && (typeof result.value === 'number' || typeof result.value === 'boolean')
    && Array.isArray(result.evidence);
}
