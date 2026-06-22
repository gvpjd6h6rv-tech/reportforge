import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

// Migrated in P15E from engines/RuntimeGeometry.js to engines/RuntimeGlobals.js
// — RuntimeGlobals.js is the live installer (designer-v4.html:391), the one
// that actually executes in the browser. RuntimeGeometry.js was a parallel,
// never-loaded re-implementation tested only by this file via require() —
// validating code that never ran in production. RuntimeGlobals.js is not a
// CommonJS module (no module.exports — it's a browser-only IIFE that throws
// if RuntimeData/RuntimeHelpers aren't already loaded as globals), so it's
// loaded here via vm with those two stubbed as no-op installers.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const RUNTIME_GLOBALS_SRC = fs.readFileSync(path.join(ROOT, 'engines/RuntimeGlobals.js'), 'utf8');

function makeRect(left, top, width, height) {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
  };
}

function withRuntimeGlobals({ canvasRects, workspaceRect, rulerRect, zoom = 1.5, dpr = 2 }, fn) {
  const canvasCalls = [];
  const workspaceCalls = [];
  const rulerCalls = [];
  const canvasQueue = [...canvasRects];

  const window = { devicePixelRatio: dpr };
  const document = {
    getElementById(id) {
      if (id === 'canvas-layer') {
        canvasCalls.push(id);
        return {
          getBoundingClientRect: () => canvasQueue.length ? canvasQueue.shift() : canvasRects[canvasRects.length - 1],
        };
      }
      if (id === 'workspace') {
        workspaceCalls.push(id);
        return {
          scrollLeft: workspaceRect.scrollLeft || 0,
          scrollTop: workspaceRect.scrollTop || 0,
          getBoundingClientRect: () => workspaceRect,
        };
      }
      if (id === 'ruler-v') {
        rulerCalls.push(id);
        return {
          getBoundingClientRect: () => rulerRect,
        };
      }
      return null;
    },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
  };
  const DS = { zoom };
  // RuntimeGlobals.js hard-requires these to already be loaded (throws
  // otherwise) — stub as no-op installers, irrelevant to geometry behavior.
  const RuntimeData = { install() {} };
  const RuntimeHelpers = { install() {} };

  const ctx = { window, document, DS, RuntimeData, RuntimeHelpers, console };
  vm.runInNewContext(RUNTIME_GLOBALS_SRC, ctx);

  return fn({
    RF: ctx.window.RF,
    DS,
    canvasCalls,
    workspaceCalls,
    rulerCalls,
  });
}

test('RuntimeGlobals install exposes RF.Geometry', () => {
  withRuntimeGlobals({
    canvasRects: [makeRect(100, 50, 800, 600)],
    workspaceRect: makeRect(0, 0, 900, 700),
    rulerRect: makeRect(0, 0, 20, 700),
  }, ({ RF }) => {
    assert.ok(RF.Geometry, 'RF.Geometry should be installed');
    assert.equal(typeof RF.Geometry.viewToModel, 'function');
    assert.equal(typeof RF.Geometry.modelToView, 'function');
  });
});

test('invalidate clears cache and rereads canvas rect', () => {
  withRuntimeGlobals({
    canvasRects: [makeRect(10, 20, 100, 50), makeRect(30, 40, 120, 60)],
    workspaceRect: makeRect(0, 0, 900, 700),
    rulerRect: makeRect(0, 0, 20, 700),
  }, ({ RF, canvasCalls }) => {
    const first = RF.Geometry.canvasRect();
    const cached = RF.Geometry.canvasRect();
    assert.equal(first, cached, 'canvasRect should be cached between reads');
    assert.equal(canvasCalls.length, 1, 'canvas rect should be measured once before invalidate');

    RF.Geometry.invalidate();
    const second = RF.Geometry.canvasRect();
    assert.notEqual(second, first, 'invalidate should force a fresh measurement');
    assert.equal(second.left, 30);
    assert.equal(second.top, 40);
    assert.equal(canvasCalls.length, 2, 'canvas rect should be measured again after invalidate');
  });
});

test('zoom/scale/unscale read DS.zoom and are mutually inverse', () => {
  withRuntimeGlobals({
    canvasRects: [makeRect(100, 50, 800, 600)],
    workspaceRect: makeRect(0, 0, 900, 700),
    rulerRect: makeRect(0, 0, 20, 700),
    zoom: 2.5,
  }, ({ RF, DS }) => {
    assert.equal(RF.Geometry.zoom(), 2.5, 'zoom() must read the live DS.zoom value');
    assert.equal(RF.Geometry.scale(10), 25, 'scale(v) must be v * zoom()');
    assert.equal(RF.Geometry.unscale(25), 10, 'unscale(v) must be v / zoom()');
    assert.equal(RF.Geometry.unscale(RF.Geometry.scale(7)), 7, 'scale/unscale must be exact inverses');

    // RF.Geometry has no setZoom() in either the live implementation or the
    // retired RuntimeGeometry.js — zoom is set externally via DS.zoom by the
    // zoom engine, never through RF.Geometry itself. Confirms there is no
    // parity gap here: neither side ever had this method.
    assert.equal(typeof RF.Geometry.setZoom, 'undefined', 'setZoom does not exist on either implementation — not a real API');

    DS.zoom = 4;
    assert.equal(RF.Geometry.zoom(), 4, 'zoom() must reflect DS.zoom changes live (no internal caching of the zoom value itself)');
  });
});

