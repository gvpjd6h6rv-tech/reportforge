'use strict';
/** RULE: an empty ALL_OWNED_FILES set must never yield FINAL_GATE_STATUS=PASS. */
export function checkResultNoEmptyScopePass(result) {
  const bad = Array.isArray(result.ALL_OWNED_FILES) && result.ALL_OWNED_FILES.length === 0 && result.FINAL_GATE_STATUS === 'PASS';
  return { value: !bad, evidence: bad ? ['empty ALL_OWNED_FILES produced PASS'] : [] };
}
