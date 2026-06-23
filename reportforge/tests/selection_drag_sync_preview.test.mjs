import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// ─── Test: _doMove invokes renderHandles inside flushSync ────────────────────
//
// The bug: during drag in Preview mode, _doMove wrapped renderHandles in a
// bare requestAnimationFrame. Inside that RAF, allowsDomWrite() returned false
// (no write scope), causing renderHandles to defer again via RenderScheduler
// → a second RAF → 2-frame lag between pv-el and sel-box.
//
// The fix: _doMove wraps renderHandles in RenderSchedulerScope.flushSync()
// inside the RAF, so allowsDomWrite() returns true and renderHandles executes
// immediately in the same frame.
//
// This test verifies the contract: renderHandles runs with allowsDomWrite()=true.

test('_doMove calls renderHandles within a flushSync write scope', () => {
  const motionSource = fs.readFileSync('engines/SelectionInteractionMotion.js', 'utf8');

  // Structural evidence: the source must call flushSync wrapping renderHandles
  assert.match(
    motionSource,
    /RenderSchedulerScope\.flushSync\(\s*\(\)\s*=>\s*\{\s*engine\.renderHandles\(\)/,
    '_doMove must wrap engine.renderHandles() inside RenderSchedulerScope.flushSync()'
  );

  // Negative: must NOT have a bare engine.renderHandles() directly in the RAF
  // outside of flushSync. The pattern "d._rafPending = false;\n        engine.renderHandles()"
  // would indicate the old bug.
  assert.doesNotMatch(
    motionSource,
    /d\._rafPending\s*=\s*false;\s*\n\s*engine\.renderHandles\(\)/,
    '_doMove must not call engine.renderHandles() outside of flushSync in the RAF callback'
  );
});

test('_doMove renderHandles executes with allowsDomWrite()=true at runtime', () => {
  let flushSyncCalled = false;
  let renderHandlesCalledInWriteScope = false;
  let writeScopeDepth = 0;

  const context = {
    console,
    window: {},
    DS: {
      previewMode: true,
      selection: new Set(['el-1']),
      elements: [{ id: 'el-1', type: 'text', x: 10, y: 20, w: 100, h: 30, sectionId: 's1' }],
      getSelectedElements: () => context.DS.elements,
      getElementById: (id) => context.DS.elements.find(e => e.id === id) || null,
      getSection: () => ({ id: 's1', height: 500 }),
      getSectionTop: () => 0,
      updateElementLayout: (id, patch) => {
        const el = context.DS.elements.find(e => e.id === id);
        if (el) { if (patch.x !== undefined) el.x = patch.x; if (patch.y !== undefined) el.y = patch.y; }
      },
    },
    CFG: { PAGE_W: 800, MIN_EL_W: 4, MIN_EL_H: 4 },
    SelectionState: {
      snap: (v) => Math.round(v),
      getElementById: (id) => context.DS.elements.find(e => e.id === id) || null,
      getSectionTop: () => 0,
      selectedIds: () => new Set(['el-1']),
    },
    RulerEngine: { updateCursor() {} },
    HistoryEngine: { push() {} },
    PropertiesEngine: { updatePositionFields() {} },
    InsertEngine: { onMouseMove() {} },
    SelectionDragPreviewSync: {
      previewRenderElementIndex: () => -1,
      findPreviewRenderNodes: () => [],
      dragTransformStyle() {},
    },
    getCanvasPos: () => ({ x: 50, y: 60 }),
    requestAnimationFrame: (fn) => { fn(); return 1; },
    document: {
      getElementById: () => ({ textContent: '', style: { display: '' } }),
      querySelector: () => null,
      querySelectorAll: () => [],
    },
    RenderSchedulerScope: {
      flushSync(fn, source) {
        flushSyncCalled = true;
        writeScopeDepth++;
        try { fn(); } finally { writeScopeDepth--; }
      },
    },
    module: { exports: {} },
  };

  context.globalThis = context;
  vm.createContext(context);

  const source = fs.readFileSync('engines/SelectionInteractionMotion.js', 'utf8');
  vm.runInContext(source, context, { filename: 'engines/SelectionInteractionMotion.js' });

  const Motion = context.module.exports;

  const engine = {
    _drag: {
      type: 'move',
      startX: 10,
      startY: 20,
      moved: false,
      subjectIds: ['el-1'],
      startPositions: [{ id: 'el-1', x: 10, y: 20, sectionId: 's1', sectionTop: 0 }],
    },
    renderHandles() {
      renderHandlesCalledInWriteScope = writeScopeDepth > 0;
    },
    updateElementLayout(id, patch, source) {
      context.DS.updateElementLayout(id, patch, source);
    },
  };

  Motion._doMove(engine, { x: 50, y: 60 }, {});

  assert.ok(flushSyncCalled, 'flushSync must be called during _doMove');
  assert.ok(renderHandlesCalledInWriteScope, 'renderHandles must execute inside a write scope (writeScopeDepth > 0)');
});
