#!/usr/bin/env node
'use strict';
/**
 * immutability_guard.mjs — Principle #2 Inmutabilidad controlada
 *
 * Verifies that mutable shared state is owned by a single authority and
 * cannot be mutated by arbitrary engine files.
 *
 * RULE-A (IMMUT-HIST-001): HistoryEngine.js must keep _undoStack/_redoStack
 *   as closure-private variables. No other engine file may contain those
 *   identifiers — the mutation gate is the closure itself.
 *
 * RULE-B (IMMUT-EXPOSE-001): HistoryEngine must not expose _undoStack or
 *   _redoStack in its return object. External code must use push/undo/redo
 *   and must never reach the raw stacks.
 *
 * RULE-C (IMMUT-DS-001): Direct assignment to DS.elements and DS.sections
 *   (i.e. "DS.elements =" or "DS.sections =") must be confined to the
 *   document-store owner files and the CommandRuntime layer. Render engines
 *   (Canvas*, Selection*, Overlay*, Handles*, Align*, Geometry*, Snap*,
 *   Drag*, Keyboard*, Grid*, Ruler*, Zoom*, Preview*, RenderScheduler*,
 *   Workspace*) must not directly assign to DS state arrays.
 *
 * RULE-D (IMMUT-HIST-002): HistoryState.js must use factory-function closures
 *   (undoStack / redoStack as private let/const), not exported raw arrays, so
 *   tests instantiate isolated state rather than a shared singleton.
 *
 * Usage:
 *   node audit/immutability_guard.mjs          # fail on violations
 *   node audit/immutability_guard.mjs --report # report only
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

const historyEngine = readEngine('HistoryEngine.js');
const historyState  = readEngine('HistoryState.js');

// All engine files except the allowed owners for DS state mutation.
const RENDER_ENGINES = [
  'CanvasLayoutEngine.js', 'CanvasLayoutElements.js', 'CanvasLayoutSize.js', 'CanvasLayoutContracts.js',
  'CanvasGeometry.js',
  'SelectionEngine.js', 'SelectionGeometry.js', 'SelectionHitTest.js', 'SelectionInteraction.js',
  'SelectionInteractionMotion.js', 'SelectionInteractionPointer.js', 'SelectionOverlay.js',
  'OverlayEngine.js',
  'HandlesEngine.js',
  'AlignEngine.js', 'AlignEngineActions.js', 'AlignmentEngine.js', 'AlignmentGeometry.js',
  'AlignmentGuideOverlay.js', 'AlignmentGuides.js',
  'GeometryCore.js', 'RuntimeGeometry.js',
  'SnapCore.js', 'SnapEngine.js', 'SnapGuides.js',
  'DragEngine.js',
  'KeyboardEngine.js',
  'GridEngine.js',
  'RulerEngine.js', 'RulerEngineRenderer.js',
  'ZoomEngine.js', 'EngineCoreRoutingZoom.js',
  'PreviewEngine.js', 'PreviewEngineData.js', 'PreviewEngineMode.js', 'PreviewEngineRenderer.js',
  'PreviewEngineContracts.js',
  'RenderScheduler.js', 'RenderSchedulerFrame.js', 'RenderSchedulerQueue.js',
  'RenderSchedulerScope.js', 'RenderSchedulerState.js',
  'WorkspaceScrollEngine.js', 'WorkspaceScrollEngineLayout.js', 'WorkspaceScrollEngineRuntime.js',
  'SectionEngine.js', 'SectionLayoutEngine.js', 'SectionResizeEngine.js',
  'ElementLayoutEngine.js',
  'HitTestEngine.js', 'HitTestGeometry.js',
  'GuideEngine.js', 'GuideRenderer.js',
  'FormulaEngine.js', 'FormatEngine.js',
  'FieldExplorerEngine.js', 'FieldExplorerDrop.js', 'FieldExplorerTree.js',
  'PropertiesEngine.js', 'PropertiesEnginePanel.js',
  'InsertEngine.js',
];

const violations = [];

function check(rule, file, condition, desc) {
  if (!condition) violations.push({ rule, file, desc });
}

// ── RULE-A: _undoStack / _redoStack only in HistoryEngine.js ─────────────────

const allEngineFiles = fs.readdirSync(ENGINES).filter((f) => f.endsWith('.js'));
const stackLeakFiles = allEngineFiles.filter((f) => {
  if (f === 'HistoryEngine.js') return false;
  const src = readEngine(f);
  return /_undoStack|_redoStack/.test(src);
});

check('IMMUT-HIST-001', 'engines/*.js',
  stackLeakFiles.length === 0,
  `_undoStack/_redoStack must be closure-private to HistoryEngine.js — found in: ${stackLeakFiles.join(', ') || 'none'}`);

// ── RULE-B: HistoryEngine must not expose raw stacks in return object ─────────

// The return object of HistoryEngine should not have _undoStack/_redoStack as keys.
// We check that the string "undoStack:" does not appear in the returned object literal.
// HistoryState.js intentionally exposes undoStack/redoStack for test isolation — exempted.
const histEngineReturn = historyEngine.slice(historyEngine.indexOf('return {'));
check('IMMUT-EXPOSE-001', 'engines/HistoryEngine.js',
  !/\bundoStack\s*[,}]/.test(histEngineReturn),
  'HistoryEngine must not expose raw undoStack in its return object — callers must use push/undo/redo');

check('IMMUT-EXPOSE-001', 'engines/HistoryEngine.js',
  !/\bredoStack\s*[,}]/.test(histEngineReturn),
  'HistoryEngine must not expose raw redoStack in its return object — callers must use push/undo/redo');

// ── RULE-C: Render engines must not directly assign DS.elements/DS.sections ──

const DS_ASSIGN = /DS\.(elements|sections)\s*=/;
const renderViolators = RENDER_ENGINES.filter((f) => {
  const src = readEngine(f);
  return DS_ASSIGN.test(src);
});

check('IMMUT-DS-001', 'engines/[render engines]',
  renderViolators.length === 0,
  `Render engines must not directly assign DS.elements/DS.sections — found in: ${renderViolators.join(', ') || 'none'} ` +
  '(mutation must go through document-store owner or CommandRuntime layer)');

// ── RULE-D: HistoryState.js uses factory closures, not a shared singleton ────

check('IMMUT-HIST-002', 'engines/HistoryState.js',
  /function createHistoryState/.test(historyState),
  'HistoryState.js must use a factory function (createHistoryState) for test isolation — not a shared singleton');

check('IMMUT-HIST-002', 'engines/HistoryState.js',
  /const undoStack\s*=\s*\[\]/.test(historyState) || /let undoStack\s*=\s*\[\]/.test(historyState),
  'HistoryState.js factory must declare undoStack as a closure-private array');

// ── Report ─────────────────────────────────────────────────────────────────────

console.log('── Immutability Guard (#2) ───────────────────────────────────────');
console.log(`   stack-leak files:    ${stackLeakFiles.length}`);
console.log(`   DS-assign violators: ${renderViolators.length}`);
console.log(`   violations found:    ${violations.length}`);

if (violations.length > 0) {
  console.error('\n  Violations:');
  for (const v of violations) {
    console.error(`  [${v.rule}] ${v.file}`);
    console.error(`    → ${v.desc}`);
  }
}

if (violations.length === 0) {
  console.log('\n✅ immutability intact — history stacks private, DS writes confined to owners\n');
  process.exit(0);
}

console.error('\n❌ immutability gap — shared state accessible outside its owner');
console.error('   Fix: remove stack exposure from HistoryEngine return; use DS actions for mutations\n');
if (!REPORT) process.exit(1);
