'use strict';

/** RULE: a salad_score_*.test.mjs file must import from exactly one tools/salad-score/ module. */
export function checkTestSingleContract(filePath, text) {
  const imports = text.match(/from\s+['"][^'"]*tools\/salad-score\/[^'"]+['"]/g) || [];
  const uniqueModules = new Set(imports);
  const pass = uniqueModules.size <= 1;
  return { value: pass, evidence: pass ? [] : [...uniqueModules] };
}
