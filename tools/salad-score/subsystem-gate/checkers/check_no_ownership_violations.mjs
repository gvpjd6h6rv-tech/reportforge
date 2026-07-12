'use strict';
/** RULE: no scoped file may resolve to owner "unowned". Reuses the owner
 *  field runSaladScore already computed per file — does not recompute
 *  ownership lookup. Same underlying fact powers both UNOWNED_FILES and
 *  OWNERSHIP_VIOLATIONS in the final result (one rule, two report labels). */
export function checkNoOwnershipViolations(scopedResults) {
  const violators = scopedResults.filter((r) => r.owner === 'unowned').map((r) => r.path);
  return { value: violators.length === 0, evidence: violators };
}
