'use strict';
/**
 * SS-23 — AlignmentGeometry contracts
 * Covers: THRESHOLD constant, _bounds (no-DS / with-DS), compute (no-DS early
 * return / page edges / element edges / deduplication), computeSpacing
 * (no-DS / equal spacing / unequal spacing / single element).
 * All tests use require() — no vm, no DOM nodes required.
 * DS and CFG are injected/removed via globalThis for full-path coverage.
 */
import test   from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const AG = require('../../engines/AlignmentGeometry.js');

// ── helpers ───────────────────────────────────────────────────────────────────

function makeEl(id, x, y, w, h, sectionId = 's1') {
  return { id, x, y, w, h, sectionId };
}

function withDS(elements, sectionTopFn, fn) {
  globalThis.DS = {
    elements,
    getSectionTop: sectionTopFn || (() => 0),
  };
  try { return fn(); }
  finally { delete globalThis.DS; }
}

function withDSAndCFG(elements, pageW, sectionTopFn, fn) {
  globalThis.DS  = { elements, getSectionTop: sectionTopFn || (() => 0) };
  globalThis.CFG = { PAGE_W: pageW };
  try { return fn(); }
  finally { delete globalThis.DS; delete globalThis.CFG; }
}

// ── THRESHOLD ─────────────────────────────────────────────────────────────────

test('THRESHOLD — is exported and equals 4', () => {
  assert.equal(AG.THRESHOLD, 4);
});

// ── _bounds — no DS ───────────────────────────────────────────────────────────

test('_bounds — without DS: secTop=0, y equals el.y', () => {
  const b = AG._bounds(makeEl('a', 10, 20, 30, 40));
  assert.equal(b.y, 20);
  assert.equal(b.x, 10);
});

test('_bounds — without DS: x2 = x + w', () => {
  const b = AG._bounds(makeEl('a', 10, 20, 30, 40));
  assert.equal(b.x2, 40);
});

test('_bounds — without DS: y2 = y + h', () => {
  const b = AG._bounds(makeEl('a', 10, 20, 30, 40));
  assert.equal(b.y2, 60);
});

test('_bounds — without DS: cx = x + w/2', () => {
  const b = AG._bounds(makeEl('a', 10, 20, 30, 40));
  assert.equal(b.cx, 25);
});

test('_bounds — without DS: cy = y + h/2', () => {
  const b = AG._bounds(makeEl('a', 10, 20, 30, 40));
  assert.equal(b.cy, 40);
});

test('_bounds — without DS: w and h pass through', () => {
  const b = AG._bounds(makeEl('a', 10, 20, 30, 40));
  assert.equal(b.w, 30);
  assert.equal(b.h, 40);
});

// ── _bounds — with DS ─────────────────────────────────────────────────────────

test('_bounds — with DS: secTop added to y', () => {
  const b = withDS([], () => 100, () => AG._bounds(makeEl('a', 10, 20, 30, 40, 's1')));
  assert.equal(b.y,  120);   // 100 + 20
  assert.equal(b.y2, 160);   // 100 + 20 + 40
  assert.equal(b.cy, 140);   // 100 + 20 + 20
});

test('_bounds — with DS: x values unaffected by secTop', () => {
  const b = withDS([], () => 50, () => AG._bounds(makeEl('a', 10, 20, 30, 40)));
  assert.equal(b.x,  10);
  assert.equal(b.x2, 40);
  assert.equal(b.cx, 25);
});

test('_bounds — with DS secTop=0: same as no-DS result', () => {
  const el = makeEl('a', 5, 15, 20, 10);
  const noDS = AG._bounds(el);
  const withDSResult = withDS([], () => 0, () => AG._bounds(el));
  assert.deepEqual(noDS, withDSResult);
});

// ── compute — no DS ───────────────────────────────────────────────────────────

test('compute — without DS: returns early with empty guides', () => {
  const result = AG.compute(makeEl('m', 0, 0, 10, 10));
  assert.deepEqual(result, { guides: [], snapX: null, snapY: null });
});

test('compute — without DS: snapX and snapY are null', () => {
  const result = AG.compute(makeEl('m', 100, 100, 50, 50));
  assert.equal(result.snapX, null);
  assert.equal(result.snapY, null);
});

// ── compute — page edges ──────────────────────────────────────────────────────

