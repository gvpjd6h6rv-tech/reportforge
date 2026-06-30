'use strict';
/**
 * build_report.mjs — pure reporter (1 responsibility: assemble the JSON report object).
 * No I/O, no logic, no rule evaluation.
 */
export function buildReport({ mode, results, comparisons, mapPath }) {
  const ts = new Date().toISOString();
  const modular = results.filter(r => r.mode === 'modular');
  const legacy  = results.filter(r => r.mode === 'legacy');

  const summary = {
    mode,
    timestamp: ts,
    mapPath,
    modularTotal:  modular.length,
    modularPass:   modular.filter(r => r.pass).length,
    modularFail:   modular.filter(r => !r.pass).length,
    legacyTotal:   legacy.length,
    legacyPass:    legacy.filter(r => r.pass).length,
    legacyFail:    legacy.filter(r => !r.pass).length,
    comparisonsTotal:     comparisons.length,
    comparisonsEquiv:     comparisons.filter(c => c.equivalent).length,
    comparisonsDivergent: comparisons.filter(c => !c.equivalent).length,
  };

  return {
    summary,
    modularResults: modular.map(r => ({
      guard:         r.id,
      owner:         r.owner,
      legacyResult:  null,
      modularResult: r.pass,
      equivalent:    null,
      elapsed:       r.elapsed,
      evidence:      r.evidence,
      error:         r.error,
    })),
    legacyResults: legacy.map(r => ({
      guard:         r.id,
      owner:         r.owner,
      legacyResult:  r.pass,
      modularResult: null,
      equivalent:    null,
      elapsed:       r.elapsed,
      evidence:      r.evidence,
    })),
    comparisons,
    blocking: false,
  };
}
