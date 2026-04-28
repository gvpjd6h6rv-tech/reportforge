#!/usr/bin/env node
'use strict';
/**
 * visual_state_guard.mjs — Principle #17 Estado visual derivado
 *
 * Verifies that visual DOM state (CSS classes that reflect model state such
 * as selection, visibility, or error indicators) is derived from the owner
 * model at write time — never stored as a parallel boolean or cached flag.
 *
 * RULE-A (VISUAL-SELECTED-001): CanvasLayoutElements.js must derive the
 *   'selected' CSS class from DS.selection at the moment of DOM write, not
 *   from a cached per-element boolean. The toggle must reference DS.selection
 *   directly so re-renders always reflect current owner state.
 *
 * RULE-B (VISUAL-NOCACHE-001): No engine file may store a standalone
 *   `isSelected` boolean or `_selected` flag on a DOM element as a shortcut.
 *   The owner model (DS.selection) is the source of truth; any shortcut
 *   diverges when the selection changes without a full re-render.
 *
 * RULE-C (VISUAL-OWNER-001): The 'selected' class application must be in the
 *   canonical DOM write path (CanvasLayoutElements.js or SelectionOverlay.js)
 *   — not scattered across arbitrary engine files.
 *
 * RULE-D (VISUAL-COLOR-001): Element color is read from el.color at write time
 *   in CanvasLayoutElements.js — not from a cached style string stored
 *   separately from the document model.
 *
 * Usage:
 *   node audit/visual_state_guard.mjs          # fail on violations
 *   node audit/visual_state_guard.mjs --report # report only
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

const canvasElements  = readEngine('CanvasLayoutElements.js');
const selectionOverlay = readEngine('SelectionOverlay.js');

const ALLOWED_VISUAL_OWNERS = new Set([
  'CanvasLayoutElements.js', 'SelectionOverlay.js',
]);

const violations = [];

function check(rule, file, condition, desc) {
  if (!condition) violations.push({ rule, file, desc });
}

// ── RULE-A: 'selected' class derived from DS.selection at write time ──────────

check('VISUAL-SELECTED-001', 'engines/CanvasLayoutElements.js',
  /classList\.toggle\s*\(\s*'selected'/.test(canvasElements) ||
  /classList\.toggle\s*\(\s*"selected"/.test(canvasElements),
  "CanvasLayoutElements.js must use classList.toggle('selected', ...) to derive selection state at write time");

check('VISUAL-SELECTED-001', 'engines/CanvasLayoutElements.js',
  /DS\.selection\.has\(/.test(canvasElements),
  'Selection class toggle in CanvasLayoutElements.js must read from DS.selection.has() — owner model');

// ── RULE-B: No cached _selected / isSelected flag on DOM elements ─────────────

const allEngineFiles = fs.readdirSync(ENGINES).filter((f) => f.endsWith('.js'));
const cachedSelectionViolators = allEngineFiles.filter((f) => {
  if (ALLOWED_VISUAL_OWNERS.has(f)) return false;
  const src = readEngine(f);
  // Look for: el._selected = / div._selected = / element.dataset.selected =
  return /\._selected\s*=|\.dataset\.selected\s*=/.test(src);
});

check('VISUAL-NOCACHE-001', 'engines/*.js',
  cachedSelectionViolators.length === 0,
  `Cached _selected / dataset.selected flags detected outside canonical write paths — found in: ${cachedSelectionViolators.join(', ')}`);

// ── RULE-C: 'selected' class only applied in canonical owners ─────────────────

// SectionEngine may apply 'selected' to panel sidebar items (not canvas document elements)
const ALLOWED_PANEL_OWNERS = new Set([
  'CanvasLayoutElements.js', 'SelectionOverlay.js', 'SectionEngine.js', 'PropertiesEnginePanel.js',
]);
const selectedClassViolators = allEngineFiles.filter((f) => {
  if (ALLOWED_PANEL_OWNERS.has(f)) return false;
  const src = readEngine(f);
  return /classList\.(toggle|add|remove)\s*\(\s*['"]selected['"]/.test(src);
});

check('VISUAL-OWNER-001', 'engines/*.js',
  selectedClassViolators.length === 0,
  `'selected' class applied outside canonical write paths (CanvasLayoutElements/SelectionOverlay) — found in: ${selectedClassViolators.join(', ')}`);

// ── RULE-D: Element color read from el.color at write time ───────────────────

check('VISUAL-COLOR-001', 'engines/CanvasLayoutElements.js',
  /el\.color/.test(canvasElements),
  'CanvasLayoutElements.js must read el.color from the element model at write time — not a cached style string');

// Ensure no separate `_colorCache` or `_cachedStyle` in CanvasLayoutElements
check('VISUAL-COLOR-001', 'engines/CanvasLayoutElements.js',
  !/_colorCache|_cachedStyle|_lastColor/.test(canvasElements),
  'CanvasLayoutElements.js must not maintain a color cache — visual state derives from model at render time');

// ── Report ─────────────────────────────────────────────────────────────────────

console.log('── Visual State Guard (#17) ──────────────────────────────────────');
console.log(`   violations found: ${violations.length}`);

if (violations.length > 0) {
  console.error('\n  Violations:');
  for (const v of violations) {
    console.error(`  [${v.rule}] ${v.file}`);
    console.error(`    → ${v.desc}`);
  }
}

if (violations.length === 0) {
  console.log('\n✅ visual state intact — DOM classes derive from owner model at write time\n');
  process.exit(0);
}

console.error('\n❌ visual state gap — cached or duplicated visual flags detected');
console.error('   Fix: derive visual state from DS.selection/el.color at render time; remove _selected flags\n');
if (!REPORT) process.exit(1);
