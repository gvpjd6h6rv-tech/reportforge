'use strict';
import { countLines } from '../../../audit/architecture/count_lines.mjs';
import { countLogicalStatements } from '../../../audit/architecture/count_logical_statements.mjs';

/**
 * metricLocNormalized — max(physical lines, logical statements). Never
 * drops below the real statement count when lines get squeezed together
 * (no credit for fusing/minifying), never rises just because a file has
 * generous whitespace/decorative line breaks. Report-only capability
 * (RF-SP-SCORE-HARDENING-1): not yet wired into runSaladScore's default
 * pipeline — see the isolated impact measurement before any such wiring.
 */
export function metricLocNormalized(text) {
  const physical = countLines(text);
  const logical = countLogicalStatements(text);
  return { value: Math.max(physical, logical), evidence: [] };
}
