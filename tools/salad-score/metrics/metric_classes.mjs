'use strict';

/** Counts `class X` declarations. */
export function metricClasses(text) {
  const matches = text.match(/\bclass\s+[\w$]+/g) || [];
  return { value: matches.length, evidence: matches };
}
