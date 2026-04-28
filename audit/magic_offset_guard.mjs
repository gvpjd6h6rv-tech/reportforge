#!/usr/bin/env node
'use strict';
/**
 * magic_offset_guard.mjs — Principle #24 Sin cálculos mágicos runtime
 *
 * Verifies that layout pixel math in engine files goes through the canonical
 * geometry layer (RF.Geometry.* / GeometryCore.*) and that raw hardcoded
 * numeric offsets are not applied directly in element placement code.
 *
 * RULE-A (MAGIC-EXPORT-001): GeometryCore.js must export the canonical math
 *   functions: clampValue, clampRect, and scale (or scale-equivalent).
 *   These are the approved paths for layout arithmetic.
 *
 * RULE-B (MAGIC-LAYOUT-001): CanvasLayoutElements.js must use RF.Geometry
 *   for pixel placement (style.left/top/width/height must go through
 *   RF.Geometry.scale or RF.Geometry.modelToView — not raw arithmetic).
 *
 * RULE-C (MAGIC-SECTION-001): SectionLayoutEngine.js must not apply raw
 *   hardcoded pixel offsets (+N or -N where N is a numeric literal ≥4) to
 *   section height or top/left positioning without going through RF.Geometry.
 *
 * RULE-D (MAGIC-CORE-001): GeometryCore.js must be the single source of
 *   truth for scale factor (RF.Geometry.zoom-based scaling). It must contain
 *   the scale function that other engines call.
 *
 * Usage:
 *   node audit/magic_offset_guard.mjs          # fail on violations
 *   node audit/magic_offset_guard.mjs --report # report only
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

const geometryCore      = readEngine('GeometryCore.js');
const runtimeGeometry   = readEngine('RuntimeGeometry.js');
const canvasElements    = readEngine('CanvasLayoutElements.js');
const sectionLayout     = readEngine('SectionLayoutEngine.js');

const violations = [];

function check(rule, file, condition, desc) {
  if (!condition) violations.push({ rule, file, desc });
}

// ── RULE-A: GeometryCore exports canonical math functions ─────────────────────

check('MAGIC-EXPORT-001', 'engines/GeometryCore.js',
  /clampValue/.test(geometryCore),
  'GeometryCore.js must export clampValue — canonical numeric clamping for layout');

check('MAGIC-EXPORT-001', 'engines/GeometryCore.js',
  /clampRect/.test(geometryCore),
  'GeometryCore.js must export clampRect — canonical rectangle clamping for layout');

// scale is in RuntimeGeometry.js (RF.Geometry.scale), not GeometryCore — just verify RF.Geometry exists there
// and that GeometryCore exports the geometric primitives (clamp/snap) as documented.

// ── RULE-B: CanvasLayoutElements uses RF.Geometry for pixel placement ─────────

// style.left/top/width/height assignments must go through RF.Geometry.*
check('MAGIC-LAYOUT-001', 'engines/CanvasLayoutElements.js',
  /RF\.Geometry\.scale\(/.test(canvasElements),
  'CanvasLayoutElements.js must use RF.Geometry.scale() for pixel dimension calculations');

check('MAGIC-LAYOUT-001', 'engines/CanvasLayoutElements.js',
  /RF\.Geometry\.modelToView\(/.test(canvasElements),
  'CanvasLayoutElements.js must use RF.Geometry.modelToView() for coordinate placement');

// Detect raw hardcoded offset additions on style properties: style.left = `${x + 8}px`
// We flag patterns where a style pixel assignment contains a raw + <number> not inside a Geometry call.
// Strategy: check that no style.[left|top] assignment line contains a raw literal offset
// outside a Geometry call.
const styleOffsetLines = canvasElements.split('\n').filter((line) =>
  /style\.(left|top)\s*=/.test(line) &&
  /\+\s*\d{1,3}[^.]/.test(line) &&
  !/RF\.Geometry/.test(line)
);

check('MAGIC-LAYOUT-001', 'engines/CanvasLayoutElements.js',
  styleOffsetLines.length === 0,
  `Raw numeric offsets on style.left/top without RF.Geometry detected (${styleOffsetLines.length} line(s)): ` +
  styleOffsetLines.slice(0, 2).map((l) => l.trim()).join(' | '));

// ── RULE-C: SectionLayoutEngine has no raw large numeric offsets ──────────────

// Detect patterns like: height + 40, top - 12, etc. where ≥4 is a magic pixel constant
// outside any RF.Geometry call.
const secOffsetLines = sectionLayout.split('\n').filter((line) =>
  /\+\s*[4-9]\d*\b|\-\s*[4-9]\d*\b/.test(line) &&
  !/\/\//.test(line.split('/')[0]) &&   // not a comment
  !/RF\.Geometry|GeometryCore/.test(line)
);

check('MAGIC-SECTION-001', 'engines/SectionLayoutEngine.js',
  secOffsetLines.length === 0,
  `Raw large numeric offsets (≥4) in SectionLayoutEngine.js without Geometry routing ` +
  `(${secOffsetLines.length} line(s)): ` +
  secOffsetLines.slice(0, 2).map((l) => l.trim()).join(' | '));

// ── RULE-D: RuntimeGeometry is the SSOT for zoom-aware scale factor ───────────
// RF.Geometry.scale(v) = v * zoom(); it lives in RuntimeGeometry.js, not GeometryCore.js.

check('MAGIC-CORE-001', 'engines/RuntimeGeometry.js',
  /scale\s*\(v\)/.test(runtimeGeometry) || /scale\(v\)/.test(runtimeGeometry),
  'RuntimeGeometry.js must define RF.Geometry.scale(v) as the single source for zoom-aware pixel scaling');

check('MAGIC-CORE-001', 'engines/RuntimeGeometry.js',
  /zoom\(\)/.test(runtimeGeometry),
  'RF.Geometry.scale must derive from zoom() — not a hardcoded constant');

// ── Report ─────────────────────────────────────────────────────────────────────

console.log('── Magic Offset Guard (#24) ──────────────────────────────────────');
console.log(`   style-offset violating lines: ${styleOffsetLines.length}`);
console.log(`   section-offset violating lines: ${secOffsetLines.length}`);
console.log(`   violations found: ${violations.length}`);

if (violations.length > 0) {
  console.error('\n  Violations:');
  for (const v of violations) {
    console.error(`  [${v.rule}] ${v.file}`);
    console.error(`    → ${v.desc}`);
  }
}

if (violations.length === 0) {
  console.log('\n✅ no magic offsets — all layout pixel math routes through RF.Geometry/GeometryCore\n');
  process.exit(0);
}

console.error('\n❌ magic offset gap — raw numeric constants applied directly to layout');
console.error('   Fix: replace magic offsets with RF.Geometry calls; add named constants to GeometryCore\n');
if (!REPORT) process.exit(1);
