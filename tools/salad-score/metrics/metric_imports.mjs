'use strict';

/** Counts import/require statements. Declared approximation via regex, not AST. */
export function metricImports(text) {
  const re = /\bimport\s+[^;]*?from\s+['"][^'"]+['"]|\brequire\(\s*['"][^'"]+['"]\s*\)/g;
  const matches = text.match(re) || [];
  return { value: matches.length, evidence: matches.slice(0, 10) };
}
