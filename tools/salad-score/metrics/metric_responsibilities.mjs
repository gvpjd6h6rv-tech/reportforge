'use strict';

/**
 * Heuristic: detects which behavior categories co-exist in one file.
 * Returns the category list itself (not a count) — feeds both
 * responsibilities_detected (output contract) and the SP_FILE_SCORE input
 * (as value.length, computed by the caller).
 */
export function metricResponsibilities(text) {
  const categories = [];
  const evidence = [];

  const ioMatch = text.match(/\bfs\.\w+Sync\(|\bfetch\(/);
  if (ioMatch) { categories.push('io'); evidence.push(ioMatch[0]); }

  const domMatch = text.match(/\bdocument\.\w+|\bwindow\.\w+/);
  if (domMatch) { categories.push('dom-mutation'); evidence.push(domMatch[0]); }

  const stateMatch = text.match(/\bDS\.set\w+\(|\.state\s*=/);
  if (stateMatch) { categories.push('state-mutation'); evidence.push(stateMatch[0]); }

  const eventMatch = text.match(/addEventListener\(|dispatchEvent\(/);
  if (eventMatch) { categories.push('event-wiring'); evidence.push(eventMatch[0]); }

  const fnCount = (text.match(/\bfunction\b/g) || []).length;
  if (fnCount > 5) categories.push('business-logic');

  return { value: categories, evidence };
}
