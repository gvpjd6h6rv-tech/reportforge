'use strict';
/**
 * command_runtime_selection_mutation.test.mjs — bringFront/sendBack/delete contracts
 *
 * Covers the 3 "class A" functions identified in P22A: active (real UI path
 * via data-action="bring-front"/"send-back"/"delete") AND carrying a real
 * canonical-write risk — they mutate state outside the write-logged path
 * (RuntimeWriteLog.js / Principle #22 "Fallbacks honestos") that
 * paste()/sameWidth()/sameHeight() correctly use.
 *
 * bringFront/sendBack still document a real, intentional finding: each
 * "DOCUMENTED BYPASS" test would FAIL if those functions were changed to go
 * through DS.updateElementLayout() instead, so it doubles as a regression
 * guard for whichever direction that code evolves in.
 *
 * delete/removeSelection() no longer has that bypass (P25B): it used to
 * query the DOM directly (document.querySelector(...).remove()), bypassing
 * the canonical canvas writer entirely. It now requires
 * _canonicalCanvasWriter().renderAll() — the writer's own full-resync
 * method — instead of touching the DOM itself.
 *
 * Coverage:
 *   1. bringFront(): zIndex becomes max+1, calls _canonicalCanvasWriter().
 *      updateElement() once per element, calls DS.saveHistory() once, and
 *      NEVER calls DS.updateElementLayout() (direct property write, documented).
 *   2. sendBack(): zIndex becomes min-1, same call contract, same documented
 *      bypass of DS.updateElementLayout().
 *   3. delete/removeSelection(): DS.setElements() called with the
 *      'CommandRuntimeSelection.removeSelection' tag, DS.saveHistory() once,
 *      syncSelectionPanels() once, and DOM cleanup exclusively via
 *      _canonicalCanvasWriter().renderAll() — never document.querySelector().
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = fs.readFileSync(resolve(ROOT, 'engines/CommandRuntimeSelection.js'), 'utf8');

function makeEl(id, extra = {}) {
  return { id, x: 0, y: 0, w: 10, h: 10, ...extra };
}

function load(elements, selectionIds) {
  const calls = {
    updateElementLayout: [],
    updateElement: [],
    setElements: [],
    clearSelectionState: [],
    saveHistory: 0,
    syncSelectionPanels: 0,
    renderAll: 0,
  };
  const domCalls = { querySelector: [], remove: [] };

  const DS = {
    elements,
    selection: [...selectionIds],
    getSelectedElements() {
      return this.elements.filter((e) => this.selection.includes(e.id));
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
    clearSelectionState(source) {
      calls.clearSelectionState.push(source);
      this.selection = [];
    },
    saveHistory() { calls.saveHistory++; },
  };

  const _canonicalCanvasWriter = () => ({
    updateElement(id) { calls.updateElement.push(id); },
    updateElementPosition() {},
    renderElement() {},
    renderAll() { calls.renderAll++; },
  });

  const document = {
    querySelector(selector) {
      domCalls.querySelector.push(selector);
      const m = selector.match(/data-id="([^"]+)"/);
      const id = m ? m[1] : null;
      return {
        remove() { domCalls.remove.push(id); },
      };
    },
  };

  const window = {
    CommandRuntimeShared: {
      setStatus() {},
      syncSelectionPanels() { calls.syncSelectionPanels++; },
      renderSelectionHandles() {},
    },
  };

  const ctx = { window, DS, _canonicalCanvasWriter, document, console };
  vm.runInNewContext(SRC, ctx);
  return { CRS: ctx.window.CommandRuntimeSelection, DS, calls, domCalls };
}

// ── bringFront ────────────────────────────────────────────────────────────────

test('bringFront — moves the selected element above the current max zIndex', () => {
  const { CRS, DS } = load(
    [makeEl('a', { zIndex: 3 }), makeEl('b', { zIndex: 7 }), makeEl('c', { zIndex: 1 })],
    ['a'],
  );
  CRS.bringFront();
  assert.equal(DS.elements.find((e) => e.id === 'a').zIndex, 8, 'a.zIndex must be maxZ(7) + 1');
});

test('bringFront — with no zIndex on any element, treats missing zIndex as 0', () => {
  const { CRS, DS } = load([makeEl('a'), makeEl('b')], ['a']);
  CRS.bringFront();
  assert.equal(DS.elements.find((e) => e.id === 'a').zIndex, 1, 'maxZ defaults to 0 when no element has zIndex');
});

test('bringFront — with all zIndex negative, maxZ is capped at 0 (Math.max(0, ...) floor)', () => {
  // Mirrors the sendBack "never lowers minZ below 0" test, in the opposite
  // direction: Math.max(0, ...DS.elements.map(zIndex)) means maxZ can never
  // go negative even if every element already has a negative zIndex.
  const { CRS, DS } = load(
    [makeEl('a', { zIndex: -5 }), makeEl('b', { zIndex: -2 })],
    ['a'],
  );
  CRS.bringFront();
  assert.equal(DS.elements.find((e) => e.id === 'a').zIndex, 1,
    'maxZ is capped at 0 even when all zIndex are negative, so a.zIndex = 0 + 1');
});

test('bringFront — calls _canonicalCanvasWriter().updateElement() once per element, in stable DS.elements order', () => {
  // No .sort() here on purpose (P22C gap 2) — order must follow
  // DS.elements's own array order (which is what getSelectedElements()
  // filters over), not the order ids were added to DS.selection, and not
  // an incidentally-sorted id sequence.
  const { CRS, calls } = load(
    [makeEl('b', { zIndex: 2 }), makeEl('a', { zIndex: 1 })], // 'b' first in DS.elements
    ['a', 'b'], // 'a' first in DS.selection — deliberately the opposite order
  );
  CRS.bringFront();
  assert.deepEqual(calls.updateElement, ['b', 'a'],
    'call order must follow DS.elements array order (b, a), not selection order (a, b) or sorted order (a, b)');
});

test('bringFront — calls DS.saveHistory() exactly once', () => {
  const { CRS, calls } = load([makeEl('a', { zIndex: 1 })], ['a']);
  CRS.bringFront();
  assert.equal(calls.saveHistory, 1);
});

test('bringFront — is a no-op when nothing is selected', () => {
  const { CRS, calls } = load([makeEl('a', { zIndex: 1 })], []);
  assert.doesNotThrow(() => CRS.bringFront());
  assert.equal(calls.saveHistory, 0);
  assert.equal(calls.updateElement.length, 0);
});

test('DOCUMENTED BYPASS — bringFront never calls DS.updateElementLayout(); it writes e.zIndex directly', () => {
  // This is the canonical-write-path bypass flagged in P22A: bringFront
  // mutates the element object's zIndex property directly instead of
  // routing through DS.updateElementLayout()/DS.setElements(), which means
  // it never passes through RuntimeWriteLog.js — Principle #22 "Fallbacks
  // honestos" territory. This assertion documents the bypass as a known
  // fact, not an oversight: if bringFront is ever migrated to the canonical
  // path, this test must be updated to assert calls.updateElementLayout
  // is used instead, not silently left behind.
  const { CRS, calls } = load([makeEl('a', { zIndex: 1 }), makeEl('b', { zIndex: 2 })], ['a', 'b']);
  CRS.bringFront();
  assert.equal(calls.updateElementLayout.length, 0,
    'KNOWN BYPASS: bringFront writes e.zIndex directly, never through DS.updateElementLayout() — no write-log attribution');
});

// ── sendBack ──────────────────────────────────────────────────────────────────

test('sendBack — moves the selected element below the current min zIndex', () => {
  const { CRS, DS } = load(
    [makeEl('a', { zIndex: 3 }), makeEl('b', { zIndex: 7 }), makeEl('c', { zIndex: 1 })],
    ['a'],
  );
  CRS.sendBack();
  assert.equal(DS.elements.find((e) => e.id === 'a').zIndex, -1, 'a.zIndex must be minZ(0, since min(0,...) caps at 0) - 1');
});

test('sendBack — with no zIndex on any element, treats missing zIndex as 0', () => {
  const { CRS, DS } = load([makeEl('a'), makeEl('b')], ['a']);
  CRS.sendBack();
  assert.equal(DS.elements.find((e) => e.id === 'a').zIndex, -1, 'minZ defaults to 0 when no element has zIndex, so result is -1');
});

test('sendBack — never lowers minZ below 0 before subtracting (Math.min caps at 0)', () => {
  // Math.min(0, ...DS.elements.map(zIndex)) — if all zIndex are positive,
  // minZ is 0, not the smallest positive value.
  const { CRS, DS } = load(
    [makeEl('a', { zIndex: 5 }), makeEl('b', { zIndex: 9 })],
    ['a'],
  );
  CRS.sendBack();
  assert.equal(DS.elements.find((e) => e.id === 'a').zIndex, -1, 'minZ is capped at 0 even when all zIndex are positive, so a.zIndex = 0 - 1');
});

test('sendBack — calls _canonicalCanvasWriter().updateElement() once per element, in stable DS.elements order', () => {
  // Same order-stability proof as bringFront (P22C gap 2) — no .sort().
  const { CRS, calls } = load(
    [makeEl('b', { zIndex: 2 }), makeEl('a', { zIndex: 1 })], // 'b' first in DS.elements
    ['a', 'b'], // 'a' first in DS.selection — deliberately the opposite order
  );
  CRS.sendBack();
  assert.deepEqual(calls.updateElement, ['b', 'a'],
    'call order must follow DS.elements array order (b, a), not selection order (a, b) or sorted order (a, b)');
});

test('sendBack — calls DS.saveHistory() exactly once', () => {
  const { CRS, calls } = load([makeEl('a', { zIndex: 1 })], ['a']);
  CRS.sendBack();
  assert.equal(calls.saveHistory, 1);
});

test('sendBack — is a no-op when nothing is selected', () => {
  const { CRS, calls } = load([makeEl('a', { zIndex: 1 })], []);
  assert.doesNotThrow(() => CRS.sendBack());
  assert.equal(calls.saveHistory, 0);
  assert.equal(calls.updateElement.length, 0);
});

test('DOCUMENTED BYPASS — sendBack never calls DS.updateElementLayout(); it writes e.zIndex directly', () => {
  const { CRS, calls } = load([makeEl('a', { zIndex: 1 }), makeEl('b', { zIndex: 2 })], ['a', 'b']);
  CRS.sendBack();
  assert.equal(calls.updateElementLayout.length, 0,
    'KNOWN BYPASS: sendBack writes e.zIndex directly, never through DS.updateElementLayout() — no write-log attribution');
});

// ── delete / removeSelection ───────────────────────────────────────────────────

test('delete — removes each selected element from DS via DS.setElements with the canonical tag', () => {
  const { CRS, calls } = load([makeEl('a'), makeEl('b'), makeEl('c')], ['b']);
  CRS.delete();
  const last = calls.setElements[calls.setElements.length - 1];
  assert.deepEqual(last.ids.sort(), ['a', 'c'], 'final DS.elements must exclude the removed element');
  for (const call of calls.setElements) {
    assert.equal(call.source, 'CommandRuntimeSelection.removeSelection');
  }
});

test('delete — removes multiple selected elements, one DS.setElements call per id', () => {
  const { CRS, DS, calls } = load([makeEl('a'), makeEl('b'), makeEl('c'), makeEl('d')], ['a', 'c']);
  CRS.delete();
  assert.deepEqual(DS.elements.map((e) => e.id).sort(), ['b', 'd']);
  assert.equal(calls.setElements.length, 2, 'removeSelection calls DS.setElements once per removed id');
});

test('delete — calls DS.saveHistory() exactly once regardless of selection size', () => {
  const { CRS, calls } = load([makeEl('a'), makeEl('b'), makeEl('c')], ['a', 'b']);
  CRS.delete();
  assert.equal(calls.saveHistory, 1);
});

test('delete — calls syncSelectionPanels() exactly once', () => {
  const { CRS, calls } = load([makeEl('a'), makeEl('b')], ['a']);
  CRS.delete();
  assert.equal(calls.syncSelectionPanels, 1);
});

test('delete — clears selection state with the canonical tag after removal', () => {
  const { CRS, calls, DS } = load([makeEl('a'), makeEl('b')], ['a']);
  CRS.delete();
  assert.deepEqual(calls.clearSelectionState, ['CommandRuntimeSelection.removeSelection']);
  assert.deepEqual(DS.selection, []);
});

test('delete — is a no-op when nothing is selected', () => {
  const { CRS, calls } = load([makeEl('a')], []);
  assert.doesNotThrow(() => CRS.delete());
  assert.equal(calls.saveHistory, 0);
  assert.equal(calls.setElements.length, 0);
});

test('FIXED (P25B) — delete cleans up the DOM exclusively via _canonicalCanvasWriter().renderAll(), never document.querySelector()', () => {
  // Before P25B, removeSelection() queried the DOM directly
  // (document.querySelector('.cr-element[data-id="..."]').remove()),
  // bypassing the canonical canvas writer. It now calls
  // _canonicalCanvasWriter().renderAll() — the writer's own full-resync
  // method, which re-derives the DOM from the (already-filtered) DS.elements
  // — instead of touching the DOM itself.
  const { CRS, calls, domCalls } = load([makeEl('a'), makeEl('b')], ['a', 'b']);
  CRS.delete();
  assert.equal(calls.renderAll, 1, 'REQUIRED: removeSelection must call _canonicalCanvasWriter().renderAll() exactly once');
  assert.deepEqual(domCalls.querySelector, [], 'REGRESSION GUARD: removeSelection must never call document.querySelector() directly anymore');
  assert.deepEqual(domCalls.remove, [], 'REGRESSION GUARD: removeSelection must never call .remove() on a DOM node directly anymore');
});

test('FIXED (P25B) — delete calls renderAll() exactly once regardless of how many elements are removed', () => {
  const { CRS, calls } = load([makeEl('a'), makeEl('b'), makeEl('c'), makeEl('d')], ['a', 'c']);
  CRS.delete();
  assert.equal(calls.renderAll, 1, 'a single renderAll() resync covers the whole batch, not one call per removed element');
});

test('delete — a selected id with no matching DS element is still processed without crashing', () => {
  // Selection can desync from the model (e.g. an element removed by another
  // path without clearing DS.selection first). removeSelection() does not
  // check existence before acting on each id.
  const { CRS, calls, domCalls, DS } = load(
    [makeEl('a')],
    ['a', 'ghost-id'], // 'ghost-id' is not in DS.elements at all
  );
  assert.doesNotThrow(() => CRS.delete(), 'a ghost selection id must not crash removeSelection');
  assert.deepEqual(DS.elements.map((e) => e.id), [], 'the real element must still be removed');
  // setElements is called once per id in the selection, including the ghost
  // id (the filter is just a no-op for an id that was never present).
  assert.equal(calls.setElements.length, 2,
    'DS.setElements is called once per selected id, even for an id with no matching element');
  assert.equal(calls.renderAll, 1, 'renderAll() still runs once even when one of the selected ids was a ghost');
  assert.deepEqual(domCalls.querySelector, [], 'removeSelection must not query the DOM directly for the ghost id either');
  assert.equal(calls.saveHistory, 1);
});
