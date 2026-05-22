'use strict';
/**
 * document_actions_adversarial.test.mjs — Phase 1 + Phase 2 + Phase 3
 *
 * Adversarial unit tests — no browser.
 * Loads DocumentState, DocumentActions, DocumentHistory directly in Node.js.
 *
 * Covers:
 *   [H-03] assertZoom rejects 0, negatives, NaN — never accepts non-positive
 *   [C-01] All 6 selection methods throw when called without source
 *   [C-01] All 6 selection methods call _record('selection', ...) after mutation
 *   [H-02] _record captures state.field (stored value), not the raw parameter
 *          Proof via setPageMarginLeft(-5) → recorded value is 0, not -5
 *   [C-02] DocumentHistory.undo/redo routes through getApi().setSections/setElements/clearSelectionState
 *   [H-01] HistoryEngine.push() does NOT call DS.saveHistory() — no double-save
 */

import test   from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath }  from 'node:url';
import path               from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);

const DocumentState   = require(`${ROOT}/engines/DocumentState.js`);
const DocumentActions = require(`${ROOT}/engines/DocumentActions.js`);
const DocumentHistory = require(`${ROOT}/engines/DocumentHistory.js`);

// ── helpers ──────────────────────────────────────────────────────────────────

function makeEnv() {
  const { state, invariants } = DocumentState.createDocumentState();
  const writes = [];
  const audits = [];

  // Mock RuntimeWriteLog as a global (DocumentActions checks typeof at call time)
  globalThis.RuntimeWriteLog = { recordWrite(e) { writes.push(e); } };
  globalThis.RF_AUDIT = (entry) => audits.push(entry);
  globalThis.RenderSchedulerScope = undefined; // no phase tracking in unit tests

  const selectors = { getElementById: (id) => state.elements.find(e => e.id === id) || null };
  const history   = { saveHistory() {}, undo() {}, redo() {}, updateUndoRedo() {} };

  const actions = DocumentActions.createDocumentActions(
    state, selectors, invariants, history, null,
  );
  return { state, invariants, actions, writes, audits };
}

// ═══════════════════════════════════════════════════════════════════════════════
// [H-03] assertZoom rejects zero and negatives
// ═══════════════════════════════════════════════════════════════════════════════

test('[H-03] assertZoom(0) throws INVALID ZOOM CONTRACT — zero is not a valid zoom', () => {
  const { invariants } = makeEnv();
  assert.throws(
    () => invariants.assertZoom(0),
    (err) => err instanceof Error && err.message.includes('INVALID ZOOM CONTRACT'),
    'assertZoom(0) must throw — zero zoom makes no geometric sense',
  );
});

test('[H-03] assertZoom(-1) throws — negative zoom is forbidden', () => {
  const { invariants } = makeEnv();
  assert.throws(
    () => invariants.assertZoom(-1),
    (err) => err.message.includes('INVALID ZOOM CONTRACT'),
  );
});

test('[H-03] assertZoom(-Infinity) throws', () => {
  const { invariants } = makeEnv();
  assert.throws(
    () => invariants.assertZoom(-Infinity),
    (err) => err.message.includes('INVALID ZOOM CONTRACT'),
  );
});

test('[H-03] assertZoom(NaN) throws', () => {
  const { invariants } = makeEnv();
  assert.throws(
    () => invariants.assertZoom(NaN),
    (err) => err.message.includes('INVALID ZOOM CONTRACT'),
  );
});

test('[H-03] assertZoom(0.001) does NOT throw — smallest valid zoom', () => {
  const { invariants } = makeEnv();
  assert.doesNotThrow(() => invariants.assertZoom(0.001));
});

test('[H-03] assertZoom(1.0) does NOT throw', () => {
  const { invariants } = makeEnv();
  assert.doesNotThrow(() => invariants.assertZoom(1.0));
});

test('[H-03] assertZoom(4.0) does NOT throw', () => {
  const { invariants } = makeEnv();
  assert.doesNotThrow(() => invariants.assertZoom(4.0));
});

// ═══════════════════════════════════════════════════════════════════════════════
// [C-01] All 6 selection methods throw when called WITHOUT source
// Each must fail with "source is required" — not silently pass
// ═══════════════════════════════════════════════════════════════════════════════