test('viewToModel and modelToView round-trip with zoom', () => {
  withRuntimeGlobals({
    canvasRects: [makeRect(100, 50, 800, 600)],
    workspaceRect: makeRect(0, 0, 900, 700),
    rulerRect: makeRect(0, 0, 20, 700),
    zoom: 2,
  }, ({ RF }) => {
    const model = { x: 12, y: 8 };
    const view = RF.Geometry.modelToView(model.x, model.y);
    const back = RF.Geometry.viewToModel(100 + view.x, 50 + view.y);
    // `back` is created inside the vm sandbox realm — compare by value, not
    // assert.deepEqual, which also checks Object.prototype identity and would
    // false-fail across realms even on identical content (same pitfall as
    // race_conditions.test.mjs, fixed there in P13B).
    assert.equal(JSON.stringify(back), JSON.stringify(model));
  });
});

test('screenToModel and modelToScreen round-trip with canvas rect', () => {
  withRuntimeGlobals({
    canvasRects: [makeRect(100, 50, 800, 600)],
    workspaceRect: { ...makeRect(0, 0, 900, 700), scrollLeft: 7, scrollTop: 9 },
    rulerRect: makeRect(0, 0, 20, 700),
    zoom: 2,
    dpr: 2,
  }, ({ RF }) => {
    const model = { x: 10, y: 20 };
    const screen = RF.Geometry.modelToScreen(model.x, model.y);
    const back = RF.Geometry.screenToModel(screen.x, screen.y);
    // cross-realm comparison — see note above.
    assert.equal(JSON.stringify(back), JSON.stringify(model));
  });
});

test('_rect rejects legacy x/y/w/h access', () => {
  withRuntimeGlobals({
    canvasRects: [makeRect(100, 50, 800, 600)],
    workspaceRect: makeRect(0, 0, 900, 700),
    rulerRect: makeRect(0, 0, 20, 700),
  }, ({ RF }) => {
    const rect = RF.Geometry._rect(1, 2, 3, 4);
    assert.equal(rect.left, 1);
    assert.throws(() => rect.x, /INVALID GEOMETRY SHAPE/);
    assert.throws(() => rect.y, /INVALID GEOMETRY SHAPE/);
    assert.throws(() => rect.w, /INVALID GEOMETRY SHAPE/);
    assert.throws(() => rect.h, /INVALID GEOMETRY SHAPE/);
  });
});

test('PointerNorm.toCanvas delegates through RF.Geometry.toCanvasSpace', () => {
  withRuntimeGlobals({
    canvasRects: [makeRect(100, 50, 800, 600)],
    workspaceRect: makeRect(0, 0, 900, 700),
    rulerRect: makeRect(0, 0, 20, 700),
  }, ({ RF }) => {
    const calls = [];
    const prev = RF.Geometry.toCanvasSpace;
    RF.Geometry.toCanvasSpace = (x, y) => {
      calls.push([x, y]);
      return { x: x + 1, y: y + 2 };
    };
    try {
      const out = RF.Geometry.PointerNorm.toCanvas({ clientX: 17, clientY: 23 });
      assert.deepEqual(out, { x: 18, y: 25 });
      assert.deepEqual(calls, [[17, 23]]);
    } finally {
      RF.Geometry.toCanvasSpace = prev;
    }
  });
});

test('DOM rect cache covers canvasRect/scrollRect/rulerVRect independently', () => {
  withRuntimeGlobals({
    canvasRects: [makeRect(100, 50, 800, 600)],
    workspaceRect: makeRect(0, 0, 900, 700),
    rulerRect: makeRect(0, 0, 20, 700),
  }, ({ RF, canvasCalls, workspaceCalls, rulerCalls }) => {
    RF.Geometry.canvasRect();
    RF.Geometry.canvasRect();
    RF.Geometry.scrollRect();
    RF.Geometry.scrollRect();
    RF.Geometry.rulerVRect();
    RF.Geometry.rulerVRect();

    assert.equal(canvasCalls.length, 1, 'canvasRect must be cached independently of scrollRect/rulerVRect');
    assert.equal(workspaceCalls.length, 1, 'scrollRect must be cached independently of canvasRect/rulerVRect');
    assert.equal(rulerCalls.length, 1, 'rulerVRect must be cached independently of canvasRect/scrollRect');

    RF.Geometry.invalidate();
    RF.Geometry.canvasRect();
    RF.Geometry.scrollRect();
    RF.Geometry.rulerVRect();
    assert.equal(canvasCalls.length, 2, 'invalidate must clear the whole frame cache, including canvasRect');
    assert.equal(workspaceCalls.length, 2, 'invalidate must clear the whole frame cache, including scrollRect');
    assert.equal(rulerCalls.length, 2, 'invalidate must clear the whole frame cache, including rulerVRect');
  });
});
