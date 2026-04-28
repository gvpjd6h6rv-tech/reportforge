#!/usr/bin/env node
'use strict';
/**
 * safe_rollback_guard.mjs — Principle #74 Safe Rollback Paths
 *
 * Static analysis verifying that the bridge/shim system is in a safe rollback
 * state: removed bridges are gone from code, active bridges are idempotency-
 * guarded, and the rollback documentation is complete.
 *
 * RULE-A (ROLLBACK-CERRADO-001): Bridges marked "cerrado" (removed) in
 *   bridges-and-shims.md must not have their characteristic code patterns
 *   present in RuntimeBootstrap.js or DeferredBootstrap.js. If they reappear,
 *   the rollback was accidentally reversed.
 *
 * RULE-B (ROLLBACK-GUARD-001): Each active P0/P1 bridge must be idempotency-
 *   guarded (verified by the presence of _rf*Patched flags). Without guards,
 *   rolling back to a previous version of the file and re-deploying would
 *   silently double-wrap the patched function.
 *
 * RULE-C (ROLLBACK-DOC-001): bridges-and-shims.md must exist and contain the
 *   "Rollback path" column header and a "Safe Rollback Contract" section.
 *   Missing documentation means the rollback path is undefined.
 *
 * RULE-D (ROLLBACK-DOC-001): testing-canon.md must contain the three-attempt
 *   convergence rule text — confirming operational discipline is documented.
 *
 * Usage:
 *   node audit/safe_rollback_guard.mjs          # fail on violations
 *   node audit/safe_rollback_guard.mjs --report # report only
 */

import fs   from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT    = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENGINES = path.join(ROOT, 'engines');
const DOCS    = path.join(ROOT, 'docs', 'architecture');
const ARGS    = process.argv.slice(2);
const REPORT  = ARGS.includes('--report');

const readEngine = (f) => {
  const p = path.join(ENGINES, f);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
};
const readDoc = (f) => {
  const p = path.join(DOCS, f);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
};

const bootstrap  = readEngine('RuntimeBootstrap.js');
const deferred   = readEngine('DeferredBootstrap.js');
const bridgesDoc = readDoc('bridges-and-shims.md');
const canonDoc   = readDoc('testing-canon.md');

const violations = [];

function check(rule, file, condition, desc) {
  if (!condition) violations.push({ rule, file, desc });
}

// ── RULE-A: cerrado bridges must not reappear ─────────────────────────────────

// The three removed canvas/selection/preview bridges were monolith patches that
// directly assigned new functions to CanvasLayoutEngine, SelectionEngine, and
// PreviewEngineV19 from within the DOMContentLoaded handlers. Their presence
// would be signalled by legacy facade assignment patterns.

// Legacy canvas bridge fingerprint: assigning a new render/update function
// to an engine that is already canonical (not part of normal boot calls).
check('ROLLBACK-CERRADO-001', 'engines/RuntimeBootstrap.js + DeferredBootstrap.js',
  !/CanvasLayoutEngine\.__legacyBridge|CanvasLayoutEngine\.render\s*=\s*function/.test(bootstrap + deferred),
  'Legacy canvas patch bridge appears to have reappeared — cerrado bridge detected in boot files');

check('ROLLBACK-CERRADO-001', 'engines/RuntimeBootstrap.js + DeferredBootstrap.js',
  !/SelectionEngine\.__legacyBridge|SelectionEngine\.handle\s*=\s*function/.test(bootstrap + deferred),
  'Alternate selection patch bridge appears to have reappeared — cerrado bridge detected in boot files');

check('ROLLBACK-CERRADO-001', 'engines/RuntimeBootstrap.js + DeferredBootstrap.js',
  !/PreviewEngineV19\.__legacyBridge|PreviewEngine\s*=\s*PreviewEngineV19/.test(bootstrap + deferred),
  'Legacy preview patch bridge appears to have reappeared — cerrado bridge detected in boot files');

