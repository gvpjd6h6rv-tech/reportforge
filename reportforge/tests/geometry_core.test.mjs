import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

globalThis.CFG = globalThis.CFG || { PAGE_W: 800 };

const GeometryCore = require('../../engines/GeometryCore.js');
const CanvasGeometry = require('../../engines/CanvasGeometry.js');
const SelectionGeometry = require('../../engines/SelectionGeometry.js');
const HitTestGeometry = require('../../engines/HitTestGeometry.js');

test('geometry core primitives are deterministic and pure', () => {
  const a = GeometryCore.makeRect(10, 20, 30, 40);
  const b = GeometryCore.makeRect(25, 5, 10, 15);
  assert.deepEqual(GeometryCore.rectUnion(a, b), { x: 10, y: 5, w: 30, h: 55 });
  assert.equal(GeometryCore.rectIntersect(a, b), null);
  assert.equal(GeometryCore.rectOverlaps(a, b), false);
  assert.equal(GeometryCore.rectContainsPoint(a, { x: 20, y: 30 }), true);
  assert.equal(GeometryCore.rectContainsRect(a, { x: 11, y: 21, w: 1, h: 1 }), true);
  assert.deepEqual(GeometryCore.translateRect(a, 5, -5), { x: 15, y: 15, w: 30, h: 40 });
  assert.deepEqual(GeometryCore.inflateRect(a, 2), { x: 8, y: 18, w: 34, h: 44 });
  assert.deepEqual(GeometryCore.deflateRect(a, 2), { x: 12, y: 22, w: 26, h: 36 });
  assert.deepEqual(GeometryCore.clampRect(GeometryCore.makeRect(-5, -5, 20, 20), GeometryCore.makeRect(0, 0, 100, 100)), { x: 0, y: 0, w: 20, h: 20 });
  assert.equal(GeometryCore.snapValue(13, 5), 15);
  assert.deepEqual(GeometryCore.snapRect({ x: 12, y: 13, w: 14, h: 16 }, 5), { x: 10, y: 15, w: 15, h: 15 });
  assert.deepEqual(GeometryCore.bboxFromRects([a, b]), { x: 10, y: 5, w: 30, h: 55 });
  assert.deepEqual(GeometryCore.rectCenter(a), { x: 25, y: 40 });
  assert.equal(GeometryCore.rectEqualsWithinTolerance(a, GeometryCore.makeRect(11, 19, 29, 41), 2), true);
  assert.equal(GeometryCore.pointDistance({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);
});

test('resizeRectFromHandle follows deterministic geometry', () => {
  const rect = GeometryCore.makeRect(10, 20, 30, 40);
  const east = GeometryCore.resizeRectFromHandle(rect, 'e', 10, 0, { minW: 20, minH: 10, snap: (v) => v });
  assert.deepEqual(east, { x: 10, y: 20, w: 40, h: 40 });
  const west = GeometryCore.resizeRectFromHandle(rect, 'w', 10, 0, { minW: 20, minH: 10, snap: (v) => v });
  assert.deepEqual(west, { x: 20, y: 20, w: 20, h: 40 });
  const southEast = GeometryCore.resizeRectFromHandle(rect, 'se', 5, 5, { minW: 10, minH: 10, snap: (v) => v });
  assert.deepEqual(southEast, { x: 10, y: 20, w: 35, h: 45 });
});

test('canvas geometry transforms section and element bounds', () => {
  const section = { width: 500, height: 120 };
  assert.deepEqual(CanvasGeometry.sectionAbsoluteRect(section, 30), { x: 0, y: 30, w: 500, h: 120 });
  assert.deepEqual(CanvasGeometry.elementCanvasRect({ x: 10, y: 20, w: 30, h: 40 }, 100), { x: 10, y: 120, w: 30, h: 40 });
  assert.deepEqual(CanvasGeometry.elementViewRect({ x: 10, y: 20, w: 30, h: 40 }, 100, 2), { left: 20, top: 240, width: 60, height: 80 });
  assert.deepEqual(CanvasGeometry.rectToView({ x: 1, y: 2, w: 3, h: 4 }, 3), { left: 3, top: 6, width: 9, height: 12 });
  assert.deepEqual(CanvasGeometry.canvasBoundsFromSections([{ height: 10 }, { height: 20 }], 200), { x: 0, y: 0, w: 200, h: 30 });
});

test('selection geometry computes bounds, handles and rubber-band rects', () => {
  const rects = [
    { left: 10, top: 20, width: 10, height: 10 },
    { left: 30, top: 15, width: 5, height: 10 },
  ];
  assert.deepEqual(SelectionGeometry.selectionBoundsFromRects(rects), { left: 10, top: 15, width: 25, height: 15 });
  assert.deepEqual(SelectionGeometry.selectionBoundsFromElements(rects), { left: 10, top: 15, width: 25, height: 15 });
  const handles = SelectionGeometry.selectionHandles({ left: 10, top: 20, width: 30, height: 40 });
  assert.equal(handles.length, 8);
  assert.deepEqual(handles[0], { pos: 'nw', cx: 10, cy: 20 });
  assert.deepEqual(handles[7], { pos: 'se', cx: 40, cy: 60 });
  assert.deepEqual(SelectionGeometry.rubberBandRect({ x: 50, y: 80 }, { x: 10, y: 20 }), { left: 10, top: 20, width: 40, height: 60 });
  assert.equal(SelectionGeometry.rectOverlapsBand({ left: 10, top: 10, width: 10, height: 10 }, { left: 15, top: 15, width: 5, height: 5 }), true);
});

test('hit test geometry resolves handles and overlaps without side effects', () => {
  const rect = { x: 10, y: 20, w: 30, h: 40 };
  assert.equal(HitTestGeometry.pointInRect({ x: 12, y: 22 }, rect), true);
  assert.equal(HitTestGeometry.pointInRect({ x: 1, y: 1 }, rect), false);
  assert.equal(HitTestGeometry.handleAt(rect, { x: 10, y: 20 }, 2), 'nw');
  assert.equal(HitTestGeometry.handleAt(rect, { x: 25, y: 40 }, 2), 'move');
  assert.equal(HitTestGeometry.edgeAt(rect, { x: 10, y: 20 }, 2), 'nw');
  assert.equal(HitTestGeometry.rectOverlapsRect(rect, { x: 20, y: 30, w: 5, h: 5 }), true);
  assert.equal(HitTestGeometry.rectContainsBand(rect, { x: 20, y: 30, w: 5, h: 5 }), true);
});

test('geometry modules stay small and free of DOM/state dependencies', () => {
  const files = [
    'engines/GeometryCore.js',
    'engines/CanvasGeometry.js',
    'engines/SelectionGeometry.js',
    'engines/HitTestGeometry.js',
  ];
  for (const rel of files) {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    assert.ok(src.split('\n').length <= 300, `${rel} must stay <= 300 lines`);
    assert.doesNotMatch(src, /\bdocument\b/);
    assert.doesNotMatch(src, /\bwindow\b/);
    assert.doesNotMatch(src, /\bDS\b/);
  }
});
