'use strict';
/** RULE: every declared file must appear among the files runSaladScore scanned. */
export function checkDeclaredFilesScanned(declaredFiles, scannedPaths) {
  const scanned = new Set(scannedPaths);
  const missing = declaredFiles.filter((f) => !scanned.has(f));
  return { value: missing.length === 0, evidence: missing };
}
