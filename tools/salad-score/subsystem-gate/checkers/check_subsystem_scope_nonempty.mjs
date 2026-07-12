'use strict';
/** RULE: a known subsystem's declared file list must not be empty. */
export function checkSubsystemScopeNonempty(declaredFiles) {
  const pass = Array.isArray(declaredFiles) && declaredFiles.length > 0;
  return { value: pass, evidence: pass ? [] : ['declared file list is empty'] };
}
