'use strict';

/** Counts distinct configured global identifiers referenced in the file. */
export function metricGlobals(text, globalIdentifiers = []) {
  const found = [];
  for (const g of globalIdentifiers) {
    const re = new RegExp(`\\b${g}\\b`);
    if (re.test(text)) found.push(g);
  }
  return { value: found.length, evidence: found };
}
