'use strict';
/**
 * SS-04 — CanvasGeometry contracts
 * Covers all 6 public functions: sectionAbsoluteRect, elementCanvasRect,
 * elementViewRect, rectToView, canvasBoundsFromSections, selectionViewRects.
 * Null-safety, zoom transform, and stacking behaviour are verified.
 */
import test   from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
globalThis.CFG = globalThis.CFG || { PAGE_W: 800 };

const CG = require('../../engines/CanvasGeometry.js');

// ── sectionAbsoluteRect ───────────────────────────────────────────────────────

test('sectionAbsoluteRect — null section returns null', () => {
  assert.equal(CG.sectionAbsoluteRect(null), null);
});

test('sectionAbsoluteRect — sectionTop=0 default', () => {
  const r = CG.sectionAbsoluteRect({ width: 400, height: 120 });
  assert.equal(r.x, 0);
  assert.equal(r.y, 0);
  assert.equal(r.w, 400);
  assert.equal(r.h, 120);
});

test('sectionAbsoluteRect — sectionTop shifts y', () => {
  const r = CG.sectionAbsoluteRect({ width: 500, height: 80 }, 200);
  assert.equal(r.y, 200);
  assert.equal(r.h, 80);
  assert.equal(r.w, 500);
});

test('sectionAbsoluteRect — missing width falls back to CFG.PAGE_W', () => {
  const r = CG.sectionAbsoluteRect({ height: 50 }, 0);
  assert.equal(r.w, globalThis.CFG.PAGE_W);
});

// ── elementCanvasRect ─────────────────────────────────────────────────────────

test('elementCanvasRect — null element returns null', () => {
  assert.equal(CG.elementCanvasRect(null), null);
});

test('elementCanvasRect — element at y=0 section (sectionTop=0)', () => {
  const el = { x: 10, y: 20, w: 50, h: 30 };
  const r  = CG.elementCanvasRect(el, 0);
  assert.equal(r.x, 10);
  assert.equal(r.y, 20);  // sectionTop + el.y = 0 + 20
  assert.equal(r.w, 50);
  assert.equal(r.h, 30);
});

test('elementCanvasRect — sectionTop offset added to y', () => {
  const el = { x: 5, y: 10, w: 20, h: 15 };
  const r  = CG.elementCanvasRect(el, 100);
  assert.equal(r.y, 110);  // 100 + 10
  assert.equal(r.x, 5);
});

// ── elementViewRect ───────────────────────────────────────────────────────────

test('elementViewRect — null element returns null', () => {
  assert.equal(CG.elementViewRect(null), null);
});

test('elementViewRect — zoom=1 returns view coords equal to canvas coords', () => {
  const el = { x: 10, y: 20, w: 30, h: 40 };
  const v  = CG.elementViewRect(el, 0, 1);
  assert.equal(v.left,   10);
  assert.equal(v.top,    20);
  assert.equal(v.width,  30);
  assert.equal(v.height, 40);
});

test('elementViewRect — zoom=2 doubles all view dimensions', () => {
  const el = { x: 10, y: 20, w: 30, h: 40 };
  const v  = CG.elementViewRect(el, 0, 2);
  assert.equal(v.left,   20);
  assert.equal(v.top,    40);
  assert.equal(v.width,  60);
  assert.equal(v.height, 80);
});

test('elementViewRect — sectionTop is included before zoom scaling', () => {
  const el = { x: 0, y: 10, w: 20, h: 20 };
  const v  = CG.elementViewRect(el, 50, 2);   // canvas y = 50+10=60; view top = 60*2=120
  assert.equal(v.top, 120);
});

// ── rectToView ────────────────────────────────────────────────────────────────

test('rectToView — zoom=1 preserves dimensions', () => {
  const v = CG.rectToView({ x: 5, y: 10, w: 20, h: 30 }, 1);
  assert.equal(v.left,   5);
  assert.equal(v.top,    10);
  assert.equal(v.width,  20);
  assert.equal(v.height, 30);
});

test('rectToView — zoom=3 scales all fields', () => {
  const v = CG.rectToView({ x: 1, y: 2, w: 3, h: 4 }, 3);
  assert.equal(v.left,   3);
  assert.equal(v.top,    6);
  assert.equal(v.width,  9);
  assert.equal(v.height, 12);
});

// ── canvasBoundsFromSections ──────────────────────────────────────────────────

test('canvasBoundsFromSections — empty sections returns null', () => {
  assert.equal(CG.canvasBoundsFromSections([], 800), null);
});

test('canvasBoundsFromSections — single section produces correct bounds', () => {
  const r = CG.canvasBoundsFromSections([{ height: 150 }], 600);
  assert.equal(r.x, 0);
  assert.equal(r.y, 0);
  assert.equal(r.w, 600);
  assert.equal(r.h, 150);
});

test('canvasBoundsFromSections — multiple sections stack vertically', () => {
  const sections = [{ height: 100 }, { height: 200 }, { height: 50 }];
  const r = CG.canvasBoundsFromSections(sections, 400);
  assert.equal(r.x, 0);
  assert.equal(r.y, 0);
  assert.equal(r.w, 400);
  assert.equal(r.h, 350);  // 100+200+50
});

test('canvasBoundsFromSections — zero-height section clamped to 0', () => {
  const r = CG.canvasBoundsFromSections([{ height: 0 }, { height: 100 }], 200);
  assert.equal(r.h, 100);
});

// ── selectionViewRects ────────────────────────────────────────────────────────

test('selectionViewRects — empty array returns empty array', () => {
  const result = CG.selectionViewRects([], () => 0, 1);
  assert.equal(result.length, 0);
});

test('selectionViewRects — maps elements to view rects using sectionTopFn', () => {
  const elements = [
    { x: 10, y: 5, w: 20, h: 10, sectionId: 'a' },
    { x: 30, y: 5, w: 10, h: 10, sectionId: 'b' },
  ];
  const sectionTops = { a: 0, b: 100 };
  const rects = CG.selectionViewRects(elements, id => sectionTops[id] ?? 0, 1);
  assert.equal(rects.length, 2);
  assert.equal(rects[0].top,   5);   // sectionTop=0 + el.y=5
  assert.equal(rects[1].top, 105);   // sectionTop=100 + el.y=5
});

test('selectionViewRects — zoom applied to all rects', () => {
  const elements = [{ x: 5, y: 10, w: 20, h: 30, sectionId: 'a' }];
  const rects = CG.selectionViewRects(elements, () => 0, 2);
  assert.equal(rects[0].left,   10);
  assert.equal(rects[0].top,    20);
  assert.equal(rects[0].width,  40);
  assert.equal(rects[0].height, 60);
});
