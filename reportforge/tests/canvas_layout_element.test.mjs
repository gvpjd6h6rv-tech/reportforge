'use strict';
/**
 * CL-01 — ElementLayoutEngine contracts
 * Tests pure math and style-application contracts via vm isolation.
 * ElementLayoutEngine is the model→view coordinate applier for individual elements.
 */
import test   from 'node:test';
import assert from 'node:assert/strict';
import fs     from 'node:fs';
import vm     from 'node:vm';
import { resolve, dirname } from 'node:path';
import { fileURLToPath }    from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function loadElement({ scale = v => v } = {}) {
  const src = fs.readFileSync(resolve(ROOT, 'engines/ElementLayoutEngine.js'), 'utf8');
  const ctx = {
    module: { exports: {} },
    RF: { Geometry: { scale } },
    document: { querySelector: () => null },
    RenderScheduler: undefined,
    requestAnimationFrame: () => {},
    DS: undefined,
  };
  vm.runInNewContext(src, ctx);
  return ctx.module.exports;
}

// ── apply: style assignment ───────────────────────────────────────────────────

test('apply — sets left/top/width/height/fontSize with identity scale', () => {
  const E = loadElement();
  const div = { style: {} };
  E.apply({ x: 10, y: 20, w: 100, h: 50, fontSize: 12 }, div);
  assert.equal(div.style.left,     '10.000px');
  assert.equal(div.style.top,      '20.000px');
  assert.equal(div.style.width,    '100.000px');
  assert.equal(div.style.height,   '50.000px');
  // 12pt at 96dpi = 12 * 96/72 = 16px
  assert.equal(div.style.fontSize, '16.000px');
});

test('apply — sub-pixel precision preserved (scale ×1.5)', () => {
  const E = loadElement({ scale: v => v * 1.5 });
  const div = { style: {} };
  E.apply({ x: 10, y: 20, w: 100, h: 50, fontSize: 12 }, div);
  assert.equal(div.style.left,   '10.000px');
  assert.equal(div.style.top,    '20.000px');
  assert.equal(div.style.width,  '100.000px');
  assert.equal(div.style.height, '50.000px');
});

test('apply — null div is a no-op (no throw)', () => {
  const E = loadElement();
  assert.doesNotThrow(() => E.apply({ x: 10, y: 10, w: 50, h: 50, fontSize: 10 }, null));
});

test('apply — null element is a no-op (no throw)', () => {
  const E = loadElement();
  const div = { style: {} };
  assert.doesNotThrow(() => E.apply(null, div));
});

// ── moveElement: model-space delta ────────────────────────────────────────────

test('moveElement — returns updated {x, y} after delta', () => {
  const E = loadElement();
  const el = { x: 10, y: 20, w: 100, h: 50, id: 'e1', fontSize: 10 };
  const result = E.moveElement(el, 5, 10);
  assert.equal(result.x, 15);
  assert.equal(result.y, 30);
  assert.equal(el.x, 15);
  assert.equal(el.y, 30);
});

test('moveElement — negative delta moves element backward', () => {
  const E = loadElement();
  const el = { x: 100, y: 80, w: 50, h: 30, id: 'e2', fontSize: 10 };
  const result = E.moveElement(el, -30, -20);
  assert.equal(result.x, 70);
  assert.equal(result.y, 60);
});

test('moveElement — grid=4 snaps to nearest multiple', () => {
  const E = loadElement();
  const el = { x: 0, y: 0, w: 50, h: 30, id: 'e3', fontSize: 10 };
  E.moveElement(el, 6, 11, 4);  // x→6 snap→8, y→11 snap→12
  assert.equal(el.x, 8);
  assert.equal(el.y, 12);
});

test('moveElement — grid=0 means no snapping', () => {
  const E = loadElement();
  const el = { x: 0, y: 0, w: 50, h: 30, id: 'e4', fontSize: 10 };
  E.moveElement(el, 6.7, 11.3, 0);
  assert.equal(el.x, 6.7);
  assert.equal(el.y, 11.3);
});

// ── resizeElement: model-space delta ─────────────────────────────────────────

test('resizeElement — grows dimensions by delta', () => {
  const E = loadElement();
  const el = { x: 0, y: 0, w: 100, h: 50, id: 'e5', fontSize: 10 };
  const result = E.resizeElement(el, 20, 10);
  assert.equal(result.w, 120);
  assert.equal(result.h, 60);
  assert.equal(el.w, 120);
  assert.equal(el.h, 60);
});

test('resizeElement — clamped to default minSize=4', () => {
  const E = loadElement();
  const el = { x: 0, y: 0, w: 10, h: 10, id: 'e6', fontSize: 10 };
  E.resizeElement(el, -200, -200);
  assert.equal(el.w, 4);
  assert.equal(el.h, 4);
});

test('resizeElement — clamped to custom minSize', () => {
  const E = loadElement();
  const el = { x: 0, y: 0, w: 20, h: 20, id: 'e7', fontSize: 10 };
  E.resizeElement(el, -100, -100, 10);
  assert.equal(el.w, 10);
  assert.equal(el.h, 10);
});

test('resizeElement — no shrink below minSize when delta is small negative', () => {
  const E = loadElement();
  const el = { x: 0, y: 0, w: 6, h: 6, id: 'e8', fontSize: 10 };
  E.resizeElement(el, -4, -4);  // 6-4=2, clamped to 4
  assert.equal(el.w, 4);
  assert.equal(el.h, 4);
});
