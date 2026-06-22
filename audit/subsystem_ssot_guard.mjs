#!/usr/bin/env node
'use strict';
/**
 * subsystem_ssot_guard.mjs — Subsystem SSOT Compliance
 *
 * Static analysis verifying that each subsystem with observable, shared state
 * owns that state in a dedicated *State.js file (Single Source of Truth) rather
 * than embedding mutable `let` vars inside the engine IIFE.
 *
 * Principle: engines that hold state readable by other engines must separate
 * behavior (engine) from data (state). State files are:
 *   - Independently testable (loadable without DOM or other engines)
 *   - A clear seam for mocking in tests
 *   - The sole mutation point for their domain
 *
 * RULE-A (SSOT-STATE-001): ClipboardEngine.js must delegate clipboard storage
 *   to ClipboardState (via `S = ClipboardState`), not maintain its own `_clipboard`.
 *
 * RULE-B (SSOT-STATE-002): DragEngine.js must delegate drag session storage
 *   to DragState (via `S = DragState`), not maintain its own `_active/_drag`.
 *
 * RULE-D (SSOT-EXIST-001): ClipboardState.js and DragState.js must exist in
 *   engines/ — existence confirms the SSOT pattern is wired.
 *
 * RULE-E (SSOT-API-001): ClipboardEngine must expose `state` pointing to
 *   ClipboardState; DragEngine must expose `state` pointing to DragState.
 *   These surface the SSOT for consumers and tests.
 *
 * KeyboardRegistry.js / KeyboardCombo.js (formerly RULE-C, and part of
 * RULE-D/E) were retired in P31B: neither was ever loaded by any
 * designer/*.html <script> tag, and KeyboardEngine.js always ran its own
 * inline fallback registry in production (confirmed identical API and
 * behavior). There is no "SSOT pattern" left to verify for keyboard handler
 * bindings — the inline registry inside KeyboardEngine.js IS the real, only
 * implementation now, not a fallback for an absent delegate.
 *
 * ⚠  INTERNAL — do not run directly in CI.
 *    CI entry point: npm run test:ssot  (audit/ssot_guard.mjs)
 *    Running this file alone leaves the configurational SSOT layer unverified.
 *
 * Usage (local debugging only):
 *   node audit/subsystem_ssot_guard.mjs          # fail on violations
 *   node audit/subsystem_ssot_guard.mjs --report # report only
 */

import fs   from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT    = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENGINES = path.join(ROOT, 'engines');
const ARGS    = process.argv.slice(2);
const REPORT  = ARGS.includes('--report');

const exists = (f) => fs.existsSync(path.join(ENGINES, f));
const read   = (f) => fs.readFileSync(path.join(ENGINES, f), 'utf8');

const violations = [];

function check(rule, file, condition, desc) {
  if (!condition) violations.push({ rule, file: `engines/${file}`, desc });
}

// RULE-D (SSOT-EXIST-001): State files must exist.
check('SSOT-EXIST-001', 'ClipboardState.js',
  exists('ClipboardState.js'),
  'ClipboardState.js must exist — SSOT for clipboard contents');

check('SSOT-EXIST-001', 'DragState.js',
  exists('DragState.js'),
  'DragState.js must exist — SSOT for drag session');

// RULE-D-ENGINE (SSOT-EXIST-002): Engine files must also exist.
// If an engine file is absent the SSOT pattern cannot be verified for that subsystem.
// A missing engine = unconfirmed compliance, not a pass.
check('SSOT-EXIST-002', 'ClipboardEngine.js',
  exists('ClipboardEngine.js'),
  'ClipboardEngine.js must exist — required to verify the clipboard SSOT pattern');

check('SSOT-EXIST-002', 'DragEngine.js',
  exists('DragEngine.js'),
  'DragEngine.js must exist — required to verify the drag SSOT pattern');

if (exists('ClipboardEngine.js')) {
  const src = read('ClipboardEngine.js');

  // RULE-A: ClipboardEngine delegates to ClipboardState — no bare `_clipboard` let.
  check('SSOT-STATE-001', 'ClipboardEngine.js',
    !(/^\s*let _clipboard\s*=/.test(src)),
    'ClipboardEngine.js must not declare its own let _clipboard — delegate to ClipboardState');

  check('SSOT-STATE-001', 'ClipboardEngine.js',
    /ClipboardState/.test(src),
    'ClipboardEngine.js must reference ClipboardState as its storage delegate');

  // RULE-E: ClipboardEngine exposes .state
  check('SSOT-API-001', 'ClipboardEngine.js',
    /state\s*:\s*S/.test(src),
    'ClipboardEngine.js must expose `state: S` to surface ClipboardState to consumers');
}

if (exists('DragEngine.js')) {
  const src = read('DragEngine.js');

  // RULE-B: DragEngine delegates to DragState — no bare `_active/_drag` lets.
  check('SSOT-STATE-002', 'DragEngine.js',
    !(/^\s*let _active\s*=/.test(src)),
    'DragEngine.js must not declare its own let _active — delegate to DragState');

  check('SSOT-STATE-002', 'DragEngine.js',
    !(/^\s*let _drag\s*=/.test(src)),
    'DragEngine.js must not declare its own let _drag — delegate to DragState');

  check('SSOT-STATE-002', 'DragEngine.js',
    /DragState/.test(src),
    'DragEngine.js must reference DragState as its session delegate');

  // RULE-E: DragEngine exposes .state
  check('SSOT-API-001', 'DragEngine.js',
    /state\s*:\s*S/.test(src),
    'DragEngine.js must expose `state: S` to surface DragState to consumers');
}

// ── Report ─────────────────────────────────────────────────────────────────────

console.log('── Subsystem SSOT Guard ──────────────────────────────────────────');
console.log(`   violations found: ${violations.length}`);

if (violations.length > 0) {
  console.error('\n  Violations:');
  for (const v of violations) {
    console.error(`  [${v.rule}] ${v.file}`);
    console.error(`    → ${v.desc}`);
  }
}

if (violations.length === 0) {
  console.log('\n✅ subsystem SSOT consistent — ClipboardState, DragState wired\n');
  process.exit(0);
}

console.error('\n❌ SSOT gap — subsystem state leaks into engine IIFE instead of dedicated State file');
console.error('   Fix: move mutable state to *State.js, have engine reference it, expose via .state\n');
if (!REPORT) process.exit(1);
