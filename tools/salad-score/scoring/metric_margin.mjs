'use strict';

/**
 * SP-MARGIN-01 — generic per-metric margin classification.
 *
 * Two pure rules, matching the manual policy used throughout SP-CLEANUP-01:
 *  - marginForCappedMetric: large metrics measured against a hard cap
 *    (raw LOC, normalized LOC, complexity, nesting, bytes, and any 0-100
 *    scorer output treated as capped at its own contract maximum).
 *  - marginForBaselineScore: sp_total_score against its own per-file
 *    registered ratchet baseline, tiered by baseline magnitude.
 *
 * STRUCTURAL_WARNING is intentionally never returned here — it requires
 * explicit human-documented evidence and is applied outside this module.
 * Unknown/missing limits return NOT_APPLICABLE, never an invented one.
 */

export function marginForCappedMetric(value, limit) {
  if (typeof limit !== 'number' || !Number.isFinite(limit) || limit <= 0) {
    return { status: 'NOT_APPLICABLE', value, limit: null, okTarget: null };
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return { status: 'UNKNOWN', value, limit, okTarget: null };
  }
  const okTarget = Math.floor(limit * 0.90);
  const status = value <= okTarget ? 'OK' : value <= limit ? 'WARNING' : 'FAIL';
  return { status, value, limit, okTarget };
}

export function marginForBaselineScore(value, limit) {
  if (typeof limit !== 'number' || !Number.isFinite(limit)) {
    return { status: 'NOT_APPLICABLE', value, limit: null, okTarget: null };
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return { status: 'UNKNOWN', value, limit, okTarget: null };
  }
  const okTarget = limit < 20 ? limit - 1 : limit <= 39 ? limit - 2 : Math.floor(limit * 0.90);
  const status = value <= okTarget ? 'OK' : value <= limit ? 'WARNING' : 'FAIL';
  return { status, value, limit, okTarget };
}

/** Applies METRIC_MARGIN_POLICY to one file's already-computed values. Pure — no I/O, no mutation. */
export function computeFileMetricMargins(values, policy, caps, baselineForFile) {
  return policy.map((entry) => {
    const value = values[entry.key] ?? null;
    const limit = entry.kind === 'baseline' ? (baselineForFile ?? null) : (entry.fixedLimit ?? caps[entry.capKey]);
    const margin = entry.kind === 'baseline'
      ? marginForBaselineScore(value, limit)
      : marginForCappedMetric(value, limit);
    return { key: entry.key, label: entry.label, ...margin };
  });
}
