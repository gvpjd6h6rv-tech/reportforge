'use strict';
const REQUIRED_KEYS = [
  'SUBSYSTEM_ID', 'ALL_OWNED_FILES', 'SP_SCOREABLE_FILES', 'NON_SCOREABLE_FILES',
  'SCANNED_SCOREABLE_FILES', 'MISSING_SCOREABLE_FILES', 'MISSING_NON_SCOREABLE_FILES',
  'UNOWNED_SCOREABLE_FILES', 'UNOWNED_NON_SCOREABLE_FILES', 'OWNERSHIP_VIOLATIONS', 'HIDDEN_SIDE_EFFECTS', 'FILES_OVER_20',
  'SP_SUBSYSTEM_SCORE', 'CHECKS', 'FINAL_GATE_STATUS',
];
/** RULE: the result object must expose every required key. */
export function checkResultShapeKeys(result) {
  const missing = REQUIRED_KEYS.filter((k) => !(k in result));
  return { value: missing.length === 0, evidence: missing };
}
