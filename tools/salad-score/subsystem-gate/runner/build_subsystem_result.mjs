'use strict';
/** Assembles the final subsystem-gate result object. Pure assembly -- no
 *  scoring formula, no file-system reads, no rule logic of its own. */
export function buildSubsystemResult({ subsystemId, allOwnedFiles, scoreableFiles, nonScoreableFiles, scannedScoreablePaths, scopedResults, checks, subsystemScore }) {
  const allChecksPass = Object.values(checks).every((c) => c.value === true);
  return {
    SUBSYSTEM_ID: subsystemId,
    ALL_OWNED_FILES: [...allOwnedFiles].sort(),
    SP_SCOREABLE_FILES: [...scoreableFiles].sort(),
    NON_SCOREABLE_FILES: [...nonScoreableFiles].sort(),
    SCANNED_SCOREABLE_FILES: [...scannedScoreablePaths].sort(),
    MISSING_SCOREABLE_FILES: [...checks.scoreableFilesScanned.evidence].sort(),
    MISSING_NON_SCOREABLE_FILES: [...checks.nonScoreableFilesExist.evidence].sort(),
    UNOWNED_SCOREABLE_FILES: [...checks.noOwnershipViolations.evidence].sort(),
    UNOWNED_NON_SCOREABLE_FILES: [...checks.nonScoreableOwnership.evidence].sort(),
    OWNERSHIP_VIOLATIONS: [...new Set([...checks.noOwnershipViolations.evidence, ...checks.nonScoreableOwnership.evidence])].sort(),
    HIDDEN_SIDE_EFFECTS: [...checks.noHiddenSideEffectsInScope.evidence].sort(),
    FILES_OVER_20: [...checks.noFilesOver20.evidence].sort(),
    SP_SUBSYSTEM_SCORE: subsystemScore,
    CHECKS: Object.fromEntries(Object.entries(checks).map(([k, v]) => [k, v.value ? 'PASS' : 'FAIL'])),
    FINAL_GATE_STATUS: allChecksPass ? 'PASS' : 'FAIL',
  };
}
