'use strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ENGINES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../engines');

function before(src, patA, patB) {
  const a = src.search(patA);
  const b = src.search(patB);
  return a !== -1 && b !== -1 && a < b;
}

/** RULE: In RuntimeBootstrap.js, DesignerUI.init() must precede ZoomEngine.set()
 *  and SectionEngine.init() must precede DS.saveHistory(). */
export function checkLoadOrderRuntimeBootstrap(enginesDir = ENGINES) {
  const src = fs.readFileSync(path.join(enginesDir, 'RuntimeBootstrap.js'), 'utf8');
  const evidence = [];
  if (!before(src, /DesignerUI\.init\(\)/, /ZoomEngine\.set\(/))
    evidence.push('engines/RuntimeBootstrap.js: DesignerUI.init() must appear before ZoomEngine.set()');
  if (!before(src, /SectionEngine\.init\(\)/, /DS\.saveHistory\(\)/))
    evidence.push('engines/RuntimeBootstrap.js: SectionEngine.init() must appear before DS.saveHistory()');
  return { value: evidence.length === 0, evidence };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const r = checkLoadOrderRuntimeBootstrap();
  console.log(r.value ? '✓ PASS ORDER-BOOT-001' : '✗ FAIL ORDER-BOOT-001');
  r.evidence.forEach(e => console.error(' ', e));
  process.exit(r.value ? 0 : 1);
}
