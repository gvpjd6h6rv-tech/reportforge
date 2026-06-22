'use strict';
/**
 * command_runtime_selection_clipboard.test.mjs
 *
 * Covers the 6 active CommandRuntimeSelection.js functions
 * (copy/cut/paste/selectAll/sameWidth/sameHeight, P22D).
 *
 * P22D/P22E found a real dual-path clipboard bug: menu/toolbar
 * (data-action="copy"/"cut"/"paste" → CommandRuntimeSelection.* → DS.clipboard)
 * and Ctrl+C/X/V (KeyboardEngine.js:74-84 → ClipboardEngine.* → its own
 * private storage) never shared state, so mixing the two silently failed.
 *
 * P23B fixed this by making CommandRuntimeSelection.copy/cut/paste() delegate
 * to ClipboardEngine.copy/cut/paste() whenever ClipboardEngine is loaded
 * (always true in production — designer-v4.html:479), with the original
 * DS.clipboard-based logic kept ONLY as a fallback for a context where
 * ClipboardEngine isn't loaded (mirrors the same typeof-guard fallback idiom
 * already used throughout this codebase, e.g. ClipboardEngine's own
 * ClipboardState fallback).
 *
 * This file now covers BOTH branches:
 *   - "fallback path" tests (loadCRS, no ClipboardEngine in context) verify
 *     the original DS.clipboard logic still works when ClipboardEngine is
 *     absent — required by P23B's "maintain a reasonable fallback".
 *   - "delegated / interoperability" tests (loadClipboardWorld, both engines
 *     loaded) verify the bug is actually fixed: copy via one entry point and
 *     paste via the other now succeeds, because both go through the same
 *     ClipboardEngine.
 *
 * Also documents the lower-severity selectAll duplicate: Ctrl+A
 * (engines/KeyboardEngine.js:89-92) reimplements selectAll inline instead of
 * calling CommandEngine.selectAll() — same behavior, different source tag.
 * Not touched by this fix — out of scope for P23B.
 *
 * Coverage:
 *   1. copy/cut/paste fallback path (ClipboardEngine absent).
 *   2. selectAll, sameWidth, sameHeight (unaffected by the clipboard fix).
 *   3. copy/cut/paste delegate to ClipboardEngine when it is present, and no
 *      longer touch DS.clipboard at all in that case.
 *   4. FIXED: menu copy → Ctrl+V paste now succeeds.
 *   5. FIXED: Ctrl+C copy → menu paste now succeeds.
 *   6. FIXED: mixed cut (menu cut → Ctrl+V paste) does not lose the element.
 *   7. selectAll: CommandRuntimeSelection vs the literal Ctrl+A snippet are
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
  ctx.ClipboardEngine = ClipboardEngine; // make it a readable global for CommandRuntimeSelection's typeof check

  ctx.module = { exports: {} };
  vm.runInNewContext(CRS_SRC, ctx);
  const CRS = ctx.window.CommandRuntimeSelection;

  // ClipboardEngine.cut() calls the global `CommandEngine.delete()` (not
  // ClipboardEngine itself) to remove the originals — in production
  // CommandEngine is the merged object built in CommandRuntime.js that
  // includes CommandRuntimeSelection's methods. CRS.delete is already that
  // same removeSelection function (aliased in its own return object).
  ctx.CommandEngine = CRS;

  return { CRS, ClipboardEngine, ClipboardState, DS, calls };
}

// ── copy / cut / paste — FALLBACK path (ClipboardEngine absent) ─────────────
//
// loadCRS() does not put ClipboardEngine in the vm context, so
// `typeof ClipboardEngine !== 'undefined'` is false here — these tests
// exercise CommandRuntimeSelection's own DS.clipboard-based logic, kept as
// the fallback per P23B's "maintain a reasonable fallback" requirement.

test('FALLBACK — copy stores selected elements as JSON strings in DS.clipboard', () => {
  const { CRS, DS } = loadCRS([makeEl('a', { x: 5, y: 6 })], ['a']);
  CRS.copy();
  assert.equal(DS.clipboard.length, 1);
  assert.equal(typeof DS.clipboard[0], 'string', 'DS.clipboard entries must be JSON strings, not objects');
  assert.deepEqual(JSON.parse(DS.clipboard[0]), makeEl('a', { x: 5, y: 6 }));
});

test('FALLBACK — copy is a no-op when nothing is selected', () => {
  const { CRS, DS } = loadCRS([makeEl('a')], []);
  CRS.copy();
  assert.deepEqual(DS.clipboard, []);
});

test('FALLBACK — paste round-trips a CommandRuntimeSelection copy back into new elements, offset by 8', () => {
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

test('FALLBACK — paste is a no-op when DS.clipboard is empty', () => {
  const { CRS, DS, calls } = loadCRS([makeEl('a')], []);
  CRS.paste();
  assert.equal(DS.elements.length, 1, 'no element must be added');
  assert.equal(calls.saveHistory, 0);
});

test('FALLBACK — cut copies then removes the selected elements', () => {
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

// ── DELEGATION: copy/cut/paste hand off to ClipboardEngine when present ─────
//
// loadClipboardWorld() puts ClipboardEngine in the vm context, so
// `typeof ClipboardEngine !== 'undefined'` is true — CommandRuntimeSelection
// must delegate entirely and never touch DS.clipboard in this branch.

test('DELEGATION — copy does not touch DS.clipboard when ClipboardEngine is present', () => {
  const { CRS, ClipboardEngine, DS } = loadClipboardWorld([makeEl('a', { x: 5, y: 6 })], ['a']);
  CRS.copy();
  assert.equal(DS.clipboard.length, 0, 'DS.clipboard must stay untouched — copy() delegated to ClipboardEngine');
  assert.ok(ClipboardEngine.hasContent(), 'ClipboardEngine must hold the copied content instead');
});

test('DELEGATION — paste delegates to ClipboardEngine.paste() and returns its result', () => {
  const { CRS, ClipboardEngine, DS } = loadClipboardWorld([makeEl('a', { x: 5, y: 6 })], ['a']);
  ClipboardEngine.copy();
  CRS.paste();
  assert.equal(DS.elements.length, 2, 'paste must add the pasted element via ClipboardEngine');
});

test('DELEGATION — cut delegates to ClipboardEngine.cut(), which still removes the element via the shared delete path', () => {
  const { CRS, ClipboardEngine, DS } = loadClipboardWorld([makeEl('a', { x: 1, y: 2 }), makeEl('b')], ['a']);
  CRS.cut();
  assert.deepEqual(DS.elements.map((e) => e.id), ['b'], 'the cut element must be removed from DS.elements');
  assert.ok(ClipboardEngine.hasContent(), 'the cut element must be retrievable from ClipboardEngine');
});

// ── FIXED: clipboard dual-path bug — confirmed by reproduction, not narration ─
//
// Same 2 scenarios documented as KNOWN BUG in P22E. Now that
// CommandRuntimeSelection delegates to ClipboardEngine whenever it is
// present (always true in production), both directions succeed.

test('FIXED — menu copy (CommandRuntimeSelection) then Ctrl+V paste (ClipboardEngine) now succeeds', () => {
  const { CRS, ClipboardEngine, DS } = loadClipboardWorld([makeEl('a', { x: 5, y: 6 })], ['a']);

  CRS.copy(); // menu/toolbar entry point
  const newIds = ClipboardEngine.paste(); // Ctrl+V entry point

  assert.equal(newIds.length, 1, 'FIXED: ClipboardEngine.paste() now sees the menu copy');
  assert.equal(DS.elements.length, 2, 'FIXED: a new element was actually pasted');
});

test('FIXED — Ctrl+C copy (ClipboardEngine) then menu paste (CommandRuntimeSelection) now succeeds', () => {
  const { CRS, ClipboardEngine, DS } = loadClipboardWorld([makeEl('a', { x: 5, y: 6 })], ['a']);

  ClipboardEngine.copy(); // Ctrl+C entry point
  CRS.paste(); // menu/toolbar entry point

  assert.equal(DS.elements.length, 2,
    'FIXED: CommandRuntimeSelection.paste() now sees the Ctrl+C copy, because it delegates to the same ClipboardEngine');
});

test('FIXED — mixed cut: menu cut, then Ctrl+V paste, does not lose the element', () => {
  const { CRS, ClipboardEngine, DS } = loadClipboardWorld([makeEl('a', { x: 1, y: 2 }), makeEl('b')], ['a']);

  CRS.cut(); // menu cut — removes 'a', stores it via ClipboardEngine
  assert.deepEqual(DS.elements.map((e) => e.id), ['b'], 'sanity: the original element was removed by cut');

  const newIds = ClipboardEngine.paste(); // Ctrl+V — must bring it back

  assert.equal(newIds.length, 1, 'FIXED: the cut element must be retrievable via Ctrl+V — no data loss');
  // DS.elements was rebuilt via a `[...]` spread inside ClipboardEngine.js's
  // own paste() — that spread executes in the vm sandbox realm, so the
  // resulting array (and .map()/.sort() on it) is a sandbox-realm array.
  // Compare by content (.includes), not assert.deepEqual against a
  // main-realm array literal (same pitfall as P13B/P15E/P22E).
  const ids = DS.elements.map((e) => e.id);
  assert.equal(ids.length, 2);
  assert.ok(ids.includes('b'));
  assert.ok(ids.includes(newIds[0]));
});

test('FIXED — mixed cut the other way: Ctrl+X cut, then menu paste, does not lose the element', () => {
  const { CRS, ClipboardEngine, DS } = loadClipboardWorld([makeEl('a', { x: 1, y: 2 }), makeEl('b')], ['a']);

  ClipboardEngine.cut(); // Ctrl+X — removes 'a' via the shared CommandEngine.delete(), stores it via ClipboardEngine
  assert.deepEqual(DS.elements.map((e) => e.id), ['b'], 'sanity: the original element was removed by Ctrl+X');

  CRS.paste(); // menu paste — must bring it back, now that CRS.paste() delegates too

  assert.equal(DS.elements.length, 2, 'FIXED: the Ctrl+X-cut element must be retrievable via menu paste — no data loss');
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