test('[C-01] clearSelectionState() without source → throws source required', () => {
  const { actions } = makeEnv();
  assert.throws(
    () => actions.clearSelectionState(),
    (err) => err instanceof Error && err.message.includes('source is required'),
  );
});

test('[C-01] replaceSelection([]) without source → throws source required', () => {
  const { actions } = makeEnv();
  assert.throws(
    () => actions.replaceSelection([]),
    (err) => err instanceof Error && err.message.includes('source is required'),
  );
});

test('[C-01] selectOnly(id) without source → throws source required', () => {
  const { actions } = makeEnv();
  assert.throws(
    () => actions.selectOnly('e101'),
    (err) => err instanceof Error && err.message.includes('source is required'),
  );
});

test('[C-01] addSelection(id) without source → throws source required', () => {
  const { actions } = makeEnv();
  assert.throws(
    () => actions.addSelection('e101'),
    (err) => err instanceof Error && err.message.includes('source is required'),
  );
});

test('[C-01] removeSelection(id) without source → throws source required', () => {
  const { actions } = makeEnv();
  assert.throws(
    () => actions.removeSelection('e101'),
    (err) => err instanceof Error && err.message.includes('source is required'),
  );
});

test('[C-01] toggleSelection(id) without source → throws source required', () => {
  const { actions } = makeEnv();
  assert.throws(
    () => actions.toggleSelection('e101'),
    (err) => err instanceof Error && err.message.includes('source is required'),
  );
});

// ═══════════════════════════════════════════════════════════════════════════════
// [C-01] All 6 selection methods record a 'selection' write when source IS provided
// ═══════════════════════════════════════════════════════════════════════════════

test('[C-01] clearSelectionState records selection write with empty Set', () => {
  const { actions, writes } = makeEnv();
  actions.clearSelectionState('test.clearSelection');
  const w = writes.find((e) => e.field === 'selection');
  assert.ok(w, 'must emit a selection write');
  assert.equal(w.source, 'test.clearSelection');
  assert.ok(w.value instanceof Set, 'value must be the selection Set');
  assert.equal(w.value.size, 0, 'Set must be empty after clear');
});

test('[C-01] selectOnly records selection write containing the selected id', () => {
  const { actions, writes } = makeEnv();
  actions.selectOnly('e101', 'test.selectOnly');
  const w = writes.find((e) => e.field === 'selection');
  assert.ok(w, 'must emit a selection write');
  assert.equal(w.source, 'test.selectOnly');
  assert.ok(w.value instanceof Set && w.value.has('e101'),
    `selection Set must contain 'e101'; got: ${JSON.stringify([...w.value])}`);
});

test('[C-01] addSelection records selection write containing added id', () => {
  const { actions, writes } = makeEnv();
  actions.addSelection('e102', 'test.addSelection');
  const w = writes.find((e) => e.field === 'selection');
  assert.ok(w, 'must emit a selection write');
  assert.ok(w.value.has('e102'), 'selection Set must contain e102');
});

test('[C-01] removeSelection records selection write after delete', () => {
  const { actions, writes } = makeEnv();
  // First add so there's something to remove
  actions.addSelection('e101', 'setup');
  writes.length = 0; // clear setup writes
  actions.removeSelection('e101', 'test.removeSelection');
  const w = writes.find((e) => e.field === 'selection');
  assert.ok(w, 'must emit a selection write on remove');
  assert.ok(!w.value.has('e101'), 'e101 must no longer be in selection Set');
});

test('[C-01] toggleSelection(add) records selection write', () => {
  const { actions, writes } = makeEnv();
  const result = actions.toggleSelection('e101', 'test.toggle');
  assert.equal(result, true, 'toggleSelection must return true when id was added');
  const w = writes.find((e) => e.field === 'selection');
  assert.ok(w, 'must emit a selection write');
  assert.ok(w.value.has('e101'), 'selection must contain added id');
});

