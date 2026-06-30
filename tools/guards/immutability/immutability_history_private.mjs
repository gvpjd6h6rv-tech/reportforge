'use strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ENGINES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../engines');

/** RULE: _undoStack and _redoStack must exist only in HistoryEngine.js. */
export function checkHistoryPrivate(enginesDir = ENGINES) {
  const files = fs.readdirSync(enginesDir).filter(f => f.endsWith('.js') && f !== 'HistoryEngine.js');
  const leaks = files.filter(f => /_undoStack|_redoStack/.test(fs.readFileSync(path.join(enginesDir, f), 'utf8')));
  const pass = leaks.length === 0;
  return { value: pass, evidence: pass ? [] : leaks.map(f => `engines/${f}: contains _undoStack or _redoStack`) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const r = checkHistoryPrivate();
  console.log(r.value ? '✓ PASS IMMUT-HIST-001' : '✗ FAIL IMMUT-HIST-001');
  r.evidence.forEach(e => console.error(' ', e));
  process.exit(r.value ? 0 : 1);
}
