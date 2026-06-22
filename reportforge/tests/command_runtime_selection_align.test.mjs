'use strict';
/**
 * command_runtime_selection_align.test.mjs — CommandRuntimeSelection align contracts
 *
 * engines/CommandRuntimeSelection.js::alignLefts/alignCenters/alignRights/
 * alignTops/alignBottoms/alignMiddles is the REAL, live alignment logic the
 * toolbar invokes — confirmed in P21A by tracing the full chain:
 *
 *   toolbar data-action="align-lefts"
 *     → CommandRuntimeHandlersSelectionDispatch.js: 'align-lefts': () => CommandEngine.alignLefts()
 *     → CommandEngine (= CommandRuntimeSelection merged via CommandRuntime.js)
 *     → CommandRuntimeSelection.alignLefts()   ← here
 *
 * engines/AlignmentEngine.js's align()/distribute() (a different file) have
 * ZERO callers anywhere and are NOT reachable from any toolbar action — they
 * were deliberately NOT touched or tested here (out of scope, see P21A).
 *
 * CommandRuntimeSelection.js references DS / _canonicalCanvasWriter as bare
 * globals (no typeof guard) and reads global.CommandRuntimeShared — loaded
 * here via vm with all three stubbed, no DOM required.
 *
 * Coverage:
 *   1. alignLefts/alignRights/alignTops/alignBottoms — min/max edge alignment.
 *   2. alignCenters/alignMiddles — average-center alignment.
 *   3. Single-element selection is a no-op (alignment requires >= 2).
 *   4. Each action calls DS.saveHistory() exactly once and syncs panels.
 *   5. Each moved element gets a canvas position update via _canonicalCanvasWriter().
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = fs.readFileSync(resolve(ROOT, 'engines/CommandRuntimeSelection.js'), 'utf8');

function makeEl(id, x, y, w, h) {
  return { id, x, y, w, h };
}

function load(elements, { snap } = {}) {
  const calls = {
    updateElementLayout: [],
    updateElementPosition: [],
    saveHistory: 0,
    syncSelectionPanels: 0,
  };
  const DS = {
    getSelectedElements() { return elements; },
    updateElementLayout(id, partial, source) {
      const el = elements.find((e) => e.id === id);
      if (el) Object.assign(el, partial);
      calls.updateElementLayout.push({ id, partial, source });
    },
    saveHistory() { calls.saveHistory++; },
    // Default: passthrough. Tests exercising real snap pass their own fn.
    snap: snap || ((v) => v),
  };
  const _canonicalCanvasWriter = () => ({
    updateElementPosition(id) { calls.updateElementPosition.push(id); },
  });
  const window = {
    CommandRuntimeShared: {
      setStatus() {},
      syncSelectionPanels() { calls.syncSelectionPanels++; },
      renderSelectionHandles() {},
    },
  };
  const ctx = { window, DS, _canonicalCanvasWriter, console };
  vm.runInNewContext(SRC, ctx);
  return { CRS: ctx.window.CommandRuntimeSelection, elements, calls };
}

// ── alignLefts ────────────────────────────────────────────────────────────────

test('alignLefts — moves all selected elements to the minimum x', () => {
  const { CRS, elements } = load([makeEl('a', 10, 0, 20, 20), makeEl('b', 50, 0, 20, 20)]);
  CRS.alignLefts();
  assert.equal(elements[0].x, 10);
  assert.equal(elements[1].x, 10);
});

test('alignLefts — does not touch y/w/h', () => {
  const { CRS, elements } = load([makeEl('a', 10, 5, 20, 30), makeEl('b', 50, 9, 20, 30)]);
  CRS.alignLefts();
  assert.equal(elements[0].y, 5);
  assert.equal(elements[1].y, 9);
  assert.equal(elements[1].w, 20);
  assert.equal(elements[1].h, 30);
});

// ── alignRights ───────────────────────────────────────────────────────────────

test('alignRights — moves all selected elements so their right edge matches the maximum', () => {
  const { CRS, elements } = load([makeEl('a', 0, 0, 20, 20), makeEl('b', 50, 0, 10, 20)]);
  CRS.alignRights();
  // max right edge = max(0+20, 50+10) = 60
  assert.equal(elements[0].x, 40); // 60 - 20
  assert.equal(elements[1].x, 50); // 60 - 10 (already there)
});

// ── alignTops ─────────────────────────────────────────────────────────────────

test('alignTops — moves all selected elements to the minimum y', () => {
  const { CRS, elements } = load([makeEl('a', 0, 30, 20, 20), makeEl('b', 0, 5, 20, 20)]);
  CRS.alignTops();
  assert.equal(elements[0].y, 5);
  assert.equal(elements[1].y, 5);
});

// ── alignBottoms ──────────────────────────────────────────────────────────────

test('alignBottoms — moves all selected elements so their bottom edge matches the maximum', () => {
  const { CRS, elements } = load([makeEl('a', 0, 0, 20, 20), makeEl('b', 0, 50, 20, 10)]);
  CRS.alignBottoms();
  // max bottom edge = max(0+20, 50+10) = 60
  assert.equal(elements[0].y, 40); // 60 - 20
  assert.equal(elements[1].y, 50); // 60 - 10 (already there)
});

// ── alignCenters (horizontal center, x-axis) ──────────────────────────────────

test('alignCenters — moves elements so their horizontal centers align to the average', () => {
  const { CRS, elements } = load([makeEl('a', 0, 0, 20, 0), makeEl('b', 100, 0, 20, 0)]);
  // centers: a.x+a.w/2=10, b.x+b.w/2=110 -> avg=60
  CRS.alignCenters();
  assert.equal(elements[0].x, 50); // 60 - 20/2
  assert.equal(elements[1].x, 50); // 60 - 20/2
});

// ── alignMiddles (vertical center, y-axis) ────────────────────────────────────

test('alignMiddles — moves elements so their vertical centers align to the average', () => {
  const { CRS, elements } = load([makeEl('a', 0, 0, 0, 20), makeEl('b', 0, 100, 0, 20)]);
  // middles: a.y+a.h/2=10, b.y+b.h/2=110 -> avg=60
  CRS.alignMiddles();
  assert.equal(elements[0].y, 50); // 60 - 20/2
  assert.equal(elements[1].y, 50); // 60 - 20/2
});

// ── single-element selection is a no-op for all 6 actions ────────────────────

test('all 6 align actions are a no-op when fewer than 2 elements are selected', () => {
  const actions = ['alignLefts', 'alignCenters', 'alignRights', 'alignTops', 'alignBottoms', 'alignMiddles'];
  for (const action of actions) {
    const { CRS, elements, calls } = load([makeEl('solo', 7, 7, 5, 5)]);
    CRS[action]();
    assert.deepEqual(elements[0], makeEl('solo', 7, 7, 5, 5), `${action} must not move a lone selected element`);
    assert.equal(calls.saveHistory, 0, `${action} must not save history when it's a no-op`);
  }
});

test('all 6 align actions are a no-op when nothing is selected', () => {
  const actions = ['alignLefts', 'alignCenters', 'alignRights', 'alignTops', 'alignBottoms', 'alignMiddles'];
  for (const action of actions) {
    const { CRS, calls } = load([]);
    assert.doesNotThrow(() => CRS[action](), `${action} must not throw with an empty selection`);
    assert.equal(calls.saveHistory, 0);
  }
});

// ── side effects: saveHistory, syncSelectionPanels, canvas position update ───

test('each align action calls DS.saveHistory() exactly once when it actually moves elements', () => {
  const actions = ['alignLefts', 'alignCenters', 'alignRights', 'alignTops', 'alignBottoms', 'alignMiddles'];
  for (const action of actions) {
    const { CRS, calls } = load([makeEl('a', 0, 0, 20, 20), makeEl('b', 30, 30, 20, 20)]);
    CRS[action]();
    assert.equal(calls.saveHistory, 1, `${action} must call DS.saveHistory() exactly once`);
  }
});

test('each align action syncs selection panels exactly once', () => {
  const actions = ['alignLefts', 'alignCenters', 'alignRights', 'alignTops', 'alignBottoms', 'alignMiddles'];
  for (const action of actions) {
    const { CRS, calls } = load([makeEl('a', 0, 0, 20, 20), makeEl('b', 30, 30, 20, 20)]);
    CRS[action]();
    assert.equal(calls.syncSelectionPanels, 1, `${action} must call syncSelectionPanels() exactly once`);
  }
});

test('each align action updates canvas position exactly once per element, in stable selection order', () => {
  // No .sort() here on purpose (P21C gap 4) — order must match
  // DS.getSelectedElements()'s own order, since updateSelectedLayouts()
  // drives a plain forEach over it with no reordering step.
  const actions = ['alignLefts', 'alignCenters', 'alignRights', 'alignTops', 'alignBottoms', 'alignMiddles'];
  for (const action of actions) {
    const { CRS, calls } = load([makeEl('b', 30, 30, 20, 20), makeEl('a', 0, 0, 20, 20)]); // 'b' first on purpose
    CRS[action]();
    assert.deepEqual(calls.updateElementPosition, ['b', 'a'],
      `${action} must call updateElementPosition exactly once per element, in selection order ('b' before 'a')`);
  }
});

test('each align action routes mutations through DS.updateElementLayout with a CommandRuntimeSelection source tag', () => {
  const actions = ['alignLefts', 'alignCenters', 'alignRights', 'alignTops', 'alignBottoms', 'alignMiddles'];
  for (const action of actions) {
    const { CRS, calls } = load([makeEl('a', 0, 0, 20, 20), makeEl('b', 30, 30, 20, 20)]);
    CRS[action]();
    assert.ok(calls.updateElementLayout.length > 0, `${action} must mutate via DS.updateElementLayout, not directly`);
    for (const call of calls.updateElementLayout) {
      assert.equal(call.source, 'CommandRuntimeSelection.updateLayout');
    }
  }
});

// ── P21C gap 1: 3+ elements, max/min edge belongs to a MIDDLE element ────────
//
// With only 2 elements (P21B), Math.max/min over the array can't distinguish
// "picks the correct edge" from "picks first/last element by accident" — a
// bug that special-cased array boundaries would still pass those tests.

test('alignRights — with 3 elements, the maximum right edge belongs to the middle element', () => {
  // a: x=0,w=10 -> right=10 | b: x=5,w=50 -> right=55 (max, middle index) | c: x=20,w=10 -> right=30
  const { CRS, elements } = load([
    makeEl('a', 0, 0, 10, 20),
    makeEl('b', 5, 0, 50, 20),
    makeEl('c', 20, 0, 10, 20),
  ]);
  CRS.alignRights();
  assert.equal(elements[0].x, 45, 'a.x = maxRight(55) - a.w(10)');
  assert.equal(elements[1].x, 5, 'b already at the max right edge — unchanged');
  assert.equal(elements[2].x, 45, 'c.x = maxRight(55) - c.w(10)');
});

test('alignBottoms — with 3 elements, the maximum bottom edge belongs to the middle element', () => {
  // a: y=0,h=10 -> bottom=10 | b: y=5,h=50 -> bottom=55 (max, middle index) | c: y=20,h=10 -> bottom=30
  const { CRS, elements } = load([
    makeEl('a', 0, 0, 20, 10),
    makeEl('b', 0, 5, 20, 50),
    makeEl('c', 0, 20, 20, 10),
  ]);
  CRS.alignBottoms();
  assert.equal(elements[0].y, 45, 'a.y = maxBottom(55) - a.h(10)');
  assert.equal(elements[1].y, 5, 'b already at the max bottom edge — unchanged');
  assert.equal(elements[2].y, 45, 'c.y = maxBottom(55) - c.h(10)');
});

test('alignLefts — with 3 elements, the minimum left edge belongs to the middle element', () => {
  const { CRS, elements } = load([
    makeEl('a', 30, 0, 10, 10),
    makeEl('b', 2, 0, 10, 10),   // min x, middle index
    makeEl('c', 50, 0, 10, 10),
  ]);
  CRS.alignLefts();
  assert.equal(elements[0].x, 2);
  assert.equal(elements[1].x, 2);
  assert.equal(elements[2].x, 2);
});

test('alignTops — with 3 elements, the minimum top edge belongs to the middle element', () => {
  const { CRS, elements } = load([
    makeEl('a', 0, 30, 10, 10),
    makeEl('b', 0, 2, 10, 10),   // min y, middle index
    makeEl('c', 0, 50, 10, 10),
  ]);
  CRS.alignTops();
  assert.equal(elements[0].y, 2);
  assert.equal(elements[1].y, 2);
  assert.equal(elements[2].y, 2);
});

// ── P21C gap 2: alignCenters/alignMiddles with a real (non-passthrough) snap ─
//
// P21B's snap stub was `(v) => v` — a no-op that can't distinguish "the
// computed center is snapped" from "snap is never called at all". These use
// snap-to-nearest-10 and pick inputs whose raw (pre-snap) center is NOT
// already a multiple of 10, so a passthrough stub would produce the wrong,
// detectably different number.

function snapToTen(v) { return Math.round(v / 10) * 10; }

test('alignCenters — applies DS.snap to the computed center, not the raw average', () => {
  // centers: a=0+20/2=10, b=33+40/2=53 -> avg=31.5 (not a multiple of 10)
  const { CRS, elements } = load(
    [makeEl('a', 0, 0, 20, 0), makeEl('b', 33, 0, 40, 0)],
    { snap: snapToTen },
  );
  CRS.alignCenters();
  // raw (unsnapped) would be a.x=21.5, b.x=11.5 — snapped must differ from that
  assert.equal(elements[0].x, 20, 'a.x must be the snapped value, not raw 21.5');
  assert.equal(elements[1].x, 10, 'b.x must be the snapped value, not raw 11.5');
});

test('alignMiddles — applies DS.snap to the computed middle, not the raw average', () => {
  // middles: a=0+20/2=10, b=33+40/2=53 -> avg=31.5 (not a multiple of 10)
  const { CRS, elements } = load(
    [makeEl('a', 0, 0, 0, 20), makeEl('b', 0, 33, 0, 40)],
    { snap: snapToTen },
  );
  CRS.alignMiddles();
  assert.equal(elements[0].y, 20, 'a.y must be the snapped value, not raw 21.5');
  assert.equal(elements[1].y, 10, 'b.y must be the snapped value, not raw 11.5');
});

test('alignLefts/alignTops/alignRights/alignBottoms never call DS.snap at all', () => {
  // Only the average-center modes (centers/middles) snap; the four edge
  // modes assign Math.min/max results directly. A snap stub that throws
  // proves these 4 actions never touch it.
  const throwingSnap = () => { throw new Error('DS.snap must not be called by edge-aligned modes'); };
  for (const action of ['alignLefts', 'alignTops', 'alignRights', 'alignBottoms']) {
    const { CRS } = load(
      [makeEl('a', 0, 0, 20, 20), makeEl('b', 30, 30, 20, 20)],
      { snap: throwingSnap },
    );
    assert.doesNotThrow(() => CRS[action](), `${action} must not call DS.snap()`);
  }
});

// ── P21C gap 3: the selection array is never reordered or structurally mutated ─

test('align actions never reorder, add, or remove entries in the selection array', () => {
  const actions = ['alignLefts', 'alignCenters', 'alignRights', 'alignTops', 'alignBottoms', 'alignMiddles'];
  for (const action of actions) {
    const original = [makeEl('z', 9, 9, 20, 20), makeEl('m', 1, 1, 20, 20), makeEl('a', 40, 40, 20, 20)];
    const { CRS, elements } = load(original);
    const idsBefore = elements.map((e) => e.id);
    const refsBefore = elements.slice(); // shallow copy of references, not values

    CRS[action]();

    assert.deepEqual(elements.map((e) => e.id), idsBefore,
      `${action} must not reorder the selection array (order: z, m, a must be preserved)`);
    assert.equal(elements.length, refsBefore.length,
      `${action} must not add or remove entries from the selection array`);
    for (let i = 0; i < elements.length; i++) {
      assert.strictEqual(elements[i], refsBefore[i],
        `${action} must mutate elements in place, not replace them with new objects (index ${i})`);
    }
  }
});
