import fs from 'node:fs';
import path from 'node:path';

export function checkRequiredFiles(rule) {
  const errors = [];

  for (const filename of rule.requiredFiles || []) {
    const fullPath = path.join(rule.path, filename);
    if (!fs.existsSync(fullPath)) errors.push(`${rule.path}: missing required file: ${filename}`);
  }

  return errors;
}
