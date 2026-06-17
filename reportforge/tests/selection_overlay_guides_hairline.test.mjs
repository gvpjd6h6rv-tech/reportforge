import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function makeStyle() {
  const values = new Map();
  return {
    setProperty(name, value) {
      values.set(name, value);
    },
    getPropertyValue(name) {
      return values.get(name) || '';
    },
  };
}

function makeNode(tag = 'div') {
  const node = {
    tagName: tag.toUpperCase(),
    className: '',
    dataset: {},
    style: makeStyle(),
    children: [],
    firstChild: null,
    appendChild(child) {
      this.children.push(child);
      this.firstChild = this.children[0] || null;
      return child;
    },
    removeChild(child) {
      this.children = this.children.filter((item) => item !== child);
      this.firstChild = this.children[0] || null;
    },
  };
  return node;
}

function loadSelectionOverlayRuntime({ zoom = 4 } = {}) {
  const handlesLayer = makeNode('div');
  const element = {
    id: 'el-1',
    type: 'text',
    x: 68,
    y: 128,
    w: 160,
    h: 12,
    sectionId: 's1',
  };

  const context = {
    console,
    window: {},
    DS: {
      previewMode: false,
      selection: new Set(['el-1']),
      zoom,
    },
    RF: {
      Geometry: {
        zoom: () => zoom,
        invalidate() {},
      },
    },
    document: {
      createElement: () => makeNode('div'),
      getElementById: (id) => (id === 'handles-layer' ? handlesLayer : null),
      querySelectorAll: () => [],
    },
    RenderScheduler: {
      allowsDomWrite: () => true,
      assertDomWriteAllowed() {},
    },
    SelectionEngineContracts: {
      assertSelectionState() {},
      assertLayoutContract() {},
      assertRectShape() {},
      assertZoomContract() {},
    },
    SelectionState: {
      selectedIds: () => new Set(['el-1']),
      selectedElementsFromIds: () => [element],
      getElementById: (id) => (id === 'el-1' ? element : null),
      getSectionTop: () => 0,
      isSelected: (id) => id === 'el-1',
    },
    SelectionHitTest: {
      resolveRenderSelectionIds: (_engine, ids) => [...ids],
    },
    SelectionGeometry: {
      selectionHandles: () => [],
    },
    module: { exports: {} },
    exports: {},
  };

  context.globalThis = context;
  vm.createContext(context);

  const previewSource = fs.readFileSync('engines/SelectionOverlayPreview.js', 'utf8');
  vm.runInContext(previewSource, context, { filename: 'engines/SelectionOverlayPreview.js' });

  const source = fs.readFileSync('engines/SelectionOverlay.js', 'utf8');
  vm.runInContext(`${source}\nglobalThis.__SelectionOverlay = SelectionOverlay;`, context, {
    filename: 'engines/SelectionOverlay.js',
  });

  return {
    overlay: context.__SelectionOverlay,
    handlesLayer,
  };
}

test('SelectionOverlay renders selection guides as zoom-stable hairlines aligned to sel-box edges', () => {
  const runtime = loadSelectionOverlayRuntime({ zoom: 4 });

  runtime.overlay.renderHandles({
    _drag: { type: 'move' },
    updateSelectionInfo() {},
    attachHandleEvent() {},
  });

  const guides = runtime.handlesLayer.children.filter((node) =>
    String(node.className).includes('selection-guide')
  );

  assert.equal(guides.length, 4);

  const horizontal = guides.filter((node) => String(node.className).includes('selection-guide-h'));
  const vertical = guides.filter((node) => String(node.className).includes('selection-guide-v'));

  assert.equal(horizontal.length, 2);
  assert.equal(vertical.length, 2);

  assert.deepEqual(
    horizontal.map((node) => node.style.top),
    ['128px', '139px'],
    'top/bottom guides must align to sel-box border starts'
  );

  assert.deepEqual(
    vertical.map((node) => node.style.left),
    ['68px', '227px'],
    'left/right guides must align to sel-box border starts'
  );

  for (const node of horizontal) {
    assert.equal(node.style.height, '0.25px');
  }

  for (const node of vertical) {
    assert.equal(node.style.width, '0.25px');
  }
});
