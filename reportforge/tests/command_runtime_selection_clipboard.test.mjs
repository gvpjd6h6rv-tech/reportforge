'use strict';
/**
 * command_runtime_selection_clipboard.test.mjs
 *
 * Covers the 6 remaining active CommandRuntimeSelection.js functions
 * (copy/cut/paste/selectAll/sameWidth/sameHeight, P22D) AND documents, with
 * a reproducing test (not just narration), the real dual-path clipboard bug
 * found in P22D:
 *
 *   menu/toolbar click (data-action="copy"/"cut"/"paste")
 *     → CommandEngine.copy/cut/paste() → CommandRuntimeSelection.* → DS.clipboard
 *
 *   Ctrl+C / Ctrl+X / Ctrl+V (engines/KeyboardEngine.js:74-84)
 *     → ClipboardEngine.copy/cut/paste() → ClipboardState's private _clipboard
 *
 * These two paths never share storage. Copying via one and pasting via the
 * other silently does nothing (or pastes stale content) — confirmed below
 * by loading both engines.js files into the SAME DS/window, not narrated.
 *
 * Also documents the lower-severity selectAll duplicate: Ctrl+A
 * (engines/KeyboardEngine.js:89-92) reimplements selectAll inline instead of
 * calling CommandEngine.selectAll() — same behavior, different source tag.
 *
 * Coverage:
 *   1. copy/cut/paste round-trip through CommandRuntimeSelection alone.
 *   2. selectAll, sameWidth, sameHeight.
 *   3. DS.clipboard is read/written as an array of JSON strings (the actual
 *      shape CommandRuntimeSelection uses), confirmed explicitly.
 *   4. BUG: copy via CommandRuntimeSelection + paste via ClipboardEngine.
 *   5. BUG: copy via ClipboardEngine + paste via CommandRuntimeSelection.
 *   6. selectAll: CommandRuntimeSelection vs the literal Ctrl+A snippet are
 *      behaviorally equivalent except for the source tag.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const CRS_SRC = fs.readFileSync(resolve(ROOT, 'engines/CommandRuntimeSelection.js'), 'utf8');
const CLIPBOARD_STATE_SRC = fs.readFileSync(resolve(ROOT, 'engines/ClipboardState.js'), 'utf8');
const CLIPBOARD_ENGINE_SRC = fs.readFileSync(resolve(ROOT, 'engines/ClipboardEngine.js'), 'utf8');

function makeEl(id, extra = {}) {
  return { id, x: 0, y: 0, w: 10, h: 10, ...extra };
}

// Mirrors engines/DocumentState.js::newId() (`e${++elementCounter}`) — used
// by CommandRuntimeSelection.paste() as a bare global, no typeof guard.
function makeNewId() {
  let counter = 0;
  return () => `e${++counter}`;
}

// Mirrors document.querySelector/.remove() as used by
// CommandRuntimeSelection.removeSelection() — a bare global, no typeof guard.
function makeDocumentStub(domCalls) {
  return {
    querySelector(selector) {
      domCalls.querySelector.push(selector);
      const m = selector.match(/data-id="([^"]+)"/);
      const id = m ? m[1] : null;
      return { remove() { domCalls.remove.push(id); } };
    },
  };
}

function makeDS(elements, selectionIds) {
  const calls = {
    updateElementLayout: [],
    setElements: [],
    addSelection: [],
    clearSelectionState: [],
    saveHistory: 0,
    syncSelectionPanels: 0,
  };
  const DS = {
    elements,
    selection: [...selectionIds],
    clipboard: [],
    getSelectedElements() {
      return this.elements.filter((e) => this.selection.includes(e.id));
    },
    getElementById(id) {
      return this.elements.find((e) => e.id === id);
    },
    updateElementLayout(id, partial, source) {
      calls.updateElementLayout.push({ id, partial, source });
      const el = this.elements.find((e) => e.id === id);
      if (el) Object.assign(el, partial);
    },
    setElements(newEls, source) {
      calls.setElements.push({ ids: newEls.map((e) => e.id), source });
      this.elements = newEls;
    },
    addSelection(id, source) {
      calls.addSelection.push({ id, source });
      this.selection.push(id);
    },
    clearSelectionState(source) {
      calls.clearSelectionState.push(source);
      this.selection = [];
    },
    saveHistory() { calls.saveHistory++; },
    snap(v) { return v; },
  };
  return { DS, calls };
}

/** Loads only CommandRuntimeSelection.js — used by tests 1-3 (no clipboard cross-path). */
function loadCRS(elements, selectionIds) {
  const { DS, calls } = makeDS(elements, selectionIds);
  const domCalls = { querySelector: [], remove: [] };
  const _canonicalCanvasWriter = () => ({
    renderElement() {},
    updateElementPosition() {},
  });
  const window = {
    CommandRuntimeShared: {
      setStatus() {},
      syncSelectionPanels() { calls.syncSelectionPanels++; },
      renderSelectionHandles() {},
    },
  };
  const ctx = {
    window, DS, _canonicalCanvasWriter, console,
    newId: makeNewId(),
    document: makeDocumentStub(domCalls),
  };
  vm.runInNewContext(CRS_SRC, ctx);
  return { CRS: ctx.window.CommandRuntimeSelection, DS, calls, domCalls };
}

