'use strict';
/**
 * command_runtime_selection_invert.test.mjs — invertSelection panel sync (P26B)
 *
 * P26A found that CommandRuntimeSelection.invertSelection() called
 * CommandRuntimeShared.renderSelectionHandles() (only SelectionEngine.
 * renderHandles()) instead of syncSelectionPanels() (renderHandles +
 * PropertiesEngine.render() + FormatEngine.updateToolbar()) — the same
 * function selectAll() already uses. That left the properties panel and
 * format toolbar stale after inverting the selection, same bug class as the
 * Ctrl+A duplication fixed in P24B, but here it's an inconsistency between
 * two sibling functions in the SAME file, not a duplicate implementation.
 *
 * Loads the REAL CommandRuntimeShared.js + CommandRuntimeSelection.js
 * together so the panel-sync chain is exercised end-to-end, not stubbed.
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

function makeEl(id) {
  return { id, x: 0, y: 0, w: 10, h: 10 };
}

function makeDS(elements, selectionIds) {
  const calls = { clearSelectionState: [], addSelection: [] };
  return {
    elements,
    selection: new Set(selectionIds),
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

function loadWorld(elements, selectionIds) {
  const panelCalls = { renderHandles: 0, propertiesRender: 0, formatToolbar: 0 };
  const statusCalls = [];
  const DS = makeDS(elements, selectionIds);

  const ctx = {
    window: {},
    DS,
    SelectionEngine: { renderHandles() { panelCalls.renderHandles++; } },
    PropertiesEngine: { render() { panelCalls.propertiesRender++; } },
    FormatEngine: { updateToolbar() { panelCalls.formatToolbar++; } },
    document: {},
    console,
  };
  ctx.window.console = console;

  vm.runInNewContext(SHARED_SRC, ctx);
  // setStatus() in CommandRuntimeShared reads document.getElementById — stub
  // it directly on CommandRuntimeShared after load so we can assert on it
  // without needing a real DOM.
  const realSetStatus = ctx.window.CommandRuntimeShared.setStatus;
  ctx.window.CommandRuntimeShared = {
    ...ctx.window.CommandRuntimeShared,
    setStatus(message) { statusCalls.push(message); },
  };
  vm.runInNewContext(SELECTION_SRC, ctx);

  return { CRS: ctx.window.CommandRuntimeSelection, DS, panelCalls, statusCalls, realSetStatus };
}

// ── FIXED — full syncSelectionPanels chain ──────────────────────────────────

test('FIXED — invertSelection (partial → complement) runs the full syncSelectionPanels chain', () => {
  const { CRS, DS, panelCalls } = loadWorld(
    [makeEl('a'), makeEl('b'), makeEl('c')],
    ['b'],
  );
  CRS.invertSelection();

  assert.deepEqual([...DS.selection].sort(), ['a', 'c'], 'b must be deselected, a and c selected');
  assert.equal(panelCalls.renderHandles, 1, 'renderHandles must be called exactly once');
  assert.equal(panelCalls.propertiesRender, 1, 'FIX: PropertiesEngine.render() must now be called');
  assert.equal(panelCalls.formatToolbar, 1, 'FIX: FormatEngine.updateToolbar() must now be called');
});

test('FIXED — invertSelection with empty selection selects everything', () => {
  const { CRS, DS, panelCalls } = loadWorld(
    [makeEl('a'), makeEl('b'), makeEl('c')],
    [],
  );
  CRS.invertSelection();

  assert.deepEqual([...DS.selection].sort(), ['a', 'b', 'c']);
  assert.equal(panelCalls.propertiesRender, 1);
  assert.equal(panelCalls.formatToolbar, 1);
});

test('FIXED — invertSelection with full selection clears everything', () => {
  const { CRS, DS, panelCalls } = loadWorld(
    [makeEl('a'), makeEl('b')],
    ['a', 'b'],
  );
  CRS.invertSelection();

  assert.deepEqual([...DS.selection], []);
  assert.equal(panelCalls.propertiesRender, 1, 'panels must still sync even when the result is an empty selection');
  assert.equal(panelCalls.formatToolbar, 1);
  assert.equal(panelCalls.renderHandles, 1);
});

test('invertSelection calls setStatus with a confirmation message', () => {
  const { CRS, statusCalls } = loadWorld([makeEl('a'), makeEl('b')], ['a']);
  CRS.invertSelection();
  assert.deepEqual(statusCalls, ['Selección invertida']);
});

test('invertSelection uses the canonical source tag for both clearSelectionState and addSelection', () => {
  const { CRS, DS } = loadWorld([makeEl('a'), makeEl('b')], ['a']);
  CRS.invertSelection();
  assert.deepEqual(DS._calls.clearSelectionState, ['CommandRuntimeSelection.invertSelection']);
  assert.deepEqual(DS._calls.addSelection.map((c) => c.source), ['CommandRuntimeSelection.invertSelection']);
});

test('invertSelection on zero elements is a safe no-op-equivalent (still syncs panels)', () => {
  const { CRS, DS, panelCalls } = loadWorld([], []);
  assert.doesNotThrow(() => CRS.invertSelection());
  assert.deepEqual([...DS.selection], []);
  assert.equal(panelCalls.propertiesRender, 1);
});
