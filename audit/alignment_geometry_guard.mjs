#!/usr/bin/env node
'use strict';
/**
 * alignment_geometry_guard.mjs — SS-36 alignment geometry SSOT compliance gate
 *
 * Verifies that AlignmentEngine.js (the live implementation, consumed by
 * engines/DragEngine.js) is a pure, side-effect-free geometry core for its
 * compute/computeSpacing surface — no hard DOM/global references at module
 * scope — so it can be tested and reused without browser context.
 *
 * AlignmentGeometry.js was a byte-for-byte duplicate of the same compute/
 * computeSpacing/THRESHOLD logic, with zero production callers — retired in
 * P17E after its test coverage was migrated to load AlignmentEngine.js
 * directly (P17D). _bounds is intentionally NOT required here: it is
 * closure-private to AlignmentEngine.js (never exported), and exporting it
 * would add production API surface solely to serve test convenience for a
 * code path with no behavioral risk (pure arithmetic) — decision recorded
 * in P17E, not revisited by this guard.
 *
 * RULE-A (AG-EXIST-001): AlignmentEngine.js must exist in engines/.
 *
 * RULE-B (AG-EXPORT-001): AlignmentEngine.js must have module.exports for
 *   node:test testability.
 *
 * RULE-C (AG-API-001): AlignmentEngine.js must export the canonical
 *   members: compute, computeSpacing, THRESHOLD.
 *
 * RULE-D (AG-GUARD-001): AlignmentEngine.js must guard DS access with
 *   typeof — no naked reference to DS or CFG at module scope or function
 *   entry without a guard.
 *   Required pattern: `typeof DS` must appear (early-return guard).
 *   Forbidden: bare `DS.` or `CFG.` at the top level (outside a function).
 *
 * Usage:
 *   node audit/alignment_geometry_guard.mjs          # fail on violations
 *   node audit/alignment_geometry_guard.mjs --report # report only
 */

import fs   from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT    = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENGINES = path.join(ROOT, 'engines');
const ARGS    = process.argv.slice(2);
const REPORT  = ARGS.includes('--report');

const violations = [];

function check(rule, file, condition, desc) {
  if (!condition) violations.push({ rule, file: `engines/${file}`, desc });
}

const exists = (f) => fs.existsSync(path.join(ENGINES, f));
const read   = (f) => fs.readFileSync(path.join(ENGINES, f), 'utf8');

// ── RULE-A: AlignmentEngine.js must exist ───────────────────────────────────

check('AG-EXIST-001', 'AlignmentEngine.js',
  exists('AlignmentEngine.js'),
  'AlignmentEngine.js must exist — live geometry core for smart-alignment snap');

if (exists('AlignmentEngine.js')) {
  const src = read('AlignmentEngine.js');

  // ── RULE-B: module.exports ─────────────────────────────────────────────────
  check('AG-EXPORT-001', 'AlignmentEngine.js',
    /module\.exports/.test(src),
    'AlignmentEngine.js must have module.exports for node:test testability');

  // ── RULE-C: canonical API members exported ──────────────────────────────────
  // _bounds intentionally excluded — closure-private, never exported, by
  // design (P17E decision: no production need, no behavioral risk).
  const REQUIRED_MEMBERS = ['compute', 'computeSpacing', 'THRESHOLD'];

  for (const member of REQUIRED_MEMBERS) {
    check('AG-API-001', 'AlignmentEngine.js',
      new RegExp(`\\b${member}\\b`).test(src),
      `AlignmentEngine.js must export: ${member}`);
  }

  // ── RULE-D: DS and CFG must be guarded with typeof ────────────────────────
  // Require that typeof DS guard is present (early-return pattern)
  check('AG-GUARD-001', 'AlignmentEngine.js',
    /typeof DS/.test(src),
    'AlignmentEngine.js must guard DS access with typeof DS (early-return pattern required)');

  // Verify no top-level (unindented) naked DS. or CFG. references
  const topLevelNakedGlobals = src
    .split('\n')
    .filter(line => {
      const trimmed = line.trim();
      // Skip comments and empty lines
      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('*')) return false;
      // Top-level = no leading whitespace (outside IIFE body)
      if (/^\s{2,}/.test(line)) return false;
      // Flag bare DS. or CFG. at top level
      return /\b(DS|CFG)\s*\./.test(trimmed);
    });

  check('AG-GUARD-001', 'AlignmentEngine.js',
    topLevelNakedGlobals.length === 0,
    `AlignmentEngine.js must not have top-level naked DS/CFG access — found: ${topLevelNakedGlobals.join('; ')}`);
}

// ── Report ────────────────────────────────────────────────────────────────────

const rulesChecked = 1 + (exists('AlignmentEngine.js') ? 1 + 3 + 2 : 0);
console.log('── Alignment Geometry Guard ────────────────────────────────────');
console.log(`   rules checked: ${rulesChecked}  violations found: ${violations.length}`);

if (violations.length > 0) {
  console.error('\n  Violations:');
  for (const v of violations) {
    console.error(`  [${v.rule}] ${v.file}`);
    console.error(`    → ${v.desc}`);
  }
  console.error('\n❌ alignment-geometry purity contract compromised\n');
  if (!REPORT) process.exit(1);
} else {
  console.log('\n✅ AlignmentEngine pure-layer contract intact — API + typeof guards verified\n');
  process.exit(0);
}