/**
 * Loads CommandRuntimeSelection.js, ClipboardState.js, and ClipboardEngine.js
 * into ONE shared context — DS, ClipboardState instance, and the canvas
 * writer are all the same object across the three, so any cross-path bug is
 * real, not an artifact of separate stubs.
 */
function loadClipboardWorld(elements, selectionIds) {
  const { DS, calls } = makeDS(elements, selectionIds);
  const _canonicalCanvasWriter = () => ({
    renderElement() {},
    updateElementPosition() {},
  });
  const window = {
    CommandRuntimeShared: {
      setStatus() {},
      syncSelectionPanels() { calls.syncSelectionPanels++; },
      renderSelectionHandles() {},
    },
  };
  const domCalls = { querySelector: [], remove: [] };
  const ctx = {
    window, DS, _canonicalCanvasWriter, console, module: { exports: {} },
    newId: makeNewId(),
    document: makeDocumentStub(domCalls),
  };

  vm.runInNewContext(CLIPBOARD_STATE_SRC, ctx);
  const ClipboardState = ctx.module.exports;
  ctx.ClipboardState = ClipboardState; // make it a readable global for ClipboardEngine's typeof check

  ctx.module = { exports: {} };
  vm.runInNewContext(CLIPBOARD_ENGINE_SRC, ctx);
  const ClipboardEngine = ctx.module.exports;

  ctx.module = { exports: {} };
  vm.runInNewContext(CRS_SRC, ctx);
  const CRS = ctx.window.CommandRuntimeSelection;

  return { CRS, ClipboardEngine, ClipboardState, DS, calls };
}

// ── copy / cut / paste — within CommandRuntimeSelection alone ────────────────

test('copy — stores selected elements as JSON strings in DS.clipboard', () => {
  const { CRS, DS } = loadCRS([makeEl('a', { x: 5, y: 6 })], ['a']);
  CRS.copy();
  assert.equal(DS.clipboard.length, 1);
  assert.equal(typeof DS.clipboard[0], 'string', 'DS.clipboard entries must be JSON strings, not objects');
  assert.deepEqual(JSON.parse(DS.clipboard[0]), makeEl('a', { x: 5, y: 6 }));
});

test('copy — is a no-op when nothing is selected', () => {
  const { CRS, DS } = loadCRS([makeEl('a')], []);
  CRS.copy();
  assert.deepEqual(DS.clipboard, []);
});

test('paste — round-trips a CommandRuntimeSelection copy back into new elements, offset by 8', () => {
  const { CRS, DS, calls } = loadCRS([makeEl('a', { x: 5, y: 6 })], ['a']);
  CRS.copy();
  CRS.paste();
  assert.equal(DS.elements.length, 2, 'paste must add a new element alongside the original');
  const pasted = DS.elements.find((e) => e.id !== 'a');
  assert.ok(pasted, 'a new element with a fresh id must be created');
  assert.equal(pasted.x, 13, 'pasted x must be original(5) + 8');
  assert.equal(pasted.y, 14, 'pasted y must be original(6) + 8');
  assert.equal(calls.saveHistory, 1);
  assert.equal(calls.syncSelectionPanels, 1);
  assert.deepEqual(DS.selection, [pasted.id], 'the newly pasted element must become the selection');
});

