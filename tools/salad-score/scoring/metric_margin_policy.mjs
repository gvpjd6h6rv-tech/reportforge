'use strict';

/**
 * SP-MARGIN-01 — declares WHICH metrics get a margin classification and
 * WHERE their limit comes from. Pure data only, no logic.
 *
 * kind: 'capped'   -> limit is config.caps[capKey], or fixedLimit when the
 *                     metric has no cap key but a known structural maximum
 *                     (sp_file_score / sp_behavior_score are contractually
 *                     bounded to [0,100] — see contract_scorer.mjs).
 * kind: 'baseline' -> limit is the per-file registered ratchet baseline.
 *
 * 'bytes' has no capKey entry in salad-score.config.json today, so it
 * resolves to NOT_APPLICABLE — that absence is itself the honest, correct
 * coverage the task requires ("bytes/file size si existe cap").
 */
export const METRIC_MARGIN_POLICY = [
  { key: 'loc', label: 'raw LOC', kind: 'capped', capKey: 'loc' },
  { key: 'loc_normalized', label: 'normalized LOC', kind: 'capped', capKey: 'loc' },
  { key: 'complexity', label: 'complexity', kind: 'capped', capKey: 'complexity' },
  { key: 'nesting', label: 'nesting', kind: 'capped', capKey: 'nesting' },
  { key: 'sp_file_score', label: 'structure/file score', kind: 'capped', capKey: null, fixedLimit: 100 },
  { key: 'sp_behavior_score', label: 'behavior score', kind: 'capped', capKey: null, fixedLimit: 100 },
  { key: 'bytes', label: 'file size (bytes)', kind: 'capped', capKey: 'bytes' },
  { key: 'sp_total_score', label: 'sp_total_score', kind: 'baseline' },
];
