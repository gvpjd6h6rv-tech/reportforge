import { loadOwnershipMap } from './load_ownership_map.mjs';
import { checkMaxLines } from './check_max_lines.mjs';
import { checkDecisionBudget } from './check_decision_budget.mjs';
import { checkForbiddenPatterns } from './check_forbidden_patterns.mjs';
import { checkRequiredPatterns } from './check_required_patterns.mjs';
import { checkRequiredFiles } from './check_required_files.mjs';

const CHECKS = [
  checkRequiredFiles,
  checkRequiredPatterns,
  checkForbiddenPatterns,
  checkMaxLines,
  checkDecisionBudget,
];

export function runOwnershipGuard() {
  const map = loadOwnershipMap();
  const errors = [];

  for (const rule of map.rules || []) {
    for (const check of CHECKS) errors.push(...check(rule));
  }

  return { ok: errors.length === 0, errors, map };
}
