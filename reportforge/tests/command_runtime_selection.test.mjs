'use strict';
/**
 * CL-03 — CommandRuntimeSelection contracts
 * Tests align math, z-order, clipboard offset, group/invert via vm isolation.
 * All tests operate on a mock DS — no DOM, no engine globals required.
 */
import test   from 'node:test';
import assert from 'node:assert/strict';
import fs     from 'node:fs';
import vm     from 'node:vm';
import { resolve, dirname } from 'node:path';
import { fileURLToPath }    from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const src  = fs.readFileSync(resolve(ROOT, 'engines/CommandRuntimeSelection.js'), 'utf8');

// ── helpers ───────────────────────────────────────────────────────────────────

let _uid = 0;
const uid = () => `e${++_uid}`;

function el(x, y, w, h, extra = {}) {
  return { id: uid(), x, y, w, h, zIndex: 0, ...extra };
}

function makeDS(elements, selected = []) {
  const ids = new Set(selected.map(e => e.id));
  const ds = {
    elements: [...elements],
    selection: ids,
    clipboard: [],
    getSelectedElements() { return this.elements.filter(e => ids.has(e.id)); },
    updateElementLayout(id, partial) {
      const found = this.elements.find(e => e.id === id);
      if (found) Object.assign(found, partial);
    },
    addSelection(id)    { ids.add(id); },
    clearSelectionState() { ids.clear(); },
    setElements(els)    { this.elements = [...els]; },
    snap: v => v,
    saveHistory() {},
  };
  return ds;
}

// Load CommandRuntimeSelection once; reset ctx.DS per test.
const ctx = {
  window: {
    CommandRuntimeShared: {
      setStatus:              () => {},
      syncSelectionPanels:    () => {},
      renderSelectionHandles: () => {},
      renderSectionsAndSelection: () => {},
    },
  },
  DS: makeDS([]),
  _canonicalCanvasWriter: () => ({
    updateElementPosition: () => {},
    renderElement:         () => {},
    updateElement:         () => {},
  }),
  newId: uid,
  document: {
    getElementById:   () => null,
    querySelector:    () => null,
    querySelectorAll: () => [],
  },
};

vm.runInNewContext(src, ctx);
const E = ctx.window.CommandRuntimeSelection;

// ── alignLefts ────────────────────────────────────────────────────────────────

test('alignLefts — all x set to minimum x of selection', () => {
  const a = el(20, 0, 10, 10);
  const b = el( 5, 0, 10, 10);
  const c = el(15, 0, 10, 10);
  ctx.DS = makeDS([a, b, c], [a, b, c]);
  E.alignLefts();
  assert.equal(a.x, 5);
  assert.equal(b.x, 5);
  assert.equal(c.x, 5);
});

test('alignLefts — no-op when fewer than 2 selected', () => {
  const a = el(20, 0, 10, 10);
  ctx.DS = makeDS([a], [a]);
  E.alignLefts();
  assert.equal(a.x, 20);  // unchanged
});

// ── alignRights ───────────────────────────────────────────────────────────────

test('alignRights — all right edges aligned to maximum right', () => {
  const a = el(0,  0, 20, 10);   // right = 20
  const b = el(30, 0,  5, 10);   // right = 35
  ctx.DS = makeDS([a, b], [a, b]);
  E.alignRights();
  assert.equal(a.x, 15);   // 35 - 20
  assert.equal(b.x, 30);   // 35 - 5
});

// ── alignCenters ─────────────────────────────────────────────────────────────

test('alignCenters — horizontal centers averaged', () => {
  const a = el( 0, 0, 10, 10);  // center = 5
  const b = el(10, 0, 10, 10);  // center = 15
  ctx.DS = makeDS([a, b], [a, b]);
  E.alignCenters();             // avg center = 10; each x = 10 - 5 = 5
  assert.equal(a.x, 5);
  assert.equal(b.x, 5);
});

// ── alignTops / alignBottoms / alignMiddles ───────────────────────────────────

test('alignTops — all y set to minimum y of selection', () => {
  const a = el(0, 20, 10, 10);
  const b = el(0,  5, 10, 10);
  ctx.DS = makeDS([a, b], [a, b]);
  E.alignTops();
  assert.equal(a.y, 5);
  assert.equal(b.y, 5);
});

test('alignBottoms — all bottom edges aligned to maximum bottom', () => {
  const a = el(0, 0,  10, 20);  // bottom = 20
  const b = el(0, 10, 10,  5);  // bottom = 15
  ctx.DS = makeDS([a, b], [a, b]);
  E.alignBottoms();
  assert.equal(a.y, 0);   // 20 - 20
  assert.equal(b.y, 15);  // 20 - 5
});

test('alignMiddles — vertical centers averaged', () => {
  const a = el(0,  0, 10, 10);  // mid = 5
  const b = el(0, 10, 10, 10);  // mid = 15
  ctx.DS = makeDS([a, b], [a, b]);
  E.alignMiddles();             // avg mid = 10; each y = 10 - 5 = 5
  assert.equal(a.y, 5);
  assert.equal(b.y, 5);
});

// ── sameWidth / sameHeight ────────────────────────────────────────────────────

test('sameWidth — non-reference elements adopt reference width', () => {
  const a = el(0, 0, 100, 10);  // ref
  const b = el(0, 0,  50, 10);
  const c = el(0, 0,  30, 10);
  ctx.DS = makeDS([a, b, c], [a, b, c]);
  E.sameWidth();
  assert.equal(a.w, 100);  // ref unchanged
  assert.equal(b.w, 100);
  assert.equal(c.w, 100);
});

