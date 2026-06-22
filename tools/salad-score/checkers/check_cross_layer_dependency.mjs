'use strict';

/**
 * Flags import targets that belong to neither the file's own subsystem nor
 * the shared-files allowlist. v1: wired with safe defaults from the runner
 * (empty allow-lists) until a unified cross-map lookup exists — this never
 * produces a false positive today; full enforcement is a fase-2 item, not
 * faked here.
 */
export function checkCrossLayerDependency(importTargets = [], ownSubsystemFiles = [], sharedFiles = []) {
  const violations = importTargets.filter(
    (t) => !ownSubsystemFiles.includes(t) && !sharedFiles.includes(t)
  );
  return { value: violations.length > 0, evidence: violations };
}
