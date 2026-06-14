import fs from 'node:fs';
import { listJsFiles } from './list_js_files.mjs';
import { countDecisionPoints } from './count_decision_points.mjs';

export function checkDecisionBudget(rule) {
  const errors = [];

  for (const file of listJsFiles(rule.path)) {
    const text = fs.readFileSync(file, 'utf8');
    const limit = rule.maxDecisionPointsPerFile || rule.maxDecisionPoints;
    if (!limit) continue;

    const points = countDecisionPoints(text);
    if (points > limit) errors.push(`${file}: CC≈${points} > ${limit}`);
  }

  return errors;
}
