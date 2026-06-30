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

/** RULE: In DeferredBootstrap.js, RenderScheduler.flushSync must precede
 *  CanvasLayoutEngine.__active, and CanvasLayoutEngine.__active = true must
 *  precede SelectionEngine.__active = true. */
export function checkLoadOrderDeferredBootstrap(enginesDir = ENGINES) {
  const src = fs.readFileSync(path.join(enginesDir, 'DeferredBootstrap.js'), 'utf8');
  const evidence = [];
  if (!before(src, /RenderScheduler\.flushSync/, /CanvasLayoutEngine\.__active/))
    evidence.push('engines/DeferredBootstrap.js: RenderScheduler.flushSync must appear before CanvasLayoutEngine.__active');
  if (!before(src, /CanvasLayoutEngine\.__active\s*=\s*true/, /SelectionEngine\.__active\s*=\s*true/))
    evidence.push('engines/DeferredBootstrap.js: CanvasLayoutEngine.__active = true must appear before SelectionEngine.__active = true');
  if (!before(src, /EngineCore online|v19\.4.*EngineCore online/, /CanvasLayoutEngine\.__active/))
    evidence.push('engines/DeferredBootstrap.js: EngineCore online log must appear before CanvasLayoutEngine.__active');
  return { value: evidence.length === 0, evidence };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const r = checkLoadOrderDeferredBootstrap();
  console.log(r.value ? '✓ PASS ORDER-DEFERRED-001' : '✗ FAIL ORDER-DEFERRED-001');
  r.evidence.forEach(e => console.error(' ', e));
  process.exit(r.value ? 0 : 1);
}
