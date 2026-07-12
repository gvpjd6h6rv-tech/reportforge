'use strict';
const ALLOWED = new Set(['PASS', 'FAIL']);
/** RULE: FINAL_GATE_STATUS and every CHECKS entry must be PASS or FAIL --
 *  no other value is a valid gate status. */
export function checkResultStatusDomain(result) {
  const evidence = [];
  if (result.CHECKS) {
    for (const [k, v] of Object.entries(result.CHECKS)) if (!ALLOWED.has(v)) evidence.push(`CHECKS.${k}=${v}`);
  }
  if (!ALLOWED.has(result.FINAL_GATE_STATUS)) evidence.push(`FINAL_GATE_STATUS=${result.FINAL_GATE_STATUS}`);
  return { value: evidence.length === 0, evidence };
}
