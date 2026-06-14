import fs from 'node:fs';
import { listJsFiles } from './list_js_files.mjs';

export function checkForbiddenPatterns(rule) {
  const errors = [];

  for (const file of listJsFiles(rule.path)) {
    const text = fs.readFileSync(file, 'utf8');
    for (const pattern of rule.forbiddenPatterns || []) {
      if (text.includes(pattern)) errors.push(`${file}: forbidden pattern present: ${pattern}`);
    }
  }

  return errors;
}
