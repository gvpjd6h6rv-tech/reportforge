import fs from 'node:fs';
import { listJsFiles } from './list_js_files.mjs';
import { countLines } from './count_lines.mjs';

export function checkMaxLines(rule) {
  const errors = [];

  for (const file of listJsFiles(rule.path)) {
    const text = fs.readFileSync(file, 'utf8');
    const limit = rule.maxLinesPerFile || rule.maxLines;
    if (!limit) continue;

    const lines = countLines(text);
    if (lines > limit) errors.push(`${file}: ${lines} lines > ${limit}`);
  }

  return errors;
}
