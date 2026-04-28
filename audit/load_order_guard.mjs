#!/usr/bin/env node
'use strict';
/**
 * load_order_guard.mjs — Principle #31 Sin dependencia en orden accidental
 *
 * Verifies that critical engine initialization pairs appear in the correct
 * relative order in RuntimeBootstrap.js and DeferredBootstrap.js.
 * An engine that references another must always see it already initialized.
 *
 * RULE-A (ORDER-BOOT-001): In RuntimeBootstrap.js —
 *   DesignerUI.init() must appear before ZoomEngine.set() (UI shell before
 *   zoom engine writes to canvas).
 *   SectionEngine.init() must appear before DS.saveHistory() (sections must
 *   exist before history takes its first snapshot).
 *
 * RULE-B (ORDER-DEFERRED-001): In DeferredBootstrap.js —
 *   RenderScheduler.flushSync must appear before CanvasLayoutEngine patch
 *   (scheduler must be active before canvas wiring).
 *   CanvasLayoutEngine.__active = true must appear before
 *   SelectionEngine.__active = true (canvas ownership claimed before
 *   selection ownership — selection depends on canvas coords).
 *   EngineCore online log must appear before CanvasLayoutEngine.__active
 *   assignment (EngineCore activates before per-engine __active flags).
 *
 * RULE-C (ORDER-REGISTRY-001): DeferredBootstrap.js must reference
 *   RuntimeServicesDeferred.expose('EngineRegistry') — the engine registry
 *   must be exposed for cross-engine lookup after deferred boot.
 *
 * Usage:
 *   node audit/load_order_guard.mjs          # fail on violations
 *   node audit/load_order_guard.mjs --report # report only
 */

import fs   from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT    = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENGINES = path.join(ROOT, 'engines');
const ARGS    = process.argv.slice(2);
const REPORT  = ARGS.includes('--report');

const readEngine = (f) => {
  const p = path.join(ENGINES, f);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
};

const runtimeSrc  = readEngine('RuntimeBootstrap.js');
const deferredSrc = readEngine('DeferredBootstrap.js');

const violations = [];

function check(rule, file, condition, desc) {
  if (!condition) violations.push({ rule, file, desc });
}

function before(src, patternA, patternB) {
  const idxA = src.search(patternA);
  const idxB = src.search(patternB);
  return idxA !== -1 && idxB !== -1 && idxA < idxB;
}

// ── RULE-A: RuntimeBootstrap.js load order ────────────────────────────────────

check('ORDER-BOOT-001', 'engines/RuntimeBootstrap.js',
  before(runtimeSrc, /DesignerUI\.init\(\)/, /ZoomEngine\.set\(/),
  'DesignerUI.init() must appear before ZoomEngine.set() in RuntimeBootstrap.js');

check('ORDER-BOOT-001', 'engines/RuntimeBootstrap.js',
  before(runtimeSrc, /SectionEngine\.init\(\)/, /DS\.saveHistory\(\)/),
  'SectionEngine.init() must appear before DS.saveHistory() in RuntimeBootstrap.js');

// ── RULE-B: DeferredBootstrap.js load order ───────────────────────────────────

check('ORDER-DEFERRED-001', 'engines/DeferredBootstrap.js',
  before(deferredSrc, /RenderScheduler\.flushSync/, /CanvasLayoutEngine\.__active/),
  'RenderScheduler.flushSync must appear before CanvasLayoutEngine.__active in DeferredBootstrap.js');

check('ORDER-DEFERRED-001', 'engines/DeferredBootstrap.js',
  before(deferredSrc, /CanvasLayoutEngine\.__active\s*=\s*true/, /SelectionEngine\.__active\s*=\s*true/),
  'CanvasLayoutEngine.__active = true must appear before SelectionEngine.__active = true in DeferredBootstrap.js');

check('ORDER-DEFERRED-001', 'engines/DeferredBootstrap.js',
  before(deferredSrc, /EngineCore online|v19\.4.*EngineCore online/, /CanvasLayoutEngine\.__active/),
  'EngineCore online log must appear before CanvasLayoutEngine.__active in DeferredBootstrap.js');

// ── RULE-C: EngineRegistry exposed in deferred boot ──────────────────────────

check('ORDER-REGISTRY-001', 'engines/DeferredBootstrap.js',
  /RuntimeServicesDeferred.*expose.*EngineRegistry/.test(deferredSrc),
  'DeferredBootstrap.js must expose EngineRegistry via RuntimeServicesDeferred after engine activation');

// ── Report ─────────────────────────────────────────────────────────────────────

console.log('── Load Order Guard (#31) ────────────────────────────────────────');
console.log(`   violations found: ${violations.length}`);

if (violations.length > 0) {
  console.error('\n  Violations:');
  for (const v of violations) {
    console.error(`  [${v.rule}] ${v.file}`);
    console.error(`    → ${v.desc}`);
  }
}

if (violations.length === 0) {
  console.log('\n✅ load order intact — critical engine pairs initialize in correct sequence\n');
  process.exit(0);
}

console.error('\n❌ load order gap — engine initialized before its dependency');
console.error('   Fix: reorder initializations so dependencies come first\n');
if (!REPORT) process.exit(1);