test('compute — element x within threshold of page left (0) → guide added', () => {
  // el.x=2, mb.x=2, pos=0, d=2 ≤ 4 → guide {axis:'x', modelPos:0}
  const el = makeEl('m', 2, 50, 20, 20);
  const result = withDSAndCFG([], 800, null, () => AG.compute(el));
  const xGuide = result.guides.find(g => g.axis === 'x' && g.modelPos === 0);
  assert.ok(xGuide, 'expected page-left guide');
  assert.equal(xGuide.type, 'edge');
});

test('compute — element x beyond threshold from page left → no guide', () => {
  // el.x=10, d=10 > 4 → no guide at modelPos=0
  const el = makeEl('m', 10, 50, 20, 20);
  const result = withDSAndCFG([], 800, null, () => AG.compute(el));
  const xGuide = result.guides.find(g => g.axis === 'x' && g.modelPos === 0);
  assert.equal(xGuide, undefined);
});

test('compute — element x2 within threshold of page right → guide added', () => {
  // el.x=778, el.w=20 → x2=798, pos=800, d=2 ≤ 4 → guide {axis:'x', modelPos:800}
  const el = makeEl('m', 778, 50, 20, 20);
  const result = withDSAndCFG([], 800, null, () => AG.compute(el));
  const xGuide = result.guides.find(g => g.axis === 'x' && g.modelPos === 800);
  assert.ok(xGuide, 'expected page-right guide');
});

test('compute — element cx within threshold of page center → guide added', () => {
  // PAGE_W=800, center=400. el.x=388, el.w=20 → cx=398, d=|398-400|=2 ≤ 4
  const el = makeEl('m', 388, 50, 20, 20);
  const result = withDSAndCFG([], 800, null, () => AG.compute(el));
  const xGuide = result.guides.find(g => g.axis === 'x' && g.modelPos === 400);
  assert.ok(xGuide, 'expected page-center guide');
});

test('compute — page-left snap: snapX corrected to align left edge to 0', () => {
  // el.x=3, d=3 ≤ 4 → snapX = 0 - (3 - 3) = 0
  const el = makeEl('m', 3, 50, 20, 20);
  const result = withDSAndCFG([], 800, null, () => AG.compute(el));
  assert.equal(result.snapX, 0);
});

// ── compute — element edges ───────────────────────────────────────────────────

test('compute — moving el x aligns with other el x → guide added', () => {
  // moving: x=50, other: x=52 → d=|50-52|=2 ≤ 4
  const moving = makeEl('m', 50, 100, 20, 20);
  const other  = makeEl('o', 52, 200, 20, 20);
  const result = withDSAndCFG([moving, other], 800, null, () => AG.compute(moving));
  const g = result.guides.find(g => g.axis === 'x' && g.modelPos === 52);
  assert.ok(g, 'expected x-alignment guide');
});

test('compute — moving el y aligns with other el y → guide added', () => {
  // moving: y=100, other: y=103 → d=3 ≤ 4
  const moving = makeEl('m', 10,  100, 20, 20);
  const other  = makeEl('o', 200, 103, 20, 20);
  const result = withDSAndCFG([moving, other], 800, null, () => AG.compute(moving));
  const g = result.guides.find(g => g.axis === 'y' && g.modelPos === 103);
  assert.ok(g, 'expected y-alignment guide');
});

test('compute — moving el excluded from comparing to itself', () => {
  const moving = makeEl('m', 50, 50, 20, 20);
  // Only element is the mover itself — should produce no element-based guides
  const result = withDSAndCFG([moving], 800, null, () => AG.compute(moving));
  // No guides from element comparison (only potential page-edge guides)
  const elemGuides = result.guides.filter(g => g.modelPos === 50);
  assert.equal(elemGuides.length, 0);
});

test('compute — no elements near threshold: guides array is empty', () => {
  const moving = makeEl('m', 400, 300, 20, 20);
  const other  = makeEl('o', 100, 100, 20, 20);  // far away
  const result = withDSAndCFG([moving, other], 800, null, () => AG.compute(moving));
  assert.equal(result.guides.length, 0);
  assert.equal(result.snapX, null);
  assert.equal(result.snapY, null);
});

// ── compute — deduplication ───────────────────────────────────────────────────

