'use strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ENGINES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../engines');

/** RULE: HistoryEngine.js must not expose _undoStack or _redoStack in its return object. */
export function checkHistoryNoExpose(enginesDir = ENGINES) {
  const src = fs.readFileSync(path.join(enginesDir, 'HistoryEngine.js'), 'utf8');
  const returnBlock = src.slice(src.indexOf('return {'));
  const undoExposed = /\bundoStack\s*[,}]/.test(returnBlock);
  const redoExposed = /\bredoStack\s*[,}]/.test(returnBlock);
  const evidence = [];
  if (undoExposed) evidence.push('engines/HistoryEngine.js: _undoStack exposed in return object');
  if (redoExposed) evidence.push('engines/HistoryEngine.js: _redoStack exposed in return object');
  return { value: evidence.length === 0, evidence };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const r = checkHistoryNoExpose();
  console.log(r.value ? '✓ PASS IMMUT-EXPOSE-001' : '✗ FAIL IMMUT-EXPOSE-001');
  r.evidence.forEach(e => console.error(' ', e));
  process.exit(r.value ? 0 : 1);
}
