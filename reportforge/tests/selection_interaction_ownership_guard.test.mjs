/**
 * Architecture guard: SelectionInteraction ownership boundaries.
 *
 * Phase 2 — enforces the split:
 *   SelectionInteraction.js    = thin orchestrator (delegates only)
 *   SelectionInteractionPointer.js = pointer events, text edit, drag start
 *   SelectionInteractionMotion.js  = move, resize, rubber band, mouse up
 *
 * Rules enforced:
 *   OWN-SI-001  SelectionInteraction.js exports exactly the canonical set.
 *   OWN-SI-002  SelectionInteraction.js is a thin delegator (≤ 60 LOC).
 *   OWN-SI-003  Pointer and Motion are loaded in production HTML BEFORE Interaction.
 *   OWN-SI-004  SelectionEngine.js delegates every public method to SelectionInteraction.
 *   OWN-SI-005  Pointer exports exactly the pointer responsibility set.
 *   OWN-SI-006  Motion exports exactly the motion responsibility set.
 *   OWN-SI-007  Motion._doMove/_doResize delegate layout writes through engine.updateElementLayout.
 *   OWN-SI-008  Motion.onMouseUp clears engine._drag (drag teardown).
 *   OWN-SI-009  Interaction.js delegates to Pointer (no inline pointer logic).
 *   OWN-SI-010  Interaction.js delegates to Motion (no inline motion logic).
 *   OWN-SI-011  Pointer and Motion stay below 200 LOC each.
 *   OWN-SI-012  Pointer delegates preview overlay enablement through SelectionEngine bridge.
 *   OWN-SI-013  SelectionOverlay delegates preview overlay state through SelectionEngine bridge.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

// ── Canonical export set (public API — unchanged for SelectionEngine) ─
const CANONICAL_EXPORTS = [
  'useCentralRouter',
  'onElementPointerDown',
  'onHandlePointerDown',
  'attachElementEvents',
  'startTextEdit',
  'startRubberBand',
  'attachHandleEvent',
  'onMouseMove',
  'onMouseUp',
  '_doMove',
  '_doResize',
  '_doRubberBand',
].sort();

const POINTER_EXPORTS = [
  'useCentralRouter',
  'onElementPointerDown',
  'onHandlePointerDown',
  'attachElementEvents',
  'startTextEdit',
  'startRubberBand',
  'attachHandleEvent',
].sort();

const MOTION_EXPORTS = [
  'onMouseMove',
  'onMouseUp',
  '_doMove',
  '_doResize',
  '_doRubberBand',
].sort();

function extractExports(src) {
  const returnMatch = src.match(/return\s*\{([^}]+)\}\s*;?\s*\}\)\(\)/s);
  if (!returnMatch) return [];
  return returnMatch[1]
    .split(',')
    .map(s => s.trim().split(':')[0].split(/\s/)[0].trim())
    .filter(Boolean)
    .sort();
}

// ── OWN-SI-001: canonical export set on orchestrator ──────────────────
test('OWN-SI-001 SelectionInteraction exports exactly the canonical set', () => {
  const exported = extractExports(read('engines/SelectionInteraction.js'));
  assert.deepStrictEqual(exported, CANONICAL_EXPORTS,
    `SelectionInteraction exports diverged.\n  Expected: ${CANONICAL_EXPORTS.join(', ')}\n  Got: ${exported.join(', ')}`);
});

// ── OWN-SI-002: orchestrator is thin ──────────────────────────────────
test('OWN-SI-002 SelectionInteraction.js is a thin delegator (≤ 60 LOC)', () => {
  const lines = read('engines/SelectionInteraction.js').split('\n').length;
  assert.ok(lines <= 60,
    `SelectionInteraction.js has ${lines} lines (max 60). It should only delegate.`);
});

// ── OWN-SI-003: load order in production HTML ─────────────────────────
test('OWN-SI-003 Pointer and Motion loaded in HTML before Interaction', () => {
  const html = read('designer/crystal-reports-designer-v4.html');
  const iPointer = html.indexOf('SelectionInteractionPointer.js');
  const iMotion  = html.indexOf('SelectionInteractionMotion.js');
  const iMain    = html.indexOf('"SelectionInteraction.js"') !== -1
    ? html.indexOf('"SelectionInteraction.js"')
    : html.indexOf("'SelectionInteraction.js'") !== -1
      ? html.indexOf("'SelectionInteraction.js'")
      : html.indexOf('/SelectionInteraction.js');
  assert.ok(iPointer > -1, 'SelectionInteractionPointer.js not found in HTML');
  assert.ok(iMotion > -1,  'SelectionInteractionMotion.js not found in HTML');
  assert.ok(iMain > -1,    'SelectionInteraction.js not found in HTML');
  assert.ok(iPointer < iMain, 'Pointer must load BEFORE Interaction');
  assert.ok(iMotion < iMain,  'Motion must load BEFORE Interaction');
});

// ── OWN-SI-004: SelectionEngine delegates to SelectionInteraction ─────
test('OWN-SI-004 SelectionEngine delegates every canonical export to SelectionInteraction', () => {
  const src = read('engines/SelectionEngine.js');
  for (const fn of CANONICAL_EXPORTS) {
    assert.ok(src.includes(`SelectionInteraction.${fn}`),
      `SelectionEngine.js must delegate ${fn} via SelectionInteraction.${fn}`);
  }
});

// ── OWN-SI-005: Pointer exports ───────────────────────────────────────
test('OWN-SI-005 SelectionInteractionPointer exports exactly the pointer set', () => {
  const exported = extractExports(read('engines/SelectionInteractionPointer.js'));
  assert.deepStrictEqual(exported, POINTER_EXPORTS,
    `Pointer exports diverged.\n  Expected: ${POINTER_EXPORTS.join(', ')}\n  Got: ${exported.join(', ')}`);
});

// ── OWN-SI-006: Motion exports ────────────────────────────────────────
test('OWN-SI-006 SelectionInteractionMotion exports exactly the motion set', () => {
  const exported = extractExports(read('engines/SelectionInteractionMotion.js'));
  assert.deepStrictEqual(exported, MOTION_EXPORTS,
    `Motion exports diverged.\n  Expected: ${MOTION_EXPORTS.join(', ')}\n  Got: ${exported.join(', ')}`);
});

// ── OWN-SI-007: model-write contract in Motion ────────────────────────
test('OWN-SI-007 Motion._doMove delegates layout writes through engine.updateElementLayout', () => {
  const src = read('engines/SelectionInteractionMotion.js');
  const match = src.match(/function _doMove\b[\s\S]*?^  \}/m);
  assert.ok(match, '_doMove not found in Motion');
  assert.ok(match[0].includes('engine.updateElementLayout'),
    'Motion._doMove must delegate layout writes to engine.updateElementLayout');
  assert.ok(!match[0].includes('DS.updateElementLayout'),
    'Motion._doMove must not call DS.updateElementLayout directly');
});

test('OWN-SI-007 Motion._doResize delegates layout writes through engine.updateElementLayout', () => {
  const src = read('engines/SelectionInteractionMotion.js');
  const match = src.match(/function _doResize\b[\s\S]*?^  \}/m);
  assert.ok(match, '_doResize not found in Motion');
  assert.ok(match[0].includes('engine.updateElementLayout'),
    'Motion._doResize must delegate layout writes to engine.updateElementLayout');
  assert.ok(!match[0].includes('DS.updateElementLayout'),
    'Motion._doResize must not call DS.updateElementLayout directly');
});

// ── OWN-SI-008: drag teardown in Motion ───────────────────────────────
test('OWN-SI-008 Motion.onMouseUp nullifies engine._drag', () => {
  const src = read('engines/SelectionInteractionMotion.js');
  const match = src.match(/function onMouseUp\b[\s\S]*?^  \}/m);
  assert.ok(match, 'onMouseUp not found in Motion');
  assert.ok(match[0].includes('engine._drag = null'),
    'Motion.onMouseUp must clear drag state');
});

// ── OWN-SI-009: orchestrator delegates to Pointer ─────────────────────
test('OWN-SI-009 Interaction.js delegates pointer functions to Pointer module', () => {
  const src = read('engines/SelectionInteraction.js');
  for (const fn of POINTER_EXPORTS) {
    assert.ok(src.includes(`SelectionInteractionPointer.${fn}`),
      `Interaction must delegate ${fn} to SelectionInteractionPointer`);
  }
});

// ── OWN-SI-010: orchestrator delegates to Motion ──────────────────────
test('OWN-SI-010 Interaction.js delegates motion functions to Motion module', () => {
  const src = read('engines/SelectionInteraction.js');
  for (const fn of MOTION_EXPORTS) {
    assert.ok(src.includes(`SelectionInteractionMotion.${fn}`),
      `Interaction must delegate ${fn} to SelectionInteractionMotion`);
  }
});

// ── OWN-SI-011: Pointer and Motion stay small ─────────────────────────
test('OWN-SI-011 SelectionInteractionPointer.js stays below 200 LOC', () => {
  const lines = read('engines/SelectionInteractionPointer.js').split('\n').length;
  assert.ok(lines <= 200,
    `SelectionInteractionPointer.js has ${lines} lines (max 200)`);
});

test('OWN-SI-011 SelectionInteractionMotion.js stays below 200 LOC', () => {
  const lines = read('engines/SelectionInteractionMotion.js').split('\n').length;
  assert.ok(lines <= 200,
    `SelectionInteractionMotion.js has ${lines} lines (max 200)`);
});

// ── Consistency: Pointer + Motion = canonical set ─────────────────────
test('Pointer + Motion exports cover all canonical exports without overlap', () => {
  const all = [...POINTER_EXPORTS, ...MOTION_EXPORTS].sort();
  assert.deepStrictEqual(all, CANONICAL_EXPORTS);
  const overlap = POINTER_EXPORTS.filter(f => MOTION_EXPORTS.includes(f));
  assert.deepStrictEqual(overlap, [], `Overlap: ${overlap.join(', ')}`);
});

// ── OWN-SI-012: pointer preview overlay bridge ───────────────────────
test('OWN-SI-012 SelectionInteractionPointer delegates preview overlay enablement through SelectionEngine bridge', () => {
  const pointerSrc = read('engines/SelectionInteractionPointer.js');
  const engineSrc = read('engines/SelectionEngine.js');
  assert.ok(engineSrc.includes('enableSelectionOverlay('),
    'SelectionEngine must expose enableSelectionOverlay bridge');
  assert.ok(engineSrc.includes('PreviewEngineMode.enableSelectionOverlay'),
    'SelectionEngine bridge must call PreviewEngineMode.enableSelectionOverlay');
  assert.ok(pointerSrc.includes('engine.enableSelectionOverlay('),
    'SelectionInteractionPointer must delegate overlay enablement to engine.enableSelectionOverlay');
  assert.ok(!pointerSrc.includes('PreviewEngineMode.enableSelectionOverlay'),
    'SelectionInteractionPointer must not call PreviewEngineMode.enableSelectionOverlay directly');
});

// ── OWN-SI-013: selection overlay preview bridge ─────────────────────
test('OWN-SI-013 SelectionOverlay delegates preview overlay state through SelectionEngine bridge', () => {
  const overlaySrc = read('engines/SelectionOverlay.js');
  const engineSrc = read('engines/SelectionEngine.js');
  assert.ok(engineSrc.includes('isSelectionOverlayVisible('),
    'SelectionEngine must expose isSelectionOverlayVisible bridge');
  assert.ok(engineSrc.includes('resetSelectionOverlay('),
    'SelectionEngine must expose resetSelectionOverlay bridge');
  assert.ok(overlaySrc.includes('engine.isSelectionOverlayVisible('),
    'SelectionOverlay must delegate overlay visibility checks to engine.isSelectionOverlayVisible');
  assert.ok(overlaySrc.includes('engine.enableSelectionOverlay('),
    'SelectionOverlay must delegate overlay enablement to engine.enableSelectionOverlay');
  assert.ok(overlaySrc.includes('engine.resetSelectionOverlay('),
    'SelectionOverlay must delegate overlay reset to engine.resetSelectionOverlay');
  assert.ok(!overlaySrc.includes('PreviewEngineMode.isSelectionOverlayVisible'),
    'SelectionOverlay must not call PreviewEngineMode.isSelectionOverlayVisible directly');
  assert.ok(!overlaySrc.includes('PreviewEngineMode.enableSelectionOverlay'),
    'SelectionOverlay must not call PreviewEngineMode.enableSelectionOverlay directly');
  assert.ok(!overlaySrc.includes('PreviewEngineMode.resetSelectionOverlay'),
    'SelectionOverlay must not call PreviewEngineMode.resetSelectionOverlay directly');
});
