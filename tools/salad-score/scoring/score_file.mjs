'use strict';
import { normalizeCappedLinear } from '../normalizers/normalize_capped_linear.mjs';

/** SP_FILE_SCORE: weighted sum of the 9 structural metrics, each capped-linear normalized to 0-100. */
export function scoreFile(metrics, weights, caps) {
  let total = 0;
  for (const key of Object.keys(weights)) {
    const raw = metrics[key] ?? 0;
    const cap = caps[key] ?? 1;
    total += normalizeCappedLinear(raw, cap) * weights[key];
  }
  return total;
}
