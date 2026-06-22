'use strict';
/** Shape every metrics/*.mjs module must return: { value, evidence }. */
export function isValidMetricResult(result) {
  return !!result
    && (typeof result.value === 'number' || Array.isArray(result.value))
    && Array.isArray(result.evidence);
}
