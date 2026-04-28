#!/usr/bin/env node
'use strict';
/**
 * derived_state_guard.mjs — Principle #4 Estado derivado, no duplicado
 *
 * Verifies that computed values (derived state) live exclusively in
 * DocumentSelectors.js and that engine files consume them through the DS
 * facade rather than reimplementing the computation locally.
 *
 * RULE-A (DERIVED-FACTORY-001): DocumentSelectors.js must use a factory
 *   function (createDocumentSelectors) and read derived values directly from
 *   the `state` argument — not from a cached copy stored in the closure.
 *
 * RULE-B (DERIVED-IMPL-001): No engine file outside the document-store layer
 *   may independently implement getSectionTop, getTotalHeight, or
 *   getSelectedElements. These derivations must come from DocumentSelectors
 *   (exposed via DS facade).
 *
 * RULE-C (DERIVED-CALL-001): Engine files that need getSectionTop or
 *   getTotalHeight must call DS.getSectionTop / DS.getTotalHeight, not
 *   recompute the sum inline from a locally held sections array.
 *
 * RULE-D (DERIVED-FACADE-001): DocumentStore.js must delegate getSectionTop,
 *   getTotalHeight, isSelected, getSelectedElements, and getElementById to
 *   the selectors object — confirming the derived computation is centralized.
 *
 * Usage:
 *   node audit/derived_state_guard.mjs          # fail on violations
 *   node audit/derived_state_guard.mjs --report # report only
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

const selectorsSrc = readEngine('DocumentSelectors.js');
const storeSrc     = readEngine('DocumentStore.js');

const ALLOWED_OWNERS = new Set([
  'DocumentSelectors.js', 'DocumentStore.js', 'DocumentState.js',
  'DocumentActions.js', 'DocumentHistory.js',
]);

const violations = [];

function check(rule, file, condition, desc) {
  if (!condition) violations.push({ rule, file, desc });
}

// ── RULE-A: DocumentSelectors uses factory; reads from `state.` ──────────────

check('DERIVED-FACTORY-001', 'engines/DocumentSelectors.js',
  /function createDocumentSelectors/.test(selectorsSrc),
  'DocumentSelectors.js must use createDocumentSelectors factory — enables isolated test instances');

check('DERIVED-FACTORY-001', 'engines/DocumentSelectors.js',
  /state\.sections/.test(selectorsSrc) || /state\.elements/.test(selectorsSrc),
  'DocumentSelectors.js must read from the state argument (state.sections / state.elements) — not a cached copy');

// No stored derived cache in the closure (no `let totalHeight` or similar)
check('DERIVED-FACTORY-001', 'engines/DocumentSelectors.js',
  !/let\s+totalHeight|let\s+selectedEls|const\s+_cache/.test(selectorsSrc),
  'DocumentSelectors.js must not cache derived values in closure variables — always recompute from state');

// ── RULE-B: No engine reimplements the canonical derivations ─────────────────

const DERIVED_FNS = ['getSectionTop', 'getTotalHeight', 'getSelectedElements'];
const allEngineFiles = fs.readdirSync(ENGINES).filter((f) => f.endsWith('.js'));

for (const fn of DERIVED_FNS) {
  // A reimplementation contains the function body logic, not just a DS.X() delegation.
  // We detect: function body with a loop/reduce/filter — not a single `return DS.X(...)` delegation.
  const reImpl = new RegExp(`function ${fn}\\b[\\s\\S]{0,300}(for\\s*\\(|reduce\\s*\\(|filter\\s*\\()`);
  const violators = allEngineFiles.filter((f) => {
    if (ALLOWED_OWNERS.has(f)) return false;
    const src = readEngine(f);
    return reImpl.test(src);
  });
  check('DERIVED-IMPL-001', 'engines/*.js',
    violators.length === 0,
    `${fn} must not be reimplemented outside document-store layer — found in: ${violators.join(', ')}`);
}

// ── RULE-C: Engines call DS.getSectionTop / DS.getTotalHeight ────────────────

// Detect inline accumulator patterns on a local sections array (not DS-routed):
// Pattern: `sections.reduce(...height` or `for (const s of sections) top += s.height`
// in non-owner files.
const INLINE_TOP_RE = /for\s*\(.*\bsections\b.*\)\s*\{[^}]*\btop\b[^}]*\+=[^}]*height|sections\.reduce\([^)]*height/;

const inlineComputeViolators = allEngineFiles.filter((f) => {
  if (ALLOWED_OWNERS.has(f)) return false;
  const src = readEngine(f);
  return INLINE_TOP_RE.test(src);
});

check('DERIVED-CALL-001', 'engines/*.js',
  inlineComputeViolators.length === 0,
  `Inline section-top accumulator detected outside document-store layer — use DS.getSectionTop() instead. Found in: ${inlineComputeViolators.join(', ')}`);

// ── RULE-D: DocumentStore delegates the canonical selectors ──────────────────

check('DERIVED-FACADE-001', 'engines/DocumentStore.js',
  /getSectionTop.*selectors/.test(storeSrc),
  'DocumentStore.js must delegate getSectionTop to selectors object');

check('DERIVED-FACADE-001', 'engines/DocumentStore.js',
  /getTotalHeight.*selectors/.test(storeSrc) || /selectors.*getTotalHeight/.test(storeSrc),
  'DocumentStore.js must delegate getTotalHeight to selectors object');

check('DERIVED-FACADE-001', 'engines/DocumentStore.js',
  /getElementById.*selectors/.test(storeSrc) || /selectors.*getElementById/.test(storeSrc),
  'DocumentStore.js must delegate getElementById to selectors object');

// ── Report ─────────────────────────────────────────────────────────────────────

console.log('── Derived State Guard (#4) ──────────────────────────────────────');
console.log(`   violations found: ${violations.length}`);

if (violations.length > 0) {
  console.error('\n  Violations:');
  for (const v of violations) {
    console.error(`  [${v.rule}] ${v.file}`);
    console.error(`    → ${v.desc}`);
  }
}

if (violations.length === 0) {
  console.log('\n✅ derived state intact — computations centralized in DocumentSelectors, no duplicates\n');
  process.exit(0);
}

console.error('\n❌ derived state gap — computation duplicated outside DocumentSelectors');
console.error('   Fix: remove reimplemented selectors; route through DS.getSectionTop/getTotalHeight\n');
if (!REPORT) process.exit(1);