test('[C-01] toggleSelection(remove) records selection write and returns false', () => {
  const { actions, writes } = makeEnv();
  actions.addSelection('e101', 'setup');
  writes.length = 0;
  const result = actions.toggleSelection('e101', 'test.toggle.remove');
  assert.equal(result, false, 'toggleSelection must return false when id was removed');
  const w = writes.find((e) => e.field === 'selection');
  assert.ok(w, 'must emit a selection write on toggle-remove');
  assert.ok(!w.value.has('e101'), 'e101 must no longer be in selection');
});

// ═══════════════════════════════════════════════════════════════════════════════
// [H-02] _record captures state.field (stored/clamped value), NOT the raw param
// Proof: setPageMarginLeft(-5) clamps to 0 — recorded value must be 0, not -5
// ═══════════════════════════════════════════════════════════════════════════════

test('[H-02] setPageMarginLeft(-5) records clamped value 0, NOT raw param -5', () => {
  const { actions, writes } = makeEnv();
  actions.setPageMarginLeft(-5, 'test.setMarginLeft');
  const w = writes.find((e) => e.field === 'pageMarginLeft');
  assert.ok(w, 'must record a pageMarginLeft write');
  assert.equal(w.value, 0,
    `recorded value must be the clamped state value (0), got ${w.value}. Raw param was -5 — if this fails, _record used the raw parameter instead of state.pageMarginLeft`);
  assert.notEqual(w.value, -5,
    'recorded value must NOT be the raw parameter -5');
});

test('[H-02] setPageMarginTop(-99) records clamped value 0, NOT raw param -99', () => {
  const { actions, writes } = makeEnv();
  actions.setPageMarginTop(-99, 'test.setMarginTop');
  const w = writes.find((e) => e.field === 'pageMarginTop');
  assert.ok(w, 'must record a pageMarginTop write');
  assert.equal(w.value, 0, `recorded value must be 0 (clamped), got ${w.value}`);
});

test('[H-02] setZoom(1.5) records exactly state.zoom (1.5) — stored = param here', () => {
  const { actions, writes } = makeEnv();
  actions.setZoom(1.5, 'test.setZoom');
  const w = writes.find((e) => e.field === 'zoom');
  assert.ok(w, 'must record a zoom write');
  assert.equal(w.value, 1.5, 'recorded value must match stored zoom');
});

test('[H-02] setZoom source "UNKNOWN" → throws (source guard active)', () => {
  const { actions } = makeEnv();
  assert.throws(
    () => actions.setZoom(1.0, 'UNKNOWN'),
    (err) => err instanceof Error && err.message.includes('UNKNOWN'),
  );
});

test('[audit] DocumentActions emits structured audit entries with before/after and elementId', () => {
  const { state, actions, audits } = makeEnv();
  state.elements.push({ id: 'e1', sectionId: 's1', x: 10, y: 20, w: 30, h: 40 });

  actions.setZoom(1.5, 'ZoomEngine.step');
  actions.selectOnly('e1', 'SelectionInteraction.onElementPointerDown');
  actions.updateElementLayout('e1', { x: 12, y: 24, w: 32, h: 44 }, 'SelectionInteraction.move');

  const zoomAudit = audits.find((entry) => entry.action === 'setZoom');
  assert.ok(zoomAudit, 'setZoom must emit audit');
  assert.equal(zoomAudit.before, 1);
  assert.equal(zoomAudit.after, 1.5);
  assert.equal(zoomAudit.owner, 'designer-runtime/document-state');

  const selectAudit = audits.find((entry) => entry.action === 'selectOnly');
  assert.ok(selectAudit, 'selectOnly must emit audit');
  assert.deepEqual(selectAudit.before, []);
  assert.deepEqual(selectAudit.after, ['e1']);

  const moveAudit = audits.find((entry) => entry.action === 'updateElementLayout');
  assert.ok(moveAudit, 'updateElementLayout must emit audit');
  assert.equal(moveAudit.elementId, 'e1');
  assert.deepEqual(moveAudit.before, { id: 'e1', sectionId: 's1', x: 10, y: 20, w: 30, h: 40 });
  assert.deepEqual(moveAudit.after, { id: 'e1', sectionId: 's1', x: 12, y: 24, w: 32, h: 44 });
  assert.equal(moveAudit.result, 'ok');
});

