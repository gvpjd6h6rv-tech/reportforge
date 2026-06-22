'use strict';

/** RULE: a checkers/*.mjs file must export exactly one function — 1 checker = 1 rule. */
export function checkGuardSingleRule(filePath, text) {
  const exportCount = (text.match(/^export function/gm) || []).length;
  const pass = exportCount <= 1;
  return { value: pass, evidence: pass ? [] : [`${filePath}: exports ${exportCount} functions, expected 1`] };
}
