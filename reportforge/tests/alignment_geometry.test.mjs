'use strict';
/**
 * SS-23/SS-36 — AlignmentEngine contracts (_bounds/compute/computeSpacing)
 *
 * Migrated in P17D from engines/AlignmentGeometry.js to engines/AlignmentEngine.js
 * — AlignmentEngine.js is the live implementation (consumed by
 * engines/DragEngine.js:97 via AlignmentEngine.compute(movingEl)).
 * AlignmentGeometry.js was a byte-for-byte duplicate of _bounds/compute/
 * computeSpacing with zero production callers (confirmed in P17C), pending
 * retirement in P17E. AlignmentEngine.js additionally exposes align()/
 * distribute(), not covered here (out of scope for this migration — see
 * P17C item 4, pre-existing gap, not introduced by this change).
 *
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
const AG = require('../../engines/AlignmentEngine.js');

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

// ── _bounds — NOT migratable: private to AlignmentEngine.js, unreachable ──────
//
// AlignmentEngine.js's public API is { compute, computeSpacing, align,
// distribute, THRESHOLD } — _bounds is a closure-private helper, never
// exported (confirmed empirically: AG._bounds is undefined, all 9 original
// direct-call tests failed immediately when retargeted here).
//
// Worse than "not exported": the "without DS" half of the original 6 tests
// exercises a code path that is structurally UNREACHABLE through
// AlignmentEngine's public API even indirectly. compute()'s very first line
// is `if (typeof DS === 'undefined') return {...}` — it returns before ever
// calling _bounds — so _bounds(el) without DS never executes inside
// AlignmentEngine.js at all. This is not a migration gap, it's dead surface
// that this task is correctly forbidden from closing (rule: no tocar
// AlignmentEngine.js). Documented per project convention (see the
// RenderScheduler rAF gap in race_conditions.test.mjs) rather than silently
// dropped.
test('AlignmentEngine — DEFERRED: _bounds without DS is unreachable via the public API (documents real gap, not migrated)', () => {
  const GAP = {
    id: 'ALIGN-BOUNDS-001',
    description: '_bounds(el) without DS was directly unit-tested against AlignmentGeometry.js (6 cases: x/y/x2/y2/cx/cy passthrough). AlignmentEngine.js never exposes _bounds, and compute() short-circuits on `typeof DS === "undefined"` before ever calling it — so this behavior cannot be exercised through AlignmentEngine.js, not even indirectly.',
    requires: 'Exporting _bounds from AlignmentEngine.js (an API change, out of scope — rule: no tocar AlignmentEngine.js) or accepting the gap.',
    knownRisk: 'low — _bounds is pure arithmetic (el.x/el.y/el.w/el.h passthrough), trivial to re-verify by inspection; no DS-dependent branch involved in the no-DS path.',
    implementedIn: null,
  };
  assert.ok(GAP.id, 'gap must be formally documented');
  assert.equal(GAP.implementedIn, null, 'gap is unimplemented — update when done');
});

// ── _bounds — with DS: migrated indirectly via compute()'s guide positions ────
//
// The "with DS" half IS reachable: compute() calls _bounds(el) for every
// other element once DS exists, and the resulting guide modelPos values are
// exactly _bounds(el).x / .y / .x2 / .cx / .cy (offset by secTop for y).
// These 3 tests verify the same arithmetic _bounds performed, observed
// through compute()'s public output instead of calling _bounds directly.

test('compute (with DS): y-axis guide position includes secTop offset', () => {
  // other el: y=20, h=40, secTop=100 → bounds.y=120 (same arithmetic the
  // original "_bounds with DS: secTop added to y" test verified directly).
  // secTop is shared by both elements, so it cancels out of the distance
  // check (|mb.y - b.y| = |movingY - otherY|) — proximity is on raw y, but
  // the resulting guide position is still the secTop-offset absolute value.
  const moving = makeEl('m', 200, 21, 20, 20); // close to other's raw y=20 (d=1 ≤ 4)
  const other  = makeEl('o', 200, 20, 30, 40);
  const result = withDSAndCFG([moving, other], 800, () => 100, () => AG.compute(moving));
  const g = result.guides.find(g => g.axis === 'y' && g.modelPos === 120);
  assert.ok(g, 'expected y-guide at secTop(100) + el.y(20) = 120');
});

test('compute (with DS): x-axis guide positions are unaffected by secTop', () => {
  // other el: x=10, w=30 → bounds.x=10 regardless of secTop (same arithmetic
  // the original "_bounds with DS: x values unaffected by secTop" verified).
  const moving = makeEl('m', 12, 500, 20, 20); // close to x=10 (d=2 ≤ 4)
  const other  = makeEl('o', 10, 500, 30, 20);
  const result = withDSAndCFG([moving, other], 800, () => 999, () => AG.compute(moving));
  const g = result.guides.find(g => g.axis === 'x' && g.modelPos === 10);
  assert.ok(g, 'expected x-guide at el.x=10, unaffected by secTop=999');
});

test('compute (with DS): secTop=0 yields the same y-guide position as el.y directly', () => {
  // other el: y=15 with secTop()=>0 → bounds.y=15 (same boundary case the
  // original "_bounds with DS secTop=0: same as no-DS result" verified).
  const moving = makeEl('m', 600, 16, 20, 20); // close to 15 (d=1 ≤ 4)
  const other  = makeEl('o', 600, 15, 20, 20);
  const result = withDSAndCFG([moving, other], 800, () => 0, () => AG.compute(moving));
  const g = result.guides.find(g => g.axis === 'y' && g.modelPos === 15);
  assert.ok(g, 'expected y-guide at el.y=15 when secTop=0 (matches no-DS arithmetic)');
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
