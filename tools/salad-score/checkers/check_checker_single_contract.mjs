'use strict';

/** RULE: a checker file must import from at most 1 contracts/*.mjs module. */
export function checkCheckerSingleContract(filePath, text) {
  const contractImports = text.match(/from\s+['"][^'"]*contracts\/[^'"]+['"]/g) || [];
  const pass = contractImports.length <= 1;
  return { value: pass, evidence: pass ? [] : contractImports };
}
