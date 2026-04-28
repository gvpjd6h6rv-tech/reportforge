#!/usr/bin/env node
'use strict';
/**
 * reload_storm_guard.mjs — Principle #65 Reload Storm Safety
 *
 * Static analysis verifying that boot-time monkey-patches are idempotency-guarded.
 * When DOMContentLoaded fires more than once (e.g. bfcache restore, history.back()
 * with a page that re-executes scripts, or test harnesses that replay boot),
 * unguarded patches stack: each re-fire wraps the function again, building a
 * chain of wrappers that multiplies side-effects.
 *
 * RULE-A (BOOT-IDEM-001): DeferredBootstrap.js must guard DS.saveHistory patching
 *   with _rfPhase3Patched so a second DOMContentLoaded does not double-wrap.
 *
 * RULE-B (BOOT-IDEM-002): DeferredBootstrap.js must guard DesignZoomEngine._apply
 *   patching with _rfPhase3Patched for the same reason.
 *
 * RULE-C (BOOT-IDEM-003): DeferredBootstrap.js must guard ZoomEngineV19.set
 *   patching with _rfEngineCorePatched.
 *
 * RULE-D (BOOT-IDEM-004): RuntimeBootstrap.js must guard OverlayEngine render
 *   patching with _rfV19Patched.
 *
 * RULE-E (BOOT-IDEM-005): RuntimeBootstrap.js must guard DesignZoomEngine._apply
 *   patches with _rfV19ZoomPatched and _rfPhase2ZoomPatched respectively.
 *
 * RULE-F (BOOT-COUNT-001): Neither DeferredBootstrap.js nor RuntimeBootstrap.js
 *   may register more than 4 DOMContentLoaded listeners — more than that suggests
 *   uncontrolled handler proliferation.
 *
 * Usage:
 *   node audit/reload_storm_guard.mjs          # fail on violations
 *   node audit/reload_storm_guard.mjs --report # report only
 */

import fs   from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT    = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENGINES = path.join(ROOT, 'engines');
const ARGS    = process.argv.slice(2);
const REPORT  = ARGS.includes('--report');

const read = (f) => fs.readFileSync(path.join(ENGINES, f), 'utf8');

const deferred  = read('DeferredBootstrap.js');
const bootstrap = read('RuntimeBootstrap.js');

const violations = [];

function check(rule, file, condition, desc) {
  if (!condition) violations.push({ rule, file: `engines/${file}`, desc });
}

// RULE-A: DS.saveHistory patch guarded with _rfPhase3Patched.
check('BOOT-IDEM-001', 'DeferredBootstrap.js',
  /_rfPhase3Patched/.test(deferred) &&
  /DS\.saveHistory\._rfPhase3Patched/.test(deferred),
  'DS.saveHistory patch must check !DS.saveHistory._rfPhase3Patched before wrapping (prevents double-wrap on bfcache/re-fire)');

// RULE-B: DesignZoomEngine._apply phase3 patch guarded.
check('BOOT-IDEM-002', 'DeferredBootstrap.js',
  /DesignZoomEngine\._apply\._rfPhase3Patched/.test(deferred),
  'DesignZoomEngine._apply phase3 patch must check _rfPhase3Patched before wrapping');

// RULE-C: ZoomEngineV19.set patch guarded.
check('BOOT-IDEM-003', 'DeferredBootstrap.js',
  /ZoomEngineV19\.set\._rfEngineCorePatched/.test(deferred),
  'ZoomEngineV19.set patch must check _rfEngineCorePatched before wrapping');

// RULE-D: OverlayEngine render patch guarded.
check('BOOT-IDEM-004', 'RuntimeBootstrap.js',
  /OverlayEngine\._rfV19Patched/.test(bootstrap),
  'OverlayEngine render patch must check _rfV19Patched before replacing render/renderSync');

// RULE-E: DesignZoomEngine._apply patches in RuntimeBootstrap guarded.
check('BOOT-IDEM-005', 'RuntimeBootstrap.js',
  /DesignZoomEngine\._apply\._rfV19ZoomPatched/.test(bootstrap),
  'DesignZoomEngine._apply v19 patch must check _rfV19ZoomPatched before wrapping');

check('BOOT-IDEM-005', 'RuntimeBootstrap.js',
  /DesignZoomEngine\._apply\._rfPhase2ZoomPatched/.test(bootstrap),
  'DesignZoomEngine._apply phase2 patch must check _rfPhase2ZoomPatched before wrapping');

// RULE-F: DOMContentLoaded handler count ≤ 4 per file.
function countHandlers(src) {
  return (src.match(/document\.addEventListener\s*\(\s*['"`]DOMContentLoaded['"`]/g) || []).length;
}
const deferredCount  = countHandlers(deferred);
const bootstrapCount = countHandlers(bootstrap);

check('BOOT-COUNT-001', 'DeferredBootstrap.js',
  deferredCount <= 4,
  `DeferredBootstrap.js has ${deferredCount} DOMContentLoaded listeners — max 4 permitted (found handler proliferation)`);

check('BOOT-COUNT-001', 'RuntimeBootstrap.js',
  bootstrapCount <= 4,
  `RuntimeBootstrap.js has ${bootstrapCount} DOMContentLoaded listeners — max 4 permitted`);

// ── Report ─────────────────────────────────────────────────────────────────────

console.log('── Reload Storm Guard (#65) ──────────────────────────────────────');
console.log(`   DeferredBootstrap  listeners: ${deferredCount}`);
console.log(`   RuntimeBootstrap   listeners: ${bootstrapCount}`);
console.log(`   violations found: ${violations.length}`);

if (violations.length > 0) {
  console.error('\n  Violations:');
  for (const v of violations) {
    console.error(`  [${v.rule}] ${v.file}`);
    console.error(`    → ${v.desc}`);
  }
}

if (violations.length === 0) {
  console.log('\n✅ boot idempotency guarded — all monkey-patches protected against double-application\n');
  process.exit(0);
}

console.error('\n❌ boot idempotency gap — monkey-patches can stack on repeated DOMContentLoaded');
console.error('   Fix: add _rfXxxPatched guards before each patch block in DeferredBootstrap and RuntimeBootstrap\n');
if (!REPORT) process.exit(1);
