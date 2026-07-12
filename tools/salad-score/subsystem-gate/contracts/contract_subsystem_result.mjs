'use strict';
import { checkResultShapeKeys } from './check_result_shape_keys.mjs';
import { checkResultStatusDomain } from './check_result_status_domain.mjs';
import { checkResultListsSorted } from './check_result_lists_sorted.mjs';
import { checkResultNotObservablePreserved } from './check_result_not_observable_preserved.mjs';
import { checkResultNoEmptyScopePass } from './check_result_no_empty_scope_pass.mjs';

/** Orchestrates the 5 atomic result-shape checkers. Contains NO rule logic
 *  itself -- only sequencing and evidence aggregation. */
export function contractSubsystemResult(result) {
  const checks = [
    checkResultShapeKeys(result), checkResultStatusDomain(result), checkResultListsSorted(result),
    checkResultNotObservablePreserved(result), checkResultNoEmptyScopePass(result),
  ];
  const evidence = checks.flatMap((c) => c.evidence);
  return { value: checks.every((c) => c.value), evidence };
}
