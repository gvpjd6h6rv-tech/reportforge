#!/usr/bin/env node
'use strict';
/**
 * canvas_layout_guard.mjs — SS-05 canvas-layout SSOT compliance gate
 *
 * Verifies that CanvasLayoutEngine.js exposes the canonical delegation surface
 * and that the two implementation modules it delegates to (CanvasLayoutSize,
 * CanvasLayoutElements) are referenced — ensuring the facade pattern cannot
 * be silently collapsed into a monolith.
 *
 * RULE-A (CL-EXIST-001): CanvasLayoutEngine.js must exist in engines/.
 *
 * RULE-B (CL-EXIST-002): CanvasLayoutContracts.js must exist in engines/
 *   (shared contracts consumed by both CanvasLayoutSize and CanvasLayoutElements).
 *
 * RULE-C (CL-EXPORT-001): CanvasLayoutEngine.js must have module.exports for
 *   node:test testability.
 *
 * RULE-D (CL-API-001): CanvasLayoutEngine.js must expose all 9 canonical methods:
 *   update, updateSync, getMetrics, getLayoutContract,
 *   buildElementDiv, renderElement, renderAll, updateElement, updateElementPosition.
 *
 * RULE-E (CL-DELEGATION-001): CanvasLayoutEngine.js must reference both
 *   CanvasLayoutSize and CanvasLayoutElements — proving it is a pure delegation
 *   facade and has not been inlined into a monolith.
 *
 * Usage:
 *   node audit/canvas_layout_guard.mjs          # fail on violations
 *   node audit/canvas_layout_guard.mjs --report # report only
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

// ── RULE-A: CanvasLayoutEngine.js must exist ──────────────────────────────────

check('CL-EXIST-001', 'CanvasLayoutEngine.js',
  exists('CanvasLayoutEngine.js'),
  'CanvasLayoutEngine.js must exist — facade that coordinates canvas layout delegation');

// ── RULE-B: CanvasLayoutContracts.js must exist ───────────────────────────────

check('CL-EXIST-002', 'CanvasLayoutContracts.js',
  exists('CanvasLayoutContracts.js'),
  'CanvasLayoutContracts.js must exist — shared contract guards for canvas layout');

// ── RULE-C: module.exports ────────────────────────────────────────────────────

if (exists('CanvasLayoutEngine.js')) {
  const src = read('CanvasLayoutEngine.js');

  check('CL-EXPORT-001', 'CanvasLayoutEngine.js',
    /module\.exports/.test(src),
    'CanvasLayoutEngine.js must have module.exports for node:test testability');

  // ── RULE-D: canonical API surface ──────────────────────────────────────────
  const REQUIRED_METHODS = [
    'update', 'updateSync', 'getMetrics', 'getLayoutContract',
    'buildElementDiv', 'renderElement', 'renderAll',
    'updateElement', 'updateElementPosition',
  ];

  for (const method of REQUIRED_METHODS) {
    check('CL-API-001', 'CanvasLayoutEngine.js',
      new RegExp(`\\b${method}\\b`).test(src),
      `CanvasLayoutEngine.js must expose canonical method: ${method}`);
  }

  // ── RULE-E: delegation pattern intact ──────────────────────────────────────
  check('CL-DELEGATION-001', 'CanvasLayoutEngine.js',
    /CanvasLayoutSize/.test(src),
    'CanvasLayoutEngine.js must reference CanvasLayoutSize — facade must not inline size logic');

  check('CL-DELEGATION-001', 'CanvasLayoutEngine.js',
    /CanvasLayoutElements/.test(src),
    'CanvasLayoutEngine.js must reference CanvasLayoutElements — facade must not inline element logic');
}

// ── Report ────────────────────────────────────────────────────────────────────

const rulesChecked = 2 + (exists('CanvasLayoutEngine.js') ? 13 : 0);
console.log('── Canvas Layout Guard ────────────────────────────────────────');
console.log(`   rules checked: ${rulesChecked}  violations found: ${violations.length}`);

if (violations.length > 0) {
  console.error('\n  Violations:');
  for (const v of violations) {
    console.error(`  [${v.rule}] ${v.file}`);
    console.error(`    → ${v.desc}`);
  }
  console.error('\n❌ canvas-layout contract surface compromised\n');
  if (!REPORT) process.exit(1);
} else {
  console.log('\n✅ CanvasLayoutEngine facade intact — delegation + API surface + contracts verified\n');
  process.exit(0);
}
