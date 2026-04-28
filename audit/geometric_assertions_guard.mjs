#!/usr/bin/env node
'use strict';
/**
 * geometric_assertions_guard.mjs — Principle #63 Geometric Assertions
 *
 * Static analysis verifying that the geometric assertion system is complete:
 * - assertLayoutPatch enforces finite AND positive dimensions
 * - updateElementLayout calls assertLayoutPatch before applying patches
 * - Resize paths (SelectionInteraction, SelectionInteractionMotion) flow through DS.updateElementLayout
 * - GeometryCore exports the canonical clamp/snap primitives
 *
 * RULE-A (GEOM-ASSERT-001): DocumentState.assertLayoutPatch must reject
 *   non-positive w/h values (w <= 0 or h <= 0). Checking finite-only allows
 *   zero-dimension elements that collapse to invisible but valid DOM nodes.
 *
 * RULE-B (GEOM-CALLSITE-001): DocumentActions.updateElementLayout must call
 *   assertLayoutPatch before applying the patch to DS state. Bypass at the
 *   action layer means any caller can write invalid geometry directly.
 *
 * RULE-C (GEOM-RESIZE-001): SelectionInteraction.js and SelectionInteractionMotion.js
 *   must route resize commits through DS.updateElementLayout (not direct mutation),
 *   ensuring assertLayoutPatch is always in the path.
 *
 * RULE-D (GEOM-CLAMP-001): GeometryCore.js must export clampValue and clampRect.
 *   These are the canonical safe bounds-limiting primitives used by all resize paths.
 *
 * Usage:
 *   node audit/geometric_assertions_guard.mjs          # fail on violations
 *   node audit/geometric_assertions_guard.mjs --report # report only
 */

import fs   from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT    = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENGINES = path.join(ROOT, 'engines');
const ARGS    = process.argv.slice(2);
const REPORT  = ARGS.includes('--report');

const read = (f) => fs.readFileSync(path.join(ENGINES, f), 'utf8');

const docState     = read('DocumentState.js');
const docActions   = read('DocumentActions.js');
const selInteract  = read('SelectionInteraction.js');
const selMotion    = read('SelectionInteractionMotion.js');
const geomCore     = read('GeometryCore.js');

const violations = [];

function check(rule, file, condition, desc) {
  if (!condition) violations.push({ rule, file: `engines/${file}`, desc });
}

// RULE-A: assertLayoutPatch must check positive w/h.
// Must contain a positive-check for w and h (key === 'w' || key === 'h') with <= 0 or > 0.
check('GEOM-ASSERT-001', 'DocumentState.js',
  /\(\s*key\s*===\s*['"`]w['"`]\s*\|\|\s*key\s*===\s*['"`]h['"`]\s*\)/.test(docState) &&
  /<=\s*0/.test(docState),
  'assertLayoutPatch must enforce positive dimensions: (key === \'w\' || key === \'h\') && patch[key] <= 0 check required');

// RULE-B: DocumentActions.updateElementLayout calls assertLayoutPatch.
check('GEOM-CALLSITE-001', 'DocumentActions.js',
  /updateElementLayout\s*\([^)]*\)\s*\{[^}]*assertLayoutPatch\s*\(/.test(docActions.replace(/\n/g, ' ')),
  'DocumentActions.updateElementLayout must call assertLayoutPatch(patch) before writing to DS state');

// RULE-C: Resize paths route through DS.updateElementLayout (not direct mutation).
check('GEOM-RESIZE-001', 'SelectionInteraction.js',
  /DS\.updateElementLayout\s*\(/.test(selInteract),
  'SelectionInteraction.js must commit resize via DS.updateElementLayout to stay in assertLayoutPatch path');

check('GEOM-RESIZE-001', 'SelectionInteractionMotion.js',
  /DS\.updateElementLayout\s*\(/.test(selMotion),
  'SelectionInteractionMotion.js must commit resize via DS.updateElementLayout to stay in assertLayoutPatch path');

// RULE-D: GeometryCore exports clampValue and clampRect.
check('GEOM-CLAMP-001', 'GeometryCore.js',
  /clampValue/.test(geomCore),
  'GeometryCore.js must define clampValue — canonical safe bounds primitive');

check('GEOM-CLAMP-001', 'GeometryCore.js',
  /clampRect/.test(geomCore),
  'GeometryCore.js must define clampRect — canonical safe bounds primitive for rects');

// ── Report ─────────────────────────────────────────────────────────────────────

console.log('── Geometric Assertions Guard (#63) ─────────────────────────────');
console.log(`   violations found: ${violations.length}`);

if (violations.length > 0) {
  console.error('\n  Violations:');
  for (const v of violations) {
    console.error(`  [${v.rule}] ${v.file}`);
    console.error(`    → ${v.desc}`);
  }
}

if (violations.length === 0) {
  console.log('\n✅ geometric assertions complete — positive-dimension enforcement, callsite coverage, clamp primitives present\n');
  process.exit(0);
}

console.error('\n❌ geometric assertion gap — layout can accept invalid dimensions or bypass assertion');
console.error('   Fix: ensure assertLayoutPatch rejects w<=0/h<=0, updateElementLayout calls it, resize paths use updateElementLayout\n');
if (!REPORT) process.exit(1);
