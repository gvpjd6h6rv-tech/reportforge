'use strict';
/**
 * SS-04 — GeometryCore extended contracts
 * Covers normalizeRect edge cases, all resizeRectFromHandle handles,
 * constraint enforcement, bboxFromRects nullability, snapValue grid modes,
 * and compound null-safety paths. All tests are pure — no DOM, no globals.
 */
import test   from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const ROOT    = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const G       = require('../../engines/GeometryCore.js');

// ── makePoint defaults ────────────────────────────────────────────────────────

test('makePoint — defaults to 0,0', () => {
  const p = G.makePoint();
  assert.equal(p.x, 0);
  assert.equal(p.y, 0);
});

test('makePoint — NaN inputs coerce to 0', () => {
  const p = G.makePoint(NaN, NaN);
  assert.equal(p.x, 0);
  assert.equal(p.y, 0);
});

// ── makeRect defaults ─────────────────────────────────────────────────────────

test('makeRect — NaN inputs coerce to 0', () => {
  const r = G.makeRect(NaN, NaN, NaN, NaN);
  assert.equal(r.x, 0);
  assert.equal(r.y, 0);
  assert.equal(r.w, 0);
  assert.equal(r.h, 0);
});

// ── normalizeRect ─────────────────────────────────────────────────────────────

test('normalizeRect — negative width is flipped and origin adjusted', () => {
  const r = G.normalizeRect({ x: 50, y: 20, w: -30, h: 10 });
  assert.equal(r.x, 20);
  assert.equal(r.y, 20);
  assert.equal(r.w, 30);
  assert.equal(r.h, 10);
});

test('normalizeRect — negative height is flipped and origin adjusted', () => {
  const r = G.normalizeRect({ x: 10, y: 50, w: 20, h: -15 });
  assert.equal(r.x, 10);
  assert.equal(r.y, 35);
  assert.equal(r.w, 20);
  assert.equal(r.h, 15);
});

test('normalizeRect — null input returns zero rect', () => {
  const r = G.normalizeRect(null);
  assert.equal(r.x, 0);
  assert.equal(r.y, 0);
  assert.equal(r.w, 0);
  assert.equal(r.h, 0);
});

// ── rectUnion null branches ───────────────────────────────────────────────────

test('rectUnion — both null returns null', () => {
  assert.equal(G.rectUnion(null, null), null);
});

test('rectUnion — first null returns normalized second', () => {
  const b = { x: 5, y: 5, w: 10, h: 10 };
  const r = G.rectUnion(null, b);
  assert.equal(r.x, 5);
  assert.equal(r.y, 5);
});

test('rectUnion — second null returns normalized first', () => {
  const a = { x: 3, y: 3, w: 10, h: 10 };
  const r = G.rectUnion(a, null);
  assert.equal(r.x, 3);
  assert.equal(r.w, 10);
});

// ── rectIntersect overlap ─────────────────────────────────────────────────────

test('rectIntersect — overlapping rects return intersection', () => {
  const a = G.makeRect(0, 0, 20, 20);
  const b = G.makeRect(10, 10, 20, 20);
  const r = G.rectIntersect(a, b);
  assert.equal(r.x, 10);
  assert.equal(r.y, 10);
  assert.equal(r.w, 10);
  assert.equal(r.h, 10);
});

test('rectIntersect — touching edge rects return null (no area)', () => {
  const a = G.makeRect(0, 0, 10, 10);
  const b = G.makeRect(10, 0, 10, 10);  // share edge at x=10
  assert.equal(G.rectIntersect(a, b), null);
});

// ── bboxFromRects edge cases ──────────────────────────────────────────────────

test('bboxFromRects — empty array returns null', () => {
  assert.equal(G.bboxFromRects([]), null);
});

test('bboxFromRects — null argument returns null', () => {
  assert.equal(G.bboxFromRects(null), null);
});

test('bboxFromRects — single rect returns that rect', () => {
  const r = G.bboxFromRects([{ x: 5, y: 10, w: 20, h: 30 }]);
  assert.equal(r.x, 5);
  assert.equal(r.y, 10);
  assert.equal(r.w, 20);
  assert.equal(r.h, 30);
});

// ── snapValue grid modes ──────────────────────────────────────────────────────

test('snapValue — grid <= 0 returns value unchanged', () => {
  assert.equal(G.snapValue(13, -1), 13);
});

test('snapValue — negative value snapped correctly', () => {
  // -13 / 5 = -2.6 → Math.round(-2.6) = -3 → -3*5 = -15
  assert.equal(G.snapValue(-13, 5), -15);
});

test('snapValue — grid=1 returns rounded integer', () => {
  assert.equal(G.snapValue(7.7, 1), 8);
});

// ── pointDistance ─────────────────────────────────────────────────────────────

test('pointDistance — same point returns 0', () => {
  assert.equal(G.pointDistance({ x: 5, y: 5 }, { x: 5, y: 5 }), 0);
});

// ── rectEqualsWithinTolerance ─────────────────────────────────────────────────

test('rectEqualsWithinTolerance — outside tolerance returns false', () => {
  const a = G.makeRect(0, 0, 10, 10);
  const b = G.makeRect(0, 0, 13, 10);  // w differs by 3, tolerance=2
  assert.equal(G.rectEqualsWithinTolerance(a, b, 2), false);
});

test('rectEqualsWithinTolerance — null inputs return false', () => {
  assert.equal(G.rectEqualsWithinTolerance(null, G.makeRect(0,0,10,10), 0), false);
  assert.equal(G.rectEqualsWithinTolerance(G.makeRect(0,0,10,10), null, 0), false);
});

