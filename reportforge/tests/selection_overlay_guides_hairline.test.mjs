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
    querySelector(sel) {
      const cls = sel.replace('.', '');
      return this.children.find((c) => String(c.className).split(' ').includes(cls)) || null;
    },
    remove() {},
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
  context.window = context;
  vm.createContext(context);

  // Load order matches designer/crystal-reports-designer-v4.html: the split
  // helper/style modules must exist before the files that call into them.
  const styleSource = fs.readFileSync('engines/PreviewOverlayStyle.js', 'utf8');
  vm.runInContext(styleSource, context, { filename: 'engines/PreviewOverlayStyle.js' });
  const layersSource = fs.readFileSync('engines/SelectionOverlayPreviewLayers.js', 'utf8');
  vm.runInContext(layersSource, context, { filename: 'engines/SelectionOverlayPreviewLayers.js' });
  const previewSource = fs.readFileSync('engines/SelectionOverlayPreview.js', 'utf8');
  vm.runInContext(previewSource, context, { filename: 'engines/SelectionOverlayPreview.js' });
  const renderHelpersSource = fs.readFileSync('engines/SelectionOverlayRenderHelpers.js', 'utf8');
  vm.runInContext(renderHelpersSource, context, { filename: 'engines/SelectionOverlayRenderHelpers.js' });
  const renderSource = fs.readFileSync('engines/SelectionOverlayRender.js', 'utf8');
  vm.runInContext(renderSource, context, { filename: 'engines/SelectionOverlayRender.js' });

  const source = fs.readFileSync('engines/SelectionOverlay.js', 'utf8');
  vm.runInContext(`${source}\nglobalThis.__SelectionOverlay = SelectionOverlay;`, context, {
    filename: 'engines/SelectionOverlay.js',
  });

  return {
    overlay: context.__SelectionOverlay,
    handlesLayer,
  };
}

// RF-PREVIEW-THIN-OVERLAY-1: proven via raw pixel raster (tools/diagnostics/
// rf-bbox-ink/rf_thickness_raster_probe.mjs) that a div's own height/width
// floors to a whole device pixel pre-transform in Chromium — the guide used
// to declare "0.25px" height/width directly on itself and still painted a
// flat 1px-at-100%/4px-at-400% band, no thinner than an unfixed flat 1px.
// The element itself is now a small (2*GUIDE_HIT_PAD) hit-box straddling the
// target edge; the actual hairline is a background-gradient centered inside
// it (background-size DOES survive the transform with true sub-pixel
// anti-aliasing) — so top/left below are edge-GUIDE_HIT_PAD, not the raw
// edge, and height/width are the hit-box size, not the hairline width.
const GUIDE_HIT_PAD = 3;

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

  // el-1 is { x:68, y:128, w:160, h:12 } -> outer edges: top=128, bottom=140
  // (128+12), left=68, right=228 (68+160). All four guides anchor to this
  // SAME outer/visual edge convention — bottom/right must NOT subtract a
  // border-width inset (that was the bug: it landed them 1 unit inside the
  // box instead of exactly on its visible line).
  assert.deepEqual(
    horizontal.map((node) => node.style.top),
    [`${128 - GUIDE_HIT_PAD}px`, `${140 - GUIDE_HIT_PAD}px`],
    'top/bottom guide hit-boxes must straddle the sel-box OUTER edge, no inset'
  );

  assert.deepEqual(
    vertical.map((node) => node.style.left),
    [`${68 - GUIDE_HIT_PAD}px`, `${228 - GUIDE_HIT_PAD}px`],
    'left/right guide hit-boxes must straddle the sel-box OUTER edge, no inset'
  );

  for (const node of horizontal) {
    assert.equal(node.style.height, `${GUIDE_HIT_PAD * 2}px`);
    assert.match(node.style.background, /center \/ 100% 0\.125px no-repeat/, 'hairline gradient at zoom=4 (0.5px visual / 4)');
  }

  for (const node of vertical) {
    assert.equal(node.style.width, `${GUIDE_HIT_PAD * 2}px`);
    assert.match(node.style.background, /center \/ 0\.125px 100% no-repeat/, 'hairline gradient at zoom=4 (0.5px visual / 4)');
  }
});
