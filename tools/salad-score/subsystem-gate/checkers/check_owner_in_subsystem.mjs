'use strict';
/** RULE: every scoped file's owner must be one of the subsystem's declared
 *  allowedOwners. Distinct from ownership violation (owner==='unowned'):
 *  a file can have a REAL owner and still not belong to THIS subsystem. */
export function checkOwnerInSubsystem(scopedResults, allowedOwners) {
  const violators = scopedResults
    .filter((r) => r.owner !== 'unowned' && !allowedOwners.includes(r.owner))
    .map((r) => r.path);
  return { value: violators.length === 0, evidence: violators };
}
