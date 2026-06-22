'use strict';

/** Counts function declarations + arrow functions. Declared approximation via regex, not AST. */
export function metricFunctions(text) {
  const fnKeyword = text.match(/\bfunction\b/g) || [];
  const arrows = text.match(/=>/g) || [];
  return { value: fnKeyword.length + arrows.length, evidence: [] };
}
