import assert from 'node:assert/strict';

global.window = {};

const selectedId = 'rh-fiscal-box';
const selectedElement = {
  id: selectedId,
  sectionId: 's-rh',
  x: 354,
  y: 14,
  w: 308,
  h: 230,
};

class FakeNode {
  constructor(rect = null) {
    this.children = [];
    this.firstChild = null;
    this.className = '';
    this.dataset = {};
    this.style = {
      values: {},
      setProperty(name, value) {
        this.values[name] = value;
      },
    };
    this._rect = rect;
    this.classList = {
      toggle: () => undefined,
    };
  }

  appendChild(child) {
    this.children.push(child);
    this.firstChild = this.children[0] || null;
    return child;
  }

  removeChild(child) {
    this.children = this.children.filter((item) => item !== child);
    this.firstChild = this.children[0] || null;
    return child;
  }

  getBoundingClientRect() {
    return this._rect || { left: 0, top: 0, width: 0, height: 0 };
  }
}

const handlesLayer = new FakeNode({ left: 100, top: 50, width: 800, height: 1000 });
const previewNode = new FakeNode({ left: 150, top: 90, width: 200, height: 100 });
previewNode.dataset.originId = selectedId;

global.document = {
  getElementById(id) {
    if (id === 'handles-layer') return handlesLayer;
    return null;
  },
  querySelectorAll(selector) {
    if (selector.includes('preview-hit-layer')) return [previewNode];
    if (selector === '.cr-element') return [];
    if (selector === '.cr-section') return [];
    return [];
  },
  createElement() {
    return new FakeNode();
  },
};

global.DS = {
  previewMode: true,
};

global.RF = {
  Geometry: {
    invalidate: () => undefined,
  },
};

global.SelectionEngineContracts = {
  assertSelectionState: () => undefined,
  assertLayoutContract: () => undefined,
  assertRectShape: () => undefined,
  assertZoomContract: () => undefined,
};

global.SelectionState = {
  selectedIds: () => new Set([selectedId]),
  selectedElementsFromIds: () => [selectedElement],
  getElementById: () => selectedElement,
  getSectionTop: () => 0,
};

global.SelectionHitTest = {
  resolveRenderSelectionIds: (_engine, selectedIds) => selectedIds,
};

global.SelectionGeometry = {
  selectionHandles: () => [],
};

global.PreviewEngineMode = {
  isSelectionOverlayVisible: () => true,
};

const { default: SelectionOverlayModule } = await import('../../engines/SelectionOverlay.js');
const SelectionOverlay = SelectionOverlayModule || global.SelectionOverlay;

const engine = {
  updateSelectionInfo: () => undefined,
  attachHandleEvent: () => undefined,
};

SelectionOverlay.renderHandles(engine);

assert.equal(handlesLayer.children.length, 1);
const box = handlesLayer.children[0];

assert.equal(box.className, 'sel-box');
assert.equal(box.style.values['--sel-x'], '50px');
assert.equal(box.style.values['--sel-y'], '40px');
assert.equal(box.style.values['--sel-w'], '200px');
assert.equal(box.style.values['--sel-h'], '100px');

console.log('selection overlay preview rect contract: PASS');
