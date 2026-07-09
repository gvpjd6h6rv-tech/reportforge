'use strict';

/** RULE (report-only, non-blocking): flags when normalized LOC exceeds raw LOC — never fails scoring, only surfaces evidence. */
export function checkLocNormalizationWarning(rawLoc, normalizedLoc) {
  const delta = normalizedLoc - rawLoc;
  return {
    value: delta > 0,
    evidence: delta > 0 ? [`raw=${rawLoc} normalized=${normalizedLoc} delta=+${delta}`] : [],
  };
}
