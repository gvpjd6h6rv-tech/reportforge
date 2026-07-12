'use strict';
/** RULE: when the scoreable set is empty, SP_SUBSYSTEM_SCORE must be a
 *  NOT_OBSERVABLE marker, never a falsy/zero value silently standing in
 *  for "no data". */
export function checkResultNotObservablePreserved(result) {
  const emptyScoreable = Array.isArray(result.SP_SCOREABLE_FILES) && result.SP_SCOREABLE_FILES.length === 0;
  const collapsed = emptyScoreable && (result.SP_SUBSYSTEM_SCORE === 0 || result.SP_SUBSYSTEM_SCORE === '' || result.SP_SUBSYSTEM_SCORE === null);
  return { value: !collapsed, evidence: collapsed ? ['SP_SUBSYSTEM_SCORE collapsed to a falsy value with an empty scoreable set'] : [] };
}
