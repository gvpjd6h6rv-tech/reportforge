#!/usr/bin/env node
'use strict';
/**
 * geometry_core_guard.mjs — SS-04 geometry SSOT compliance gate
 *
 * Verifies that GeometryCore.js is a pure, self-contained math module —
 * no DOM references, no side effects — and that CanvasGeometry.js exists
 * as its shared pure-math companion.
 *
 * RULE-A (GC-EXIST-001): GeometryCore.js must exist in engines/.
 *
 * RULE-B (GC-EXIST-002): CanvasGeometry.js must exist in engines/
 *   (pure-math canvas coordinate companion; referenced by geometry tests).
 *
 * RULE-C (GC-EXPORT-001): GeometryCore.js must have module.exports for
 *   node:test testability.
 *
 * RULE-D (GC-API-001): GeometryCore.js must expose all 19 canonical methods:
 *   makePoint, makeRect, normalizeRect, rectUnion, rectIntersect, rectOverlaps,
 *   rectContainsPoint, rectContainsRect, translateRect, inflateRect, deflateRect,
 *   clampRect, snapValue, snapRect, bboxFromRects, resizeRectFromHandle,
 *   rectCenter, rectEqualsWithinTolerance, pointDistance.
 *
 * RULE-E (GC-PURITY-001): GeometryCore.js must NOT reference DOM or mutable
 *   global state (no document, window, DS, localStorage).
 *
 * Usage:
 *   node audit/geometry_core_guard.mjs          # fail on violations
 *   node audit/geometry_core_guard.mjs --report # report only
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

// ── RULE-A: GeometryCore.js must exist ───────────────────────────────────────

check('GC-EXIST-001', 'GeometryCore.js',
  exists('GeometryCore.js'),
  'GeometryCore.js must exist — pure-math SSOT for all geometry primitives');

// ── RULE-B: CanvasGeometry.js must exist ─────────────────────────────────────

check('GC-EXIST-002', 'CanvasGeometry.js',
  exists('CanvasGeometry.js'),
  'CanvasGeometry.js must exist — pure-math canvas coordinate companion');

if (exists('GeometryCore.js')) {
  const src = read('GeometryCore.js');

  // ── RULE-C: module.exports ────────────────────────────────────────────────
  check('GC-EXPORT-001', 'GeometryCore.js',
    /module\.exports/.test(src),
    'GeometryCore.js must have module.exports for node:test testability');

  // ── RULE-D: canonical API surface ────────────────────────────────────────
  const REQUIRED_METHODS = [
    'makePoint',
    'makeRect',
    'normalizeRect',
    'rectUnion',
    'rectIntersect',
    'rectOverlaps',
    'rectContainsPoint',
    'rectContainsRect',
    'translateRect',
    'inflateRect',
    'deflateRect',
    'clampRect',
    'snapValue',
    'snapRect',
    'bboxFromRects',
    'resizeRectFromHandle',
    'rectCenter',
    'rectEqualsWithinTolerance',
    'pointDistance',
  ];

  for (const method of REQUIRED_METHODS) {
    check('GC-API-001', 'GeometryCore.js',
      new RegExp(`\\b${method}\\b`).test(src),
      `GeometryCore.js must expose canonical method: ${method}`);
  }

  // ── RULE-E: no DOM or mutable global references ───────────────────────────
  const FORBIDDEN = ['document', 'localStorage', '\\bDS\\b'];

  for (const pattern of FORBIDDEN) {
    check('GC-PURITY-001', 'GeometryCore.js',
      !new RegExp(pattern).test(src),
      `GeometryCore.js must not reference: ${pattern} (pure math module — no DOM/state)`);
  }

  // window is allowed only if it is the module.exports guard pattern
  // (typeof window !== 'undefined') — not a live DOM access.
  // GeometryCore.js should have zero window references.
  check('GC-PURITY-001', 'GeometryCore.js',
    !(/\bwindow\b/.test(src)),
    'GeometryCore.js must not reference window (pure math module — no DOM/state)');
}

// ── Report ────────────────────────────────────────────────────────────────────

const rulesChecked = 2 + (exists('GeometryCore.js') ? 1 + 19 + 4 : 0);
console.log('── Geometry Core Guard ────────────────────────────────────────');
console.log(`   rules checked: ${rulesChecked}  violations found: ${violations.length}`);

if (violations.length > 0) {
  console.error('\n  Violations:');
  for (const v of violations) {
    console.error(`  [${v.rule}] ${v.file}`);
    console.error(`    → ${v.desc}`);
  }
  console.error('\n❌ geometry-core purity contract compromised\n');
  if (!REPORT) process.exit(1);
} else {
  console.log('\n✅ GeometryCore pure-math contract intact — API surface + purity verified\n');
  process.exit(0);
}