test('compute — duplicate guide axis:modelPos pairs are deduplicated', () => {
  // Two elements both at x=50 → two candidates for x:50 → deduplicated to one
  const moving = makeEl('m', 50, 400, 20, 20);
  const el1    = makeEl('a', 52, 100, 20, 20);  // x=52, d=2
  const el2    = makeEl('b', 52, 200, 20, 20);  // x=52, d=2 — same modelPos
  const result = withDSAndCFG([moving, el1, el2], 800, null, () => AG.compute(moving));
  const at52 = result.guides.filter(g => g.axis === 'x' && g.modelPos === 52);
  assert.equal(at52.length, 1);
});

// ── compute — custom threshold ────────────────────────────────────────────────

test('compute — custom threshold 1: only elements within 1 unit snap', () => {
  const moving = makeEl('m', 50, 100, 20, 20);
  const near   = makeEl('n', 51, 200, 20, 20);  // d=1 ≤ 1 → guide
  const far    = makeEl('f', 53, 200, 20, 20);  // d=3 > 1 → no guide
  const result = withDSAndCFG([moving, near, far], 800, null, () => AG.compute(moving, 1));
  const atNear = result.guides.find(g => g.axis === 'x' && g.modelPos === 51);
  const atFar  = result.guides.find(g => g.axis === 'x' && g.modelPos === 53);
  assert.ok(atNear, 'near element should produce guide');
  assert.equal(atFar, undefined, 'far element should not produce guide');
});

// ── computeSpacing — no DS ────────────────────────────────────────────────────

test('computeSpacing — without DS: returns early with empty guides', () => {
  const result = AG.computeSpacing(makeEl('m', 100, 100, 20, 20));
  assert.deepEqual(result, { guides: [], snapX: null, snapY: null });
});

// ── computeSpacing — equal spacing ───────────────────────────────────────────

test('computeSpacing — equal gaps: two spacing guides returned', () => {
  // left=[0..20], moving=[30..50], right=[60..80]
  // gapL = 30-20=10, gapR = 60-50=10, |10-10|=0 ≤ 8(=THRESHOLD*2)
  const moving = makeEl('m', 30, 100, 20, 20);
  const left   = makeEl('l',  0, 100, 20, 20);
  const right  = makeEl('r', 60, 100, 20, 20);
  const result = withDSAndCFG([moving, left, right], 800, null,
    () => AG.computeSpacing(moving));
  assert.equal(result.guides.length, 2);
  assert.equal(result.guides[0].type, 'spacing');
  assert.equal(result.guides[1].type, 'spacing');
});

test('computeSpacing — equal gaps: guide positions are left.x2 and right.x', () => {
  const moving = makeEl('m', 30, 100, 20, 20);
  const left   = makeEl('l',  0, 100, 20, 20);  // x2=20
  const right  = makeEl('r', 60, 100, 20, 20);  // x=60
  const result = withDSAndCFG([moving, left, right], 800, null,
    () => AG.computeSpacing(moving));
  const positions = result.guides.map(g => g.modelPos).sort((a,b)=>a-b);
  assert.deepEqual(positions, [20, 60]);
});

test('computeSpacing — unequal gaps: no guides returned', () => {
  // left=[0..20], moving=[30..50], right=[80..100]
  // gapL=10, gapR=30, |10-30|=20 > 8 → no guides
  const moving = makeEl('m', 30, 100, 20, 20);
  const left   = makeEl('l',  0, 100, 20, 20);
  const right  = makeEl('r', 80, 100, 20, 20);
  const result = withDSAndCFG([moving, left, right], 800, null,
    () => AG.computeSpacing(moving));
  assert.equal(result.guides.length, 0);
});

test('computeSpacing — single other element: no guides (need pair)', () => {
  const moving = makeEl('m', 30, 100, 20, 20);
  const only   = makeEl('o',  0, 100, 20, 20);
  const result = withDSAndCFG([moving, only], 800, null,
    () => AG.computeSpacing(moving));
  assert.equal(result.guides.length, 0);
});

test('computeSpacing — no other elements: no guides', () => {
  const moving = makeEl('m', 30, 100, 20, 20);
  const result = withDSAndCFG([moving], 800, null,
    () => AG.computeSpacing(moving));
  assert.equal(result.guides.length, 0);
});

test('computeSpacing — guide axis is x', () => {
  const moving = makeEl('m', 30, 100, 20, 20);
  const left   = makeEl('l',  0, 100, 20, 20);
  const right  = makeEl('r', 60, 100, 20, 20);
  const result = withDSAndCFG([moving, left, right], 800, null,
    () => AG.computeSpacing(moving));
  assert.ok(result.guides.every(g => g.axis === 'x'));
});