// DOM alias injector fingerprint: creating elements with data-alias-for that
// do NOT match the known-good alias block (the id alias block in RuntimeBootstrap
// that creates canvas-surface/canvas-scroll/canvas-viewport aliases is kept).
// The removed DOM alias injector used 'data-alias-for' on arbitrary IDs.
// Current surviving alias injector uses 'data-alias-for' intentionally for
// canvas-layer → canvas-surface etc. That's expected and not a violation.
// Removed bridge would add a *second* block with different IDs (section-alias etc.).
// We check only for the known-removed pattern: 'section-alias' or 'overlay-alias'.
check('ROLLBACK-CERRADO-001', 'engines/RuntimeBootstrap.js',
  !/section-alias|overlay-alias/.test(bootstrap),
  'Removed DOM alias injector pattern reappeared (section-alias or overlay-alias) in RuntimeBootstrap');

// ── RULE-B: active bridges must have idempotency guards ──────────────────────

// DesignZoomEngine phase 2 patch
check('ROLLBACK-GUARD-001', 'engines/RuntimeBootstrap.js',
  /_rfPhase2ZoomPatched/.test(bootstrap),
  'DesignZoomEngine phase 2 patch must have _rfPhase2ZoomPatched idempotency guard');

// DesignZoomEngine phase 3 patch
check('ROLLBACK-GUARD-001', 'engines/DeferredBootstrap.js',
  /_rfPhase3Patched/.test(deferred),
  'DesignZoomEngine phase 3 patch must have _rfPhase3Patched idempotency guard');

// DS.saveHistory patch
check('ROLLBACK-GUARD-001', 'engines/DeferredBootstrap.js',
  /DS\.saveHistory\._rfPhase3Patched/.test(deferred),
  'DS.saveHistory patch must have _rfPhase3Patched idempotency guard');

// ZoomEngineV19.set wrapper
check('ROLLBACK-GUARD-001', 'engines/DeferredBootstrap.js',
  /_rfEngineCorePatched/.test(deferred),
  'ZoomEngineV19.set wrapper must have _rfEngineCorePatched idempotency guard');

// OverlayEngine render patch
check('ROLLBACK-GUARD-001', 'engines/RuntimeBootstrap.js',
  /_rfV19Patched/.test(bootstrap),
  'OverlayEngine render patch must have _rfV19Patched idempotency guard');

// ── RULE-C: bridges-and-shims.md has rollback documentation ──────────────────

check('ROLLBACK-DOC-001', 'docs/architecture/bridges-and-shims.md',
  /Rollback path/.test(bridgesDoc),
  'bridges-and-shims.md must contain "Rollback path" column — per-bridge rollback steps required');

check('ROLLBACK-DOC-001', 'docs/architecture/bridges-and-shims.md',
  /Safe Rollback Contract/.test(bridgesDoc),
  'bridges-and-shims.md must contain "Safe Rollback Contract" section');

check('ROLLBACK-DOC-001', 'docs/architecture/bridges-and-shims.md',
  /cerrado/.test(bridgesDoc),
  'bridges-and-shims.md must list removed bridges as "cerrado" for audit traceability');

// ── RULE-D: testing-canon.md has three-attempt rule ──────────────────────────

check('ROLLBACK-DOC-001', 'docs/architecture/testing-canon.md',
  /Three-[Aa]ttempt|three.attempt/i.test(canonDoc),
  'testing-canon.md must contain the Three-Attempt Convergence rule — operational discipline must be documented');

check('ROLLBACK-DOC-001', 'docs/architecture/testing-canon.md',
  /convergence_discipline_guard/.test(canonDoc),
  'testing-canon.md must reference convergence_discipline_guard.mjs in its Enforcement section');

// ── Report ─────────────────────────────────────────────────────────────────────

console.log('── Safe Rollback Guard (#74) ─────────────────────────────────────');
console.log(`   violations found: ${violations.length}`);

if (violations.length > 0) {
  console.error('\n  Violations:');
  for (const v of violations) {
    console.error(`  [${v.rule}] ${v.file}`);
    console.error(`    → ${v.desc}`);
  }
}

if (violations.length === 0) {
  console.log('\n✅ rollback paths safe — cerrado bridges absent, active bridges guarded, doc complete\n');
  process.exit(0);
}

console.error('\n❌ rollback safety gap — bridge may be unguarded or removed bridge reappeared');
console.error('   Fix: check bridges-and-shims.md, add idempotency guards, remove cerrado patterns\n');
if (!REPORT) process.exit(1);
