#!/usr/bin/env node
'use strict';
/**
 * honest_fallback_guard.mjs — Principle #22 Fallbacks honestos
 *
 * Verifies that runtime fallbacks are read-only: they supply a default when
 * the canonical value is absent but must never overwrite a value that the
 * owner has already set. A fallback that writes back silently shadows the
 * owner and creates a hidden source of truth.
 *
 * RULE-A (FALLBACK-NOWRITE-001): No action or selector file may contain the
 *   pattern `state.X = state.X || default` or `state.X = state.X ?? default`
 *   — a fallback applied directly to the canonical state field overwrites it.
 *   Defaults must be applied at read time (in the consumer), not at write time
 *   (on the state).
 *
 * RULE-B (FALLBACK-SNAP-001): DocumentSelectors.snap() must use the grid
 *   fallback chain (CFG.MODEL_GRID → CFG.GRID → 4) without mutating
 *   state.snapToGrid or any other state field.
 *
 * RULE-C (FALLBACK-DS-001): DS facade must not apply default values to
 *   canonical fields (elements, sections, zoom) outside of createState().
 *   Lazy defaults set in the facade create a second write path.
 *
 * RULE-D (FALLBACK-BOOT-001): RuntimeBootstrap.js may set `DS.formulas = {}`
 *   only as a one-time bootstrap guard (`if (!DS.formulas)`) — a conditional
 *   write that only runs when the field is absent is an honest fallback.
 *   Unconditional assignment to DS fields at boot is a violation.
 *
 * Usage:
 *   node audit/honest_fallback_guard.mjs          # fail on violations
 *   node audit/honest_fallback_guard.mjs --report # report only
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

const actionsSrc   = readEngine('DocumentActions.js');
const selectorsSrc = readEngine('DocumentSelectors.js');
const storeSrc     = readEngine('DocumentStore.js');
const bootstrapSrc = readEngine('RuntimeBootstrap.js');

const violations = [];

function check(rule, file, condition, desc) {
  if (!condition) violations.push({ rule, file, desc });
}

// ── RULE-A: No state.X = state.X || default pattern in owner files ───────────

// Match: state.something = state.something || or state.something = state.something ??
const OVERWRITE_FALLBACK = /state\.\w+\s*=\s*state\.\w+\s*(\/\/|\?\?)/;

check('FALLBACK-NOWRITE-001', 'engines/DocumentActions.js',
  !OVERWRITE_FALLBACK.test(actionsSrc),
  'DocumentActions.js must not use state.X = state.X || default — fallbacks must not overwrite owner state');

check('FALLBACK-NOWRITE-001', 'engines/DocumentSelectors.js',
  !OVERWRITE_FALLBACK.test(selectorsSrc),
  'DocumentSelectors.js must not use state.X = state.X || default — selectors are read-only');

check('FALLBACK-NOWRITE-001', 'engines/DocumentStore.js',
  !OVERWRITE_FALLBACK.test(storeSrc),
  'DocumentStore.js must not use state.X = state.X || default — facade must not mutate state with fallbacks');

// ── RULE-B: DocumentSelectors.snap uses read-only fallback chain ──────────────

// snap() must use the fallback for grid (CFG.MODEL_GRID, CFG.GRID, 4) without writing back
check('FALLBACK-SNAP-001', 'engines/DocumentSelectors.js',
  /snap\s*\(/.test(selectorsSrc),
  'DocumentSelectors.js must define snap() — canonical grid snapping with honest fallback');

check('FALLBACK-SNAP-001', 'engines/DocumentSelectors.js',
  /CFG\.MODEL_GRID|CFG\.GRID|MODEL_GRID/.test(selectorsSrc),
  'DocumentSelectors.snap() must read grid from CFG.MODEL_GRID or CFG.GRID (not hardcode 4 unconditionally)');

// snap must not write back to state (assignment to state.* fields inside snap body)
const snapBodyIdx = selectorsSrc.indexOf('snap(value)');
const snapBody = snapBodyIdx !== -1 ? selectorsSrc.slice(snapBodyIdx, snapBodyIdx + 300) : '';
check('FALLBACK-SNAP-001', 'engines/DocumentSelectors.js',
  !/state\.\w+\s*=/.test(snapBody),
  'DocumentSelectors.snap() must not write the fallback grid value back to state');

// ── RULE-C: DS facade does not apply lazy defaults outside createState ────────

// Detect: DS.elements = DS.elements || [] (lazy default on facade)
const DS_LAZY_DEFAULT = /DS\.(elements|sections|zoom)\s*=\s*DS\.\1\s*(\/\/|\?\?)/;
check('FALLBACK-DS-001', 'engines/RuntimeBootstrap.js',
  !DS_LAZY_DEFAULT.test(bootstrapSrc),
  'RuntimeBootstrap.js must not lazily default DS.elements/sections/zoom — defaults belong in createState()');

// ── RULE-D: DS.formulas boot guard is conditional (honest) ───────────────────

// Honest: `if (!DS.formulas) DS.formulas = {}`
// Dishonest: `DS.formulas = {}` (unconditional overwrite)
const formulasLine = bootstrapSrc.split('\n').find((l) => /DS\.formulas\s*=\s*\{/.test(l));
if (formulasLine) {
  check('FALLBACK-BOOT-001', 'engines/RuntimeBootstrap.js',
    /if\s*\(\s*!DS\.formulas\s*\)/.test(bootstrapSrc),
    'DS.formulas initialization in RuntimeBootstrap.js must be conditional (if (!DS.formulas)) — honest boot fallback');
}

// ── Report ─────────────────────────────────────────────────────────────────────

console.log('── Honest Fallback Guard (#22) ───────────────────────────────────');
console.log(`   violations found: ${violations.length}`);

if (violations.length > 0) {
  console.error('\n  Violations:');
  for (const v of violations) {
    console.error(`  [${v.rule}] ${v.file}`);
    console.error(`    → ${v.desc}`);
  }
}

if (violations.length === 0) {
  console.log('\n✅ fallbacks honest — no overwrite patterns, snap is read-only, boot guards are conditional\n');
  process.exit(0);
}

console.error('\n❌ honest fallback gap — fallback overwrites owner value or applies defaults outside createState');
console.error('   Fix: move defaults into createState(); apply fallbacks only at read time in consumers\n');
if (!REPORT) process.exit(1);