test('paste — is a no-op when DS.clipboard is empty', () => {
  const { CRS, DS, calls } = loadCRS([makeEl('a')], []);
  CRS.paste();
  assert.equal(DS.elements.length, 1, 'no element must be added');
  assert.equal(calls.saveHistory, 0);
});

test('cut — copies then removes the selected elements', () => {
  const { CRS, DS } = loadCRS([makeEl('a', { x: 1, y: 2 }), makeEl('b')], ['a']);
  CRS.cut();
  assert.equal(DS.clipboard.length, 1);
  assert.deepEqual(JSON.parse(DS.clipboard[0]), makeEl('a', { x: 1, y: 2 }));
  assert.deepEqual(DS.elements.map((e) => e.id), ['b'], 'the cut element must be removed from DS.elements');
});

// ── selectAll ─────────────────────────────────────────────────────────────────

test('selectAll — selects every element in DS.elements', () => {
  const { CRS, DS } = loadCRS([makeEl('a'), makeEl('b'), makeEl('c')], []);
  CRS.selectAll();
  assert.deepEqual(DS.selection, ['a', 'b', 'c']);
});

test('selectAll — clears any prior selection first', () => {
  const { CRS, DS, calls } = loadCRS([makeEl('a'), makeEl('b')], ['a']);
  CRS.selectAll();
  assert.deepEqual(DS.selection, ['a', 'b']);
  assert.deepEqual(calls.clearSelectionState, ['CommandRuntimeSelection.selectAll']);
});

test('selectAll — syncs selection panels and does not save history', () => {
  const { calls, CRS } = loadCRS([makeEl('a')], []);
  CRS.selectAll();
  assert.equal(calls.syncSelectionPanels, 1);
  assert.equal(calls.saveHistory, 0, 'selecting is not an undoable content change');
});

// ── sameWidth / sameHeight ──────────────────────────────────────────────────

test('sameWidth — applies the first selected element\'s width to the rest', () => {
  const { CRS, DS } = loadCRS(
    [makeEl('a', { w: 40 }), makeEl('b', { w: 10 }), makeEl('c', { w: 20 })],
    ['a', 'b', 'c'],
  );
  CRS.sameWidth();
  assert.equal(DS.elements.find((e) => e.id === 'a').w, 40, 'the reference element is left unchanged');
  assert.equal(DS.elements.find((e) => e.id === 'b').w, 40);
  assert.equal(DS.elements.find((e) => e.id === 'c').w, 40);
});

test('sameWidth — is a no-op with fewer than 2 selected elements', () => {
  const { CRS, DS, calls } = loadCRS([makeEl('a', { w: 40 })], ['a']);
  CRS.sameWidth();
  assert.equal(DS.elements[0].w, 40);
  assert.equal(calls.saveHistory, 0);
});

test('sameHeight — applies the first selected element\'s height to the rest', () => {
  const { CRS, DS } = loadCRS(
    [makeEl('a', { h: 99 }), makeEl('b', { h: 10 })],
    ['a', 'b'],
  );
  CRS.sameHeight();
  assert.equal(DS.elements.find((e) => e.id === 'a').h, 99);
  assert.equal(DS.elements.find((e) => e.id === 'b').h, 99);
});

test('sameWidth/sameHeight — call saveHistory() and syncSelectionPanels() exactly once', () => {
  for (const action of ['sameWidth', 'sameHeight']) {
    const { CRS, calls } = loadCRS(
      [makeEl('a', { w: 40, h: 40 }), makeEl('b', { w: 10, h: 10 })],
      ['a', 'b'],
    );
    CRS[action]();
    assert.equal(calls.saveHistory, 1, `${action} must call saveHistory once`);
    assert.equal(calls.syncSelectionPanels, 1, `${action} must call syncSelectionPanels once`);
  }
});

// ── BUG: clipboard dual-path — confirmed by reproduction, not narration ──────