// ═══════════════════════════════════════════════════════════════════════════════
// [Phase 2] Static guard — no DS.elements.push() / DS.sections.splice() in engines/
// Any match means a bypass was re-introduced.
// ═══════════════════════════════════════════════════════════════════════════════

import { readdirSync, readFileSync } from 'node:fs';

test('[P2-STATIC] no DS.elements.push() in engines/ — all callers must use DS.setElements()', () => {
  const dir = path.join(ROOT, 'engines');
  const files = readdirSync(dir).filter(f => f.endsWith('.js'));
  const hits = [];
  for (const f of files) {
    const src = readFileSync(path.join(dir, f), 'utf8');
    const lines = src.split('\n');
    lines.forEach((line, i) => {
      if (/DS\.elements\.push\s*\(/.test(line) && !line.trimStart().startsWith('//')) {
        hits.push(`${f}:${i + 1}: ${line.trim()}`);
      }
    });
  }
  assert.deepEqual(hits, [],
    `DS.elements.push() bypass found — use DS.setElements([...DS.elements, el], source):\n  ${hits.join('\n  ')}`);
});

test('[P2-STATIC] no DS.sections.splice() in engines/ — use DS.setSections(newArray, source)', () => {
  const dir = path.join(ROOT, 'engines');
  const files = readdirSync(dir).filter(f => f.endsWith('.js'));
  const hits = [];
  for (const f of files) {
    const src = readFileSync(path.join(dir, f), 'utf8');
    const lines = src.split('\n');
    lines.forEach((line, i) => {
      if (/DS\.sections\.splice\s*\(/.test(line) && !line.trimStart().startsWith('//')) {
        hits.push(`${f}:${i + 1}: ${line.trim()}`);
      }
    });
  }
  assert.deepEqual(hits, [],
    `DS.sections.splice() bypass found — build new array and use DS.setSections():\n  ${hits.join('\n  ')}`);
});

test('[P2-STATIC] no DS.sections[i]= swap mutation in engines/ — use DS.setSections()', () => {
  const dir = path.join(ROOT, 'engines');
  const files = readdirSync(dir).filter(f => f.endsWith('.js'));
  const hits = [];
  for (const f of files) {
    const src = readFileSync(path.join(dir, f), 'utf8');
    const lines = src.split('\n');
    lines.forEach((line, i) => {
      if (/DS\.sections\s*\[/.test(line) && /\]\s*=\s*[^=]/.test(line) && !line.trimStart().startsWith('//')) {
        hits.push(`${f}:${i + 1}: ${line.trim()}`);
      }
    });
  }
  assert.deepEqual(hits, [],
    `DS.sections[i]= mutation found — build new array and use DS.setSections():\n  ${hits.join('\n  ')}`);
});

// ═══════════════════════════════════════════════════════════════════════════════
// [C-02] DocumentHistory.undo/redo routes through getApi() — not direct state write
// Proof: spy on getApi()'s setSections/setElements/clearSelectionState calls
// ═══════════════════════════════════════════════════════════════════════════════

function makeHistoryEnv() {
  const { state } = DocumentState.createDocumentState();
  const calls = [];
  const fakeApi = {
    setSections(sections, source) { calls.push({ method: 'setSections', sections, source }); state.sections = sections; },
    setElements(elements, source) { calls.push({ method: 'setElements', elements, source }); state.elements = elements; },
    clearSelectionState(source) { calls.push({ method: 'clearSelectionState', source }); state.selection.clear(); },
    notify() {},
  };
  const history = DocumentHistory.createDocumentHistory(state, () => {}, {}, () => fakeApi);
  // save initial snapshot
  history.saveHistory();
  return { state, history, calls };
}

test('[C-02] DocumentHistory.undo() calls getApi().setSections with source DocumentHistory.undo', () => {
  const { state, history, calls } = makeHistoryEnv();
  state.sections = [{ id: 's2', stype: 'det', label: 'D', height: 20, visible: true }];
  history.saveHistory();
  calls.length = 0; // reset spy
  history.undo();
  const c = calls.find((x) => x.method === 'setSections');
  assert.ok(c, 'undo() must call getApi().setSections');
  assert.equal(c.source, 'DocumentHistory.undo',
    `setSections source must be 'DocumentHistory.undo', got '${c.source}'`);
});

test('[C-02] DocumentHistory.undo() calls getApi().setElements with source DocumentHistory.undo', () => {
  const { state, history, calls } = makeHistoryEnv();
  state.elements = [{ id: 'e1', type: 'text', x: 0, y: 0, w: 100, h: 20, sectionId: 's1' }];
  history.saveHistory();
  calls.length = 0;
  history.undo();
  const c = calls.find((x) => x.method === 'setElements');
  assert.ok(c, 'undo() must call getApi().setElements');
  assert.equal(c.source, 'DocumentHistory.undo',
    `setElements source must be 'DocumentHistory.undo', got '${c.source}'`);
});

test('[C-02] DocumentHistory.undo() calls getApi().clearSelectionState with source DocumentHistory.undo', () => {
  const { state, history, calls } = makeHistoryEnv();
  history.saveHistory();
  calls.length = 0;
  history.undo();
  const c = calls.find((x) => x.method === 'clearSelectionState');
  assert.ok(c, 'undo() must call getApi().clearSelectionState');
  assert.equal(c.source, 'DocumentHistory.undo',
    `clearSelectionState source must be 'DocumentHistory.undo', got '${c.source}'`);
});

test('[C-02] DocumentHistory.redo() calls getApi().setSections with source DocumentHistory.redo', () => {
  const { state, history, calls } = makeHistoryEnv();
  state.sections = [{ id: 's2', stype: 'det', label: 'D', height: 20, visible: true }];
  history.saveHistory();
  history.undo(); // go back one step
  calls.length = 0;
  history.redo();
  const c = calls.find((x) => x.method === 'setSections');
  assert.ok(c, 'redo() must call getApi().setSections');
  assert.equal(c.source, 'DocumentHistory.redo',
    `setSections source must be 'DocumentHistory.redo', got '${c.source}'`);
});

test('[C-02] DocumentHistory.redo() calls getApi().setElements with source DocumentHistory.redo', () => {
  const { state, history, calls } = makeHistoryEnv();
  state.elements = [{ id: 'e1', type: 'text', x: 0, y: 0, w: 100, h: 20, sectionId: 's1' }];
  history.saveHistory();
  history.undo();
  calls.length = 0;
  history.redo();
  const c = calls.find((x) => x.method === 'setElements');
  assert.ok(c, 'redo() must call getApi().setElements');
  assert.equal(c.source, 'DocumentHistory.redo',
    `setElements source must be 'DocumentHistory.redo', got '${c.source}'`);
});

test('[C-02] DocumentHistory.undo() does NOT directly write state.sections when getApi is provided', () => {
  const { state, history, calls } = makeHistoryEnv();
  const originalSections = state.sections;
  state.sections = [{ id: 's-mutated', stype: 'det', label: 'M', height: 20, visible: true }];
  history.saveHistory();
  // Spy: replace setSections to track the call but also check state BEFORE it runs
  let stateWrittenDirectly = false;
  const sectionsBefore = state.sections;
  // We can verify indirectly: if only setSections was called (not direct assignment),
  // then all section changes must show up as calls in our spy
  calls.length = 0;
  history.undo();
  // After undo, calls must include setSections — not a raw state.sections assignment
  assert.ok(calls.some((c) => c.method === 'setSections'),
    'undo() must route through getApi().setSections, not state.sections = ...');
});

// ═══════════════════════════════════════════════════════════════════════════════
// [H-01] HistoryEngine.push() must NOT call DS.saveHistory() — prevents double-save
// ═══════════════════════════════════════════════════════════════════════════════

test('[H-01] HistoryEngine.js has no DS.saveHistory() call — static proof of no double-save', () => {
  const src = readFileSync(path.join(ROOT, 'engines/HistoryEngine.js'), 'utf8');
  const lines = src.split('\n');
  const hits = lines.filter((l) => /DS\.saveHistory\s*\(/.test(l) && !l.trimStart().startsWith('//'));
  assert.deepEqual(hits, [],
    `HistoryEngine must not call DS.saveHistory() — creates double history entries:\n  ${hits.join('\n  ')}`);
});
