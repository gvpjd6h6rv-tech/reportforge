#!/usr/bin/env node
'use strict';
/**
 * bootstrap_idempotency_guard.mjs — Principle #12 Bootstrap limpio
 *
 * Verifies that the runtime boot sequence is structured for idempotent
 * repeated execution: DOMContentLoaded handlers are guarded, critical engine
 * init calls are present, and the boot log confirms phase 3 is active.
 *
 * RULE-A (BOOT-CLEAN-001): DeferredBootstrap.js must contain the phase-3
 *   ready log line — confirming the deferred boot path is complete.
 *
 * RULE-B (BOOT-CLEAN-002): RuntimeBootstrap.js must call DesignerUI.init()
 *   and SectionEngine.init() inside a DOMContentLoaded handler — engines must
 *   not init at module parse time.
 *
 * RULE-C (BOOT-CLEAN-003): The five idempotency guard flags must be present
 *   (already verified by reload_storm_guard, cross-referenced here to confirm
 *   the same file set is covered). At minimum, DeferredBootstrap must contain
 *   _rfPhase3Patched and RuntimeBootstrap must contain _rfPhase2ZoomPatched.
 *
 * RULE-D (BOOT-CLEAN-004): RuntimeBootstrap.js must call DS.saveHistory()
 *   after SectionEngine.init() — the first history snapshot must be taken only
 *   after sections exist, so undo cannot restore a blank document.
 *
 * RULE-E (BOOT-CLEAN-005): DeferredBootstrap.js must call
 *   RuntimeServicesDeferred.expose('EngineRegistry') — the registry must be
 *   published for cross-engine lookup after the deferred boot phase.
 *
 * Usage:
 *   node audit/bootstrap_idempotency_guard.mjs          # fail on violations
 *   node audit/bootstrap_idempotency_guard.mjs --report # report only
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

function indexOfFirst(src, pattern) {
  const m = src.search(pattern);
  return m;
}

function before(src, patternA, patternB) {
  const a = indexOfFirst(src, patternA);
  const b = indexOfFirst(src, patternB);
  return a !== -1 && b !== -1 && a < b;
}

// ── RULE-A: Phase-3 ready log is present in DeferredBootstrap ─────────────────

check('BOOT-CLEAN-001', 'engines/DeferredBootstrap.js',
  /Phase 3 engines ready|v19\.3.*Phase 3/.test(deferredSrc),
  'DeferredBootstrap.js must log "Phase 3 engines ready" — confirming deferred boot completed');

// ── RULE-B: Critical inits are inside DOMContentLoaded, not at parse time ─────

// Heuristic: DesignerUI.init() must appear after "DOMContentLoaded" in the source.
check('BOOT-CLEAN-002', 'engines/RuntimeBootstrap.js',
  before(runtimeSrc, /DOMContentLoaded/, /DesignerUI\.init\(\)/),
  'DesignerUI.init() must be inside a DOMContentLoaded handler in RuntimeBootstrap.js');

check('BOOT-CLEAN-002', 'engines/RuntimeBootstrap.js',
  before(runtimeSrc, /DOMContentLoaded/, /SectionEngine\.init\(\)/),
  'SectionEngine.init() must be inside a DOMContentLoaded handler in RuntimeBootstrap.js');

// ── RULE-C: Idempotency guard flags present ───────────────────────────────────

check('BOOT-CLEAN-003', 'engines/DeferredBootstrap.js',
  /_rfPhase3Patched/.test(deferredSrc),
  'DeferredBootstrap.js must contain _rfPhase3Patched idempotency guard');

check('BOOT-CLEAN-003', 'engines/RuntimeBootstrap.js',
  /_rfPhase2ZoomPatched/.test(runtimeSrc),
  'RuntimeBootstrap.js must contain _rfPhase2ZoomPatched idempotency guard');

// ── RULE-D: DS.saveHistory() follows SectionEngine.init() ────────────────────

check('BOOT-CLEAN-004', 'engines/RuntimeBootstrap.js',
  before(runtimeSrc, /SectionEngine\.init\(\)/, /DS\.saveHistory\(\)/),
  'DS.saveHistory() must appear after SectionEngine.init() in RuntimeBootstrap.js — first snapshot must see sections');

// ── RULE-E: EngineRegistry exposed after deferred boot ───────────────────────

check('BOOT-CLEAN-005', 'engines/DeferredBootstrap.js',
  /RuntimeServicesDeferred.*expose.*EngineRegistry/.test(deferredSrc),
  'DeferredBootstrap.js must expose EngineRegistry via RuntimeServicesDeferred for cross-engine lookup');

// ── Report ─────────────────────────────────────────────────────────────────────

console.log('── Bootstrap Idempotency Guard (#12) ────────────────────────────');
console.log(`   violations found: ${violations.length}`);

if (violations.length > 0) {
  console.error('\n  Violations:');
  for (const v of violations) {
    console.error(`  [${v.rule}] ${v.file}`);
    console.error(`    → ${v.desc}`);
  }
}

if (violations.length === 0) {
  console.log('\n✅ bootstrap clean — phase 3 ready, inits inside DOMContentLoaded, guards present\n');
  process.exit(0);
}

console.error('\n❌ bootstrap discipline gap — boot sequence may init at parse time or lack guards');
console.error('   Fix: wrap all engine inits in DOMContentLoaded; add idempotency flags\n');
if (!REPORT) process.exit(1);
