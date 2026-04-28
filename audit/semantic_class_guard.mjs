#!/usr/bin/env node
'use strict';
/**
 * semantic_class_guard.mjs — Principle #30 Clases semánticas
 *
 * Verifies that DOM class names in canonical engine files follow the
 * documented semantic prefix conventions. Semantic classes make DOM
 * ownership explicit and prevent accidental CSS coupling between layers.
 *
 * Conventions:
 *   cr-*     : Crystal Reports document elements (sections, canvas elements)
 *   el-*     : Element property sub-parts (content, icon, corner handles)
 *   sel-*    : Selection overlay nodes (selection box, handles, outlines)
 *   sec-*    : Section toolbar / label nodes (if any)
 *
 * RULE-A (SEMCLASS-CR-001): CanvasLayoutElements.js must assign 'cr-element'
 *   as the class of every newly created canvas element div. Any other class
 *   used as the primary element class breaks querySelector contracts.
 *
 * RULE-B (SEMCLASS-EL-001): Sub-element parts created in CanvasLayoutElements
 *   must use the el- prefix (el-content, el-field-icon, el-corner, etc.).
 *
 * RULE-C (SEMCLASS-SEL-001): SelectionOverlay.js must use sel- prefix for
 *   selection UI nodes (sel-box, sel-handle, sel-box-multi, etc.).
 *
 * RULE-D (SEMCLASS-SECTION-001): SectionLayoutEngine.js must query sections
 *   by the 'cr-section' class — confirming section DOM identity is canonical.
 *
 * RULE-E (SEMCLASS-NOFREE-001): No canonical engine file may assign a bare
 *   unprefixed class name (single word, no hyphen) as the primary class of a
 *   newly created element div (excluding 'hidden', 'visible', 'active' which
 *   are state modifiers, not identity classes).
 *
 * Usage:
 *   node audit/semantic_class_guard.mjs          # fail on violations
 *   node audit/semantic_class_guard.mjs --report # report only
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

const canvasElements   = readEngine('CanvasLayoutElements.js');
const selectionOverlay = readEngine('SelectionOverlay.js');
const sectionLayout    = readEngine('SectionLayoutEngine.js');

const violations = [];

function check(rule, file, condition, desc) {
  if (!condition) violations.push({ rule, file, desc });
}

// ── RULE-A: Canvas elements use 'cr-element' as primary class ────────────────

check('SEMCLASS-CR-001', 'engines/CanvasLayoutElements.js',
  /className\s*=\s*'cr-element'|className\s*=\s*"cr-element"/.test(canvasElements),
  "CanvasLayoutElements.js must assign className = 'cr-element' to new element divs");

check('SEMCLASS-CR-001', 'engines/CanvasLayoutElements.js',
  /querySelectorAll\s*\(\s*'\.cr-element'|querySelector\s*\(\s*`\.cr-element/.test(canvasElements),
  "CanvasLayoutElements.js must query by '.cr-element' class — confirming canonical selector contract");

// ── RULE-B: Sub-element parts use el- prefix ─────────────────────────────────

check('SEMCLASS-EL-001', 'engines/CanvasLayoutElements.js',
  /className\s*=\s*'el-|className\s*=\s*"el-/.test(canvasElements),
  "CanvasLayoutElements.js must use 'el-' prefix for sub-element parts (el-content, el-corner, etc.)");

// ── RULE-C: SelectionOverlay uses sel- prefix ─────────────────────────────────

check('SEMCLASS-SEL-001', 'engines/SelectionOverlay.js',
  /className\s*=\s*'sel-|className\s*=\s*"sel-/.test(selectionOverlay),
  "SelectionOverlay.js must use 'sel-' prefix for selection UI nodes (sel-box, sel-handle, etc.)");

check('SEMCLASS-SEL-001', 'engines/SelectionOverlay.js',
  /'sel-box'|"sel-box"/.test(selectionOverlay),
  "SelectionOverlay.js must use 'sel-box' class name — canonical selection boundary node");

check('SEMCLASS-SEL-001', 'engines/SelectionOverlay.js',
  /'sel-handle'|"sel-handle"/.test(selectionOverlay),
  "SelectionOverlay.js must use 'sel-handle' class name — canonical resize handle node");

// ── RULE-D: SectionLayoutEngine queries by 'cr-section' ─────────────────────

check('SEMCLASS-SECTION-001', 'engines/SectionLayoutEngine.js',
  /cr-section/.test(sectionLayout),
  "SectionLayoutEngine.js must query by 'cr-section' class — canonical section DOM identity");

// ── RULE-E: No bare unprefixed primary class in canonical create paths ────────

// Scan the element creation lines (div.className = '...') for bare words
// (no hyphen, not a known modifier).
const KNOWN_MODIFIERS = new Set(['hidden', 'visible', 'active', 'disabled', 'selected', 'focused']);
const PRIM_CLASS_RE = /\.className\s*=\s*['"]([^'"]+)['"]/g;

function hasBarePrimaryClass(src) {
  const matches = [...src.matchAll(PRIM_CLASS_RE)];
  for (const m of matches) {
    const cls = m[1].trim().split(/\s+/)[0]; // first class word
    if (!cls.includes('-') && !KNOWN_MODIFIERS.has(cls)) {
      return cls;
    }
  }
  return null;
}

const bareInCanvas = hasBarePrimaryClass(canvasElements);
check('SEMCLASS-NOFREE-001', 'engines/CanvasLayoutElements.js',
  !bareInCanvas,
  `Bare unprefixed primary class detected in CanvasLayoutElements.js: '${bareInCanvas}' — use cr-/el- prefix`);

const bareInSelection = hasBarePrimaryClass(selectionOverlay);
check('SEMCLASS-NOFREE-001', 'engines/SelectionOverlay.js',
  !bareInSelection,
  `Bare unprefixed primary class detected in SelectionOverlay.js: '${bareInSelection}' — use sel- prefix`);

// ── Report ─────────────────────────────────────────────────────────────────────

console.log('── Semantic Class Guard (#30) ────────────────────────────────────');
console.log(`   violations found: ${violations.length}`);

if (violations.length > 0) {
  console.error('\n  Violations:');
  for (const v of violations) {
    console.error(`  [${v.rule}] ${v.file}`);
    console.error(`    → ${v.desc}`);
  }
}

if (violations.length === 0) {
  console.log('\n✅ semantic classes intact — cr-/el-/sel- prefixes used consistently\n');
  process.exit(0);
}

console.error('\n❌ semantic class gap — unprefixed or wrong-prefix class detected');
console.error('   Fix: use cr- for document elements, el- for sub-parts, sel- for selection nodes\n');
if (!REPORT) process.exit(1);