// ── clampRect ─────────────────────────────────────────────────────────────────

test('clampRect — null rect returns zero rect', () => {
  const bounds = G.makeRect(0, 0, 100, 100);
  const r = G.clampRect(null, bounds);
  assert.equal(r.x, 0);
  assert.equal(r.y, 0);
  assert.equal(r.w, 0);
  assert.equal(r.h, 0);
});

test('clampRect — rect larger than bounds is constrained to bounds size', () => {
  const rect   = G.makeRect(0, 0, 200, 200);
  const bounds = G.makeRect(0, 0, 100, 100);
  const r = G.clampRect(rect, bounds);
  assert.equal(r.w, 100);
  assert.equal(r.h, 100);
});

// ── resizeRectFromHandle — all 8 handles ──────────────────────────────────────

// Base rect for all handle tests: x=10, y=20, w=30, h=40
const BASE = { x: 10, y: 20, w: 30, h: 40 };
const SNAP = (v) => v;  // identity snap

test('resizeRectFromHandle — s handle moves bottom edge down', () => {
  const r = G.resizeRectFromHandle(BASE, 's', 0, 10, { snap: SNAP });
  assert.equal(r.x, 10);
  assert.equal(r.y, 20);
  assert.equal(r.w, 30);
  assert.equal(r.h, 50);
});

test('resizeRectFromHandle — n handle moves top edge up', () => {
  // dy=-10 → nh = h-dy = 40-(-10) = 50; y = y+h-nh = 20+40-50 = 10
  const r = G.resizeRectFromHandle(BASE, 'n', 0, -10, { snap: SNAP });
  assert.equal(r.x, 10);
  assert.equal(r.y, 10);
  assert.equal(r.w, 30);
  assert.equal(r.h, 50);
});

test('resizeRectFromHandle — e handle moves right edge right', () => {
  const r = G.resizeRectFromHandle(BASE, 'e', 10, 0, { snap: SNAP });
  assert.equal(r.x, 10);
  assert.equal(r.y, 20);
  assert.equal(r.w, 40);
  assert.equal(r.h, 40);
});

test('resizeRectFromHandle — w handle moves left edge left', () => {
  // dx=-10 → nw = w-dx = 30-(-10) = 40; x = x+w-nw = 10+30-40 = 0
  const r = G.resizeRectFromHandle(BASE, 'w', -10, 0, { snap: SNAP });
  assert.equal(r.x, 0);
  assert.equal(r.y, 20);
  assert.equal(r.w, 40);
  assert.equal(r.h, 40);
});

test('resizeRectFromHandle — ne handle moves top-right corner', () => {
  // e: w=40, n: nh=50, y=10
  const r = G.resizeRectFromHandle(BASE, 'ne', 10, -10, { snap: SNAP });
  assert.equal(r.x, 10);
  assert.equal(r.y, 10);
  assert.equal(r.w, 40);
  assert.equal(r.h, 50);
});

test('resizeRectFromHandle — nw handle moves top-left corner', () => {
  // w: nw=40, x=0; n: nh=50, y=10
  const r = G.resizeRectFromHandle(BASE, 'nw', -10, -10, { snap: SNAP });
  assert.equal(r.x, 0);
  assert.equal(r.y, 10);
  assert.equal(r.w, 40);
  assert.equal(r.h, 50);
});

test('resizeRectFromHandle — sw handle moves bottom-left corner', () => {
  // w: nw=40, x=0; s: h=50
  const r = G.resizeRectFromHandle(BASE, 'sw', -10, 10, { snap: SNAP });
  assert.equal(r.x, 0);
  assert.equal(r.y, 20);
  assert.equal(r.w, 40);
  assert.equal(r.h, 50);
});

// ── resizeRectFromHandle — constraints ────────────────────────────────────────

test('resizeRectFromHandle — minW enforced when shrinking past minimum', () => {
  // e, dx=-100 → raw new w = 30-100 = -70 → clamped to minW=20
  const r = G.resizeRectFromHandle(BASE, 'e', -100, 0, { minW: 20, snap: SNAP });
  assert.equal(r.w, 20);
});

test('resizeRectFromHandle — maxW enforced when growing past maximum', () => {
  // e, dx=200 → raw new w = 30+200 = 230 → clamped to maxW=50
  const r = G.resizeRectFromHandle(BASE, 'e', 200, 0, { maxW: 50, snap: SNAP });
  assert.equal(r.w, 50);
});

test('resizeRectFromHandle — minH enforced on s handle', () => {
  // s, dy=-100 → raw new h = 40-100 = -60 → clamped to minH=10
  const r = G.resizeRectFromHandle(BASE, 's', 0, -100, { minH: 10, snap: SNAP });
  assert.equal(r.h, 10);
});

// ── resizeRectFromHandle — snap function ──────────────────────────────────────

test('resizeRectFromHandle — snap function applied to new dimension', () => {
  // e, dx=8, snap to grid of 5: snap(30+8) = snap(38) → round(38/5)*5 = 8*5 = 40
  const grid5 = (v) => Math.round(v / 5) * 5;
  const r = G.resizeRectFromHandle(BASE, 'e', 8, 0, { snap: grid5 });
  assert.equal(r.w, 40);
});

test('resizeRectFromHandle — no constraints arg uses defaults (minW=0, maxW=Inf)', () => {
  // e, dx=10, no constraints
  const r = G.resizeRectFromHandle(BASE, 'e', 10, 0, {});
  assert.equal(r.w, 40);
  assert.equal(r.h, 40);
});