test('sameHeight — non-reference elements adopt reference height', () => {
  const a = el(0, 0, 10, 80);  // ref
  const b = el(0, 0, 10, 20);
  ctx.DS = makeDS([a, b], [a, b]);
  E.sameHeight();
  assert.equal(a.h, 80);  // ref unchanged
  assert.equal(b.h, 80);
});

// ── z-order ───────────────────────────────────────────────────────────────────

test('bringFront — selected zIndex becomes maxZ + 1 across all elements', () => {
  const a = el(0, 0, 10, 10, { zIndex: 2 });
  const b = el(0, 0, 10, 10, { zIndex: 5 });
  const c = el(0, 0, 10, 10, { zIndex: 1 });
  ctx.DS = makeDS([a, b, c], [a]);  // select a, b and c are unselected
  E.bringFront();
  // maxZ = max(0,2,5,1) = 5 → a.zIndex = 6
  assert.equal(a.zIndex, 6);
  assert.equal(b.zIndex, 5);  // unchanged
});

test('sendBack — selected zIndex becomes minZ - 1 across all elements', () => {
  const a = el(0, 0, 10, 10, { zIndex: 3 });
  const b = el(0, 0, 10, 10, { zIndex: 1 });
  ctx.DS = makeDS([a, b], [a]);
  E.sendBack();
  // minZ = min(0, 3, 1) = 0 → a.zIndex = -1
  assert.equal(a.zIndex, -1);
  assert.equal(b.zIndex, 1);  // unchanged
});

test('bringForward — selected zIndex incremented by 1', () => {
  const a = el(0, 0, 10, 10, { zIndex: 3 });
  ctx.DS = makeDS([a], [a]);
  E.bringForward();
  assert.equal(a.zIndex, 4);
});

test('sendBackward — selected zIndex decremented by 1', () => {
  const a = el(0, 0, 10, 10, { zIndex: 3 });
  ctx.DS = makeDS([a], [a]);
  E.sendBackward();
  assert.equal(a.zIndex, 2);
});

// ── group / ungroup ───────────────────────────────────────────────────────────

test('group — selected elements receive same groupId', () => {
  const a = el(0, 0, 10, 10);
  const b = el(0, 0, 10, 10);
  ctx.DS = makeDS([a, b], [a, b]);
  E.group();
  assert.ok(typeof a.groupId === 'string' && a.groupId.length > 0);
  assert.equal(a.groupId, b.groupId);
});

test('ungroup — groupId removed from selected elements', () => {
  const a = el(0, 0, 10, 10, { groupId: 'g1' });
  const b = el(0, 0, 10, 10, { groupId: 'g1' });
  ctx.DS = makeDS([a, b], [a, b]);
  E.ungroup();
  assert.equal(a.groupId, undefined);
  assert.equal(b.groupId, undefined);
});

// ── selectAll / invertSelection ───────────────────────────────────────────────

test('selectAll — all element IDs added to selection', () => {
  const a = el(0, 0, 10, 10);
  const b = el(0, 0, 10, 10);
  const c = el(0, 0, 10, 10);
  ctx.DS = makeDS([a, b, c], []);
  E.selectAll();
  assert.ok(ctx.DS.selection.has(a.id));
  assert.ok(ctx.DS.selection.has(b.id));
  assert.ok(ctx.DS.selection.has(c.id));
});

test('invertSelection — selected becomes complement of current selection', () => {
  const a = el(0, 0, 10, 10);
  const b = el(0, 0, 10, 10);
  const c = el(0, 0, 10, 10);
  ctx.DS = makeDS([a, b, c], [b]);  // b selected → invert → a,c selected
  E.invertSelection();
  assert.ok(ctx.DS.selection.has(a.id));
  assert.ok(!ctx.DS.selection.has(b.id));
  assert.ok(ctx.DS.selection.has(c.id));
});

// ── copy / paste offset ───────────────────────────────────────────────────────

test('copy — clipboard gets JSON of selected elements', () => {
  const a = el(10, 20, 50, 30);
  ctx.DS = makeDS([a], [a]);
  E.copy();
  assert.equal(ctx.DS.clipboard.length, 1);
  const parsed = JSON.parse(ctx.DS.clipboard[0]);
  assert.equal(parsed.x, 10);
  assert.equal(parsed.y, 20);
});

test('copy — empty selection is a no-op', () => {
  const a = el(10, 20, 50, 30);
  ctx.DS = makeDS([a], []);
  ctx.DS.clipboard = [];
  E.copy();
  assert.equal(ctx.DS.clipboard.length, 0);
});

test('paste — new elements offset +8/+8 from original position', () => {
  const a = el(10, 20, 50, 30);
  ctx.DS = makeDS([a], []);
  ctx.DS.clipboard = [JSON.stringify({ ...a, id: 'orig' })];
  E.paste();
  assert.equal(ctx.DS.elements.length, 2);
  const pasted = ctx.DS.elements[1];
  assert.equal(pasted.x, 10 + 8);
  assert.equal(pasted.y, 20 + 8);
});

test('paste — pasted element gets new id distinct from original', () => {
  const a = el(10, 20, 50, 30);
  ctx.DS = makeDS([a], []);
  ctx.DS.clipboard = [JSON.stringify({ ...a, id: 'orig-id' })];
  E.paste();
  const pasted = ctx.DS.elements[1];
  assert.notEqual(pasted.id, 'orig-id');
});