test('BUG — copy via CommandRuntimeSelection, then paste via ClipboardEngine, pastes nothing', () => {
  const { CRS, ClipboardEngine, DS } = loadClipboardWorld([makeEl('a', { x: 5, y: 6 })], ['a']);

  CRS.copy(); // writes JSON strings into DS.clipboard
  assert.equal(DS.clipboard.length, 1, 'sanity: DS.clipboard was populated');

  const newIds = ClipboardEngine.paste(); // reads from ClipboardState, which CRS.copy() never touched

  // newIds is a vm-sandbox-realm array — compare by length/content, not
  // assert.deepEqual against a main-realm [] literal, which also checks
  // Object.prototype identity and would false-fail across realms even on
  // identical (empty) content (same pitfall as P13B/P15E in this campaign).
  assert.equal(newIds.length, 0, 'KNOWN BUG: ClipboardEngine.paste() returns nothing — it never saw the CommandRuntimeSelection copy');
  assert.equal(DS.elements.length, 1, 'KNOWN BUG: no element was actually pasted, despite DS.clipboard holding real content');
});

test('BUG — copy via ClipboardEngine, then paste via CommandRuntimeSelection, pastes nothing', () => {
  const { CRS, ClipboardEngine, DS } = loadClipboardWorld([makeEl('a', { x: 5, y: 6 })], ['a']);

  ClipboardEngine.copy(); // writes into ClipboardState's private _clipboard
  assert.equal(DS.clipboard.length, 0, 'sanity: DS.clipboard (CommandRuntimeSelection\'s storage) was never touched');

  CRS.paste(); // reads DS.clipboard, which is still empty

  assert.equal(DS.elements.length, 1,
    'KNOWN BUG: CommandRuntimeSelection.paste() is a no-op — it never saw the ClipboardEngine copy, ' +
    'because DS.clipboard.length is 0 even though ClipboardState holds real content');
});

test('BUG — the two clipboard storages use incompatible shapes even if one tried to read the other', () => {
  // Reinforces why the bug above is not a trivial "forgot to sync" fix:
  // CommandRuntimeSelection stores JSON STRINGS in DS.clipboard;
  // ClipboardEngine stores deep-copied OBJECTS in ClipboardState. Even a
  // naive cross-read would need a format conversion, not just a shared
  // reference.
  const { CRS, ClipboardEngine, ClipboardState, DS } = loadClipboardWorld([makeEl('a')], ['a']);
  CRS.copy();
  assert.equal(typeof DS.clipboard[0], 'string', 'CommandRuntimeSelection.copy() stores JSON strings');

  ClipboardState.clear();
  ClipboardEngine.copy();
  assert.equal(typeof ClipboardState.get()[0], 'object', 'ClipboardEngine.copy() stores plain objects, not strings');
});

// ── selectAll duplicate: CommandRuntimeSelection vs the literal Ctrl+A snippet ─

test('selectAll duplicate — the Ctrl+A inline snippet (KeyboardEngine.js:89-92) behaves identically except for the source tag', () => {
  // KeyboardEngine.js registers Ctrl+A with this exact inline body instead of
  // calling CommandEngine.selectAll() — reproduced verbatim here (not loading
  // the full KeyboardEngine.js file, which would need many unrelated stubs)
  // to compare behavior directly against CommandRuntimeSelection.selectAll().
  function ctrlASnippet(DS) {
    DS.clearSelectionState('KeyboardEngine.selectAll');
    DS.elements.forEach((el) => DS.addSelection(el.id, 'KeyboardEngine.selectAll'));
  }

  const elements = [makeEl('a'), makeEl('b'), makeEl('c')];
  const { CRS, DS: dsViaCRS, calls: callsCRS } = loadCRS(elements.map((e) => ({ ...e })), ['a']);
  const { DS: dsViaKeyboard, calls: callsKeyboard } = makeDS(elements.map((e) => ({ ...e })), ['a']);

  CRS.selectAll();
  ctrlASnippet(dsViaKeyboard);

  assert.deepEqual(dsViaCRS.selection, dsViaKeyboard.selection,
    'both paths must select the exact same elements, in the same order');

  assert.deepEqual(callsCRS.clearSelectionState, ['CommandRuntimeSelection.selectAll']);
  assert.deepEqual(callsKeyboard.clearSelectionState, ['KeyboardEngine.selectAll']);
  assert.notEqual(callsCRS.clearSelectionState[0], callsKeyboard.clearSelectionState[0],
    'KNOWN: behavior is identical, but the source/attribution tag differs depending on which UI path triggered it');
});
