import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { RuntimeGeometry, PointerNorm } = require('../../engines/RuntimeGeometry.js');

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

function withRuntimeGeometry({ canvasRects, workspaceRect, rulerRect, zoom = 1.5, dpr = 2 }, fn) {
  const prevWindow = globalThis.window;
  const prevDocument = globalThis.document;
  const prevDS = globalThis.DS;
  const prevRF = globalThis.RF;

  const canvasCalls = [];
  const workspaceCalls = [];
  const rulerCalls = [];

  const canvasQueue = [...canvasRects];
  globalThis.window = {
    devicePixelRatio: dpr,
  };
  globalThis.document = {
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
  globalThis.DS = { zoom };
  globalThis.RF = {};

  try {
    RuntimeGeometry.install();
    return fn({
      RF: globalThis.window.RF,
      canvasCalls,
      workspaceCalls,
      rulerCalls,
    });
  } finally {
    if (prevWindow === undefined) delete globalThis.window;
    else globalThis.window = prevWindow;
    if (prevDocument === undefined) delete globalThis.document;
    else globalThis.document = prevDocument;
    if (prevDS === undefined) delete globalThis.DS;
    else globalThis.DS = prevDS;
    if (prevRF === undefined) delete globalThis.RF;
    else globalThis.RF = prevRF;
  }
}

test('RuntimeGeometry.install exposes RF.Geometry', () => {
  withRuntimeGeometry({
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
  withRuntimeGeometry({
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

test('viewToModel and modelToView round-trip with zoom', () => {
  withRuntimeGeometry({
    canvasRects: [makeRect(100, 50, 800, 600)],
    workspaceRect: makeRect(0, 0, 900, 700),
    rulerRect: makeRect(0, 0, 20, 700),
    zoom: 2,
  }, ({ RF }) => {
    const model = { x: 12, y: 8 };
    const view = RF.Geometry.modelToView(model.x, model.y);
    const back = RF.Geometry.viewToModel(100 + view.x, 50 + view.y);
    assert.deepEqual(back, model);
  });
});

test('screenToModel and modelToScreen round-trip with canvas rect', () => {
  withRuntimeGeometry({
    canvasRects: [makeRect(100, 50, 800, 600)],
    workspaceRect: { ...makeRect(0, 0, 900, 700), scrollLeft: 7, scrollTop: 9 },
    rulerRect: makeRect(0, 0, 20, 700),
    zoom: 2,
    dpr: 2,
  }, ({ RF }) => {
    const model = { x: 10, y: 20 };
    const screen = RF.Geometry.modelToScreen(model.x, model.y);
    const back = RF.Geometry.screenToModel(screen.x, screen.y);
    assert.deepEqual(back, model);
  });
});

test('_rect rejects legacy x/y/w/h access', () => {
  withRuntimeGeometry({
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
  withRuntimeGeometry({
    canvasRects: [makeRect(100, 50, 800, 600)],
    workspaceRect: makeRect(0, 0, 900, 700),
    rulerRect: makeRect(0, 0, 20, 700),
  }, ({ RF }) => {
    globalThis.RF = RF;
    const calls = [];
    const prev = RF.Geometry.toCanvasSpace;
    RF.Geometry.toCanvasSpace = (x, y) => {
      calls.push([x, y]);
      return { x: x + 1, y: y + 2 };
    };
    try {
      const out = PointerNorm.toCanvas({ clientX: 17, clientY: 23 });
      assert.deepEqual(out, { x: 18, y: 25 });
      assert.deepEqual(calls, [[17, 23]]);
    } finally {
      RF.Geometry.toCanvasSpace = prev;
    }
  });
});
