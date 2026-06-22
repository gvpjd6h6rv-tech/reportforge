'use strict';
import { normalizeCappedLinear } from '../normalizers/normalize_capped_linear.mjs';

/** SP_BEHAVIOR_SCORE: weighted sum of the 5 checker-derived signals (booleans treated as 0/100, numbers capped-normalized). */
export function scoreBehavior(signals, weights, caps) {
  let total = 0;
  for (const key of Object.keys(weights)) {
    const raw = signals[key];
    const numeric = typeof raw === 'boolean'
      ? (raw ? 100 : 0)
      : normalizeCappedLinear(raw ?? 0, caps[key] ?? 1);
    total += numeric * weights[key];
  }
  return total;
}
