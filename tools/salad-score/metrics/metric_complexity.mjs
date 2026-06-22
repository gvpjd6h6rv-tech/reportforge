'use strict';
import { countDecisionPoints } from '../../../audit/architecture/count_decision_points.mjs';

/**
 * Reuses the existing real RF primitive. Declared approximation, not a real
 * AST-based cyclomatic complexity — no AST parser is installed in this repo.
 */
export function metricComplexity(text) {
  return { value: countDecisionPoints(text), evidence: [] };
}
