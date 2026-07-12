'use strict';
const LIST_KEYS = ['ALL_OWNED_FILES', 'SP_SCOREABLE_FILES', 'NON_SCOREABLE_FILES', 'SCANNED_SCOREABLE_FILES', 'MISSING_SCOREABLE_FILES', 'MISSING_NON_SCOREABLE_FILES', 'UNOWNED_SCOREABLE_FILES', 'UNOWNED_NON_SCOREABLE_FILES', 'OWNERSHIP_VIOLATIONS', 'HIDDEN_SIDE_EFFECTS', 'FILES_OVER_20'];
/** RULE: every list-valued field must be in sorted (deterministic) order. */
export function checkResultListsSorted(result) {
  const evidence = [];
  for (const k of LIST_KEYS) {
    const v = result[k];
    if (Array.isArray(v) && JSON.stringify(v) !== JSON.stringify([...v].sort())) evidence.push(k);
  }
  return { value: evidence.length === 0, evidence };
}
