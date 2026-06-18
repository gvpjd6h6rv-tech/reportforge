import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function makeNode() {
  return {
    style: {
      setProperty() {},
    },
    dataset: {},
    className: '',
    appendChild() {},
    removeChild() {},
    firstChild: null,
  };
}

test('SelectionOverlay loads and renders in design mode without preloaded SelectionOverlayPreview', () => {
  const ctx = {
    console,
    globalThis: null,
    window: {},
    DS: { previewMode: false, selection: new Set(['el-1']), zoom: 1 },
    RF: { Geometry: { invalidate() {} } },
    RenderScheduler: { allowsDomWrite: () => true, assertDomWriteAllowed() {} },
    SelectionEngineContracts: {
      assertSelectionState() {},
      assertLayoutContract() {},
      assertRectShape() {},
      assertZoomContract() {},
    },
    SelectionState: {
      selectedIds: () => new Set(['el-1']),
      selectedElementsFromIds: () => [{ id: 'el-1', sectionId: 's1', x: 10, y: 20, w: 30, h: 40 }],
      getElementById: () => ({ id: 'el-1', sectionId: 's1', x: 10, y: 20, w: 30, h: 40 }),
      getSectionTop: () => 0,
      isSelected: () => true,
      clearSelectionState() {},
    },
    SelectionHitTest: { resolveRenderSelectionIds: (_engine, ids) => [...ids] },
    SelectionGeometry: { selectionHandles: () => [], selectionBoundsFromRects: () => null },
    SelectionInteraction: {},
    document: {
      getElementById(id) {
        if (id === 'handles-layer' || id === 'selection-info' || id === 'sb-size') {
          const node = makeNode();
          node.textContent = '';
          node.querySelectorAll = () => [];
          return node;
        }
        return null;
      },
      querySelectorAll() { return []; },
      createElement: () => makeNode(),
    },
    PropertiesEngine: { render() {} },
    FormatEngine: { updateToolbar() {} },
    SectionEngine: { updateSectionsList() {} },
    module: { exports: {} },
    exports: {},
  };

  ctx.globalThis = ctx;
  vm.createContext(ctx);
  const src = fs.readFileSync(path.join(ROOT, 'engines/SelectionOverlay.js'), 'utf8');
  const renderSrc = fs.readFileSync(path.join(ROOT, 'engines/SelectionOverlayRender.js'), 'utf8');
  vm.runInContext(renderSrc, ctx, { filename: 'engines/SelectionOverlayRender.js' });
  vm.runInContext(src, ctx, { filename: 'engines/SelectionOverlay.js' });

  assert.ok(ctx.module.exports, 'SelectionOverlay should load without SelectionOverlayPreview');
  assert.doesNotThrow(() => ctx.module.exports.renderHandles({
    updateSelectionInfo() {},
    attachHandleEvent() {},
    isSelectionOverlayVisible() { return true; },
    isSelectionOverlayFrozen() { return false; },
    enableSelectionOverlay() {},
    resetSelectionOverlay() {},
  }));
});
