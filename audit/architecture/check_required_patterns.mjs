import fs from 'node:fs';

export function checkRequiredPatterns(rule) {
  const errors = [];
  if (!rule.requiredPatterns?.length) return errors;

  const text = fs.readFileSync(rule.path, 'utf8');
  for (const pattern of rule.requiredPatterns) {
    if (!text.includes(pattern)) errors.push(`${rule.path}: missing required pattern: ${pattern}`);
  }

  return errors;
}
