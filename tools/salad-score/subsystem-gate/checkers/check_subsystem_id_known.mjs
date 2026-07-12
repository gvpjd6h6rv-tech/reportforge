'use strict';
/** RULE: the subsystemId must exist as a key in the scope map. */
export function checkSubsystemIdKnown(subsystemId, scopeCollectorResult) {
  const pass = !!subsystemId && scopeCollectorResult.exists === true;
  return { value: pass, evidence: pass ? [] : [`subsystemId "${subsystemId}" not found in scope map`] };
}
