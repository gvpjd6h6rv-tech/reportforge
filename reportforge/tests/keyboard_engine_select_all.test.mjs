'use strict';
/**
 * keyboard_engine_select_all.test.mjs — Ctrl+A unification (P24B)
 *
 * P24A found that KeyboardEngine.js's Ctrl+A duplicated
 * CommandRuntimeSelection.selectAll() inline instead of delegating, and the
 * duplicate only called SelectionEngine.renderHandles() — never
 * PropertiesEngine.render() or FormatEngine.updateToolbar(), unlike
 * CommandRuntimeShared.syncSelectionPanels() (the function the menu/toolbar
 * select-all path uses). That leaves the properties panel and format
 * toolbar stale after Ctrl+A. It also recorded a different RuntimeWriteLog
 * source tag ('KeyboardEngine.selectAll' vs 'CommandRuntimeSelection.selectAll')
 * for the same logical action.
 *
 * This loads the REAL CommandRuntimeShared.js + CommandRuntimeSelection.js +
 * KeyboardEngine.js together in one vm context (CommandEngine aliased to
 * CommandRuntimeSelection, mirroring the real CommandRuntime.js merge — same
 * pattern KeyboardEngine.js already uses for Ctrl+X/Delete via
 * CommandEngine.delete()), so the "after fix" tests exercise the real
 * syncSelectionPanels() chain end-to-end, not a stub.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SHARED_SRC = fs.readFileSync(resolve(ROOT, 'engines/CommandRuntimeShared.js'), 'utf8');
const SELECTION_SRC = fs.readFileSync(resolve(ROOT, 'engines/CommandRuntimeSelection.js'), 'utf8');
const KEYBOARD_SRC = fs.readFileSync(resolve(ROOT, 'engines/KeyboardEngine.js'), 'utf8');

function makeEl(id) {
  return { id, x: 0, y: 0, w: 10, h: 10 };
}

function makeDS(elements) {
  const calls = { clearSelectionState: [], addSelection: [] };
  return {
    elements,
    selection: new Set(),
    clearSelectionState(source) {
      calls.clearSelectionState.push(source);
      this.selection.clear();
    },
    addSelection(id, source) {
      calls.addSelection.push({ id, source });
      this.selection.add(id);
    },
    getSelectedElements() {
      return this.elements.filter((e) => this.selection.has(e.id));
    },
    _calls: calls,
  };
}

/**
 * Loads CommandRuntimeShared + CommandRuntimeSelection + KeyboardEngine into
 * one shared vm context. `withCommandEngine` controls whether CommandEngine
 * is aliased (production-equivalent) or left undefined (exercises the
 * fallback branch with no CommandEngine loaded).
 */
function loadWorld(elements, { withCommandEngine = true } = {}) {
  const panelCalls = { renderHandles: 0, propertiesRender: 0, formatToolbar: 0 };
  const DS = makeDS(elements);

  const ctx = {
    window: {},
    DS,
    SelectionEngine: { renderHandles() { panelCalls.renderHandles++; }, clearSelection() {} },
    PropertiesEngine: { render() { panelCalls.propertiesRender++; } },
    FormatEngine: { updateToolbar() { panelCalls.formatToolbar++; } },
    document: { addEventListener() {}, activeElement: null },
    console,
  };
  ctx.window.console = console;

  vm.runInNewContext(SHARED_SRC, ctx);
  vm.runInNewContext(SELECTION_SRC, ctx);

  if (withCommandEngine) {
    ctx.CommandEngine = ctx.window.CommandRuntimeSelection;
  }

  ctx.module = { exports: {} };
  vm.runInNewContext(KEYBOARD_SRC, ctx);
  const KeyboardEngine = ctx.module.exports;
  KeyboardEngine.init();

  return { KeyboardEngine, DS, panelCalls };
}

function triggerCtrlA(KeyboardEngine) {
  KeyboardEngine.registry.trigger('ctrl+a', {});
}

// ── BUG REPRODUCTION (documents the pre-fix behavior) ──────────────────────

test('BUG (pre-fix, fallback branch) — Ctrl+A renders handles but NOT properties/format panels', () => {
  // This is the exact branch the ORIGINAL inline Ctrl+A always ran in
  // production (CommandEngine was never referenced by the old code at all).
  // After the P24B fix this branch is only a fallback for when CommandEngine
  // isn't loaded — but it is intentionally left with the same limitation it
  // always had, same as P23B kept the DS.clipboard fallback in
  // CommandRuntimeSelection without fixing it. This test documents that
  // limitation as a known fact, not an oversight.
  const { KeyboardEngine, DS, panelCalls } = loadWorld(
    [makeEl('a'), makeEl('b')],
    { withCommandEngine: false },
  );
  triggerCtrlA(KeyboardEngine);

  assert.deepEqual([...DS.selection].sort(), ['a', 'b'], 'DS.selection must still be correct');
  assert.equal(panelCalls.renderHandles, 1, 'renderHandles must still be called');
  assert.equal(panelCalls.propertiesRender, 0, 'KNOWN LIMITATION: fallback never calls PropertiesEngine.render()');
  assert.equal(panelCalls.formatToolbar, 0, 'KNOWN LIMITATION: fallback never calls FormatEngine.updateToolbar()');
  assert.deepEqual(DS._calls.addSelection.map((c) => c.source), ['KeyboardEngine.selectAll', 'KeyboardEngine.selectAll']);
});

// ── FIXED behavior (CommandEngine present — always true in production) ─────

test('FIXED — Ctrl+A delegates to CommandEngine.selectAll() and runs the full syncSelectionPanels chain', () => {
  const { KeyboardEngine, DS, panelCalls } = loadWorld(
    [makeEl('a'), makeEl('b'), makeEl('c')],
    { withCommandEngine: true },
  );
  triggerCtrlA(KeyboardEngine);

  assert.deepEqual([...DS.selection].sort(), ['a', 'b', 'c'], 'DS.selection must contain every element');
  assert.equal(panelCalls.renderHandles, 1, 'renderHandles must be called exactly once');
  assert.equal(panelCalls.propertiesRender, 1, 'FIX: PropertiesEngine.render() must now be called');
  assert.equal(panelCalls.formatToolbar, 1, 'FIX: FormatEngine.updateToolbar() must now be called');
});

test('FIXED — source tag is consolidated to CommandRuntimeSelection.selectAll (no more KeyboardEngine.selectAll tag)', () => {
  const { KeyboardEngine, DS } = loadWorld([makeEl('a')], { withCommandEngine: true });
  triggerCtrlA(KeyboardEngine);

  assert.deepEqual(DS._calls.clearSelectionState, ['CommandRuntimeSelection.selectAll']);
  assert.deepEqual(DS._calls.addSelection.map((c) => c.source), ['CommandRuntimeSelection.selectAll']);
});

test('FIXED — fallback path is preserved when CommandEngine is not loaded (no crash, same as before)', () => {
  const { KeyboardEngine, DS } = loadWorld([makeEl('a')], { withCommandEngine: false });
  assert.doesNotThrow(() => triggerCtrlA(KeyboardEngine));
  assert.deepEqual([...DS.selection], ['a']);
});

test('Ctrl+A is a no-op-safe call when there are zero elements (both branches)', () => {
  for (const withCommandEngine of [true, false]) {
    const { KeyboardEngine, DS } = loadWorld([], { withCommandEngine });
    assert.doesNotThrow(() => triggerCtrlA(KeyboardEngine));
    assert.deepEqual([...DS.selection], []);
  }
});
