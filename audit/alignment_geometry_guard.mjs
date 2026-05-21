#!/usr/bin/env node
'use strict';
/**
 * alignment_geometry_guard.mjs — SS-23 alignment geometry SSOT compliance gate
 *
 * Verifies that AlignmentGeometry.js is a pure, side-effect-free geometry
 * module — no hard DOM/global references at module scope — so it can be
 * tested and reused without browser context.
 *
 * RULE-A (AG-EXIST-001): AlignmentGeometry.js must exist in engines/.
 *
 * RULE-B (AG-EXPORT-001): AlignmentGeometry.js must have module.exports for
 *   node:test testability.
 *
 * RULE-C (AG-API-001): AlignmentGeometry.js must export all 4 canonical
 *   members: _bounds, compute, computeSpacing, THRESHOLD.
 *
 * RULE-D (AG-GUARD-001): AlignmentGeometry.js must guard DS access with
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

// ── RULE-A: AlignmentGeometry.js must exist ───────────────────────────────────

check('AG-EXIST-001', 'AlignmentGeometry.js',
  exists('AlignmentGeometry.js'),
  'AlignmentGeometry.js must exist — pure geometry layer for smart-alignment snap');

if (exists('AlignmentGeometry.js')) {
  const src = read('AlignmentGeometry.js');

  // ── RULE-B: module.exports ─────────────────────────────────────────────────
  check('AG-EXPORT-001', 'AlignmentGeometry.js',
    /module\.exports/.test(src),
    'AlignmentGeometry.js must have module.exports for node:test testability');

  // ── RULE-C: 4 canonical API members exported ───────────────────────────────
  const REQUIRED_MEMBERS = ['_bounds', 'compute', 'computeSpacing', 'THRESHOLD'];

  for (const member of REQUIRED_MEMBERS) {
    check('AG-API-001', 'AlignmentGeometry.js',
      new RegExp(`\\b${member}\\b`).test(src),
      `AlignmentGeometry.js must export: ${member}`);
  }

  // ── RULE-D: DS and CFG must be guarded with typeof ────────────────────────
  // Require that typeof DS guard is present (early-return pattern)
  check('AG-GUARD-001', 'AlignmentGeometry.js',
    /typeof DS/.test(src),
    'AlignmentGeometry.js must guard DS access with typeof DS (early-return pattern required)');

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

  check('AG-GUARD-001', 'AlignmentGeometry.js',
    topLevelNakedGlobals.length === 0,
    `AlignmentGeometry.js must not have top-level naked DS/CFG access — found: ${topLevelNakedGlobals.join('; ')}`);
}

// ── Report ────────────────────────────────────────────────────────────────────

const rulesChecked = 1 + (exists('AlignmentGeometry.js') ? 1 + 4 + 2 : 0);
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
  console.log('\n✅ AlignmentGeometry pure-layer contract intact — API + typeof guards verified\n');
  process.exit(0);
}
