'use strict';

/** The single normalization function reused by every metric: caps a raw value and scales it to 0-100. */
export function normalizeCappedLinear(rawValue, cap) {
  if (!cap || cap <= 0) return 0;
  return Math.min(rawValue / cap, 1) * 100;
}
