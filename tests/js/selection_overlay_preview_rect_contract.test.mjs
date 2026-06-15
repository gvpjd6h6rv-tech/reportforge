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
    this.parentNode = null;
    this.firstChild = null;
    this.className = '';
    this.dataset = {};
    this._rect = rect;
    this.style = {
      values: {},
      setProperty(name, value) {
        this.values[name] = value;
      },
    };
    this.classList = {
      toggle: () => undefined,
    };
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    this.firstChild = this.children[0] || null;
    return child;
  }

  removeChild(child) {
    this.children = this.children.filter((item) => item !== child);
    child.parentNode = null;
    this.firstChild = this.children[0] || null;
    return child;
  }

  querySelector(selector) {
    if (selector === ':scope > .preview-selection-layer' || selector === '.preview-selection-layer') {
      return this.children.find((child) => child.className === 'preview-selection-layer') || null;
    }
    return null;
  }

  querySelectorAll(selector) {
    if (selector.includes('.preview-selection-layer')) {
      return this.children.filter((child) => child.className === 'preview-selection-layer');
    }
    return [];
  }

  getBoundingClientRect() {
    if (this._rect) return this._rect;
    if (this.className === 'preview-selection-layer') {
      return hitLayer.getBoundingClientRect();
    }
    return { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 };
  }
}

const handlesLayer = new FakeNode({ left: 999, top: 999, width: 800, height: 1000 });

const previewContent = new FakeNode({ left: 100, top: 50, width: 800, height: 0 });
const hitLayer = new FakeNode({ left: 120, top: 80, width: 800, height: 0 });
hitLayer.style.transform = 'translate(10px, 15px)';
hitLayer.style.transformOrigin = 'top left';
hitLayer.style.opacity = '0';
previewContent.appendChild(hitLayer);

const previewNode = new FakeNode({ left: 170, top: 120, width: 200, height: 100 });
previewNode.dataset.originId = selectedId;

global.getComputedStyle = (node) => ({
  transform: node?.style?.transform || 'none',
  transformOrigin: node?.style?.transformOrigin || 'top left',
});

global.document = {
  getElementById(id) {
    if (id === 'handles-layer') return handlesLayer;
    return null;
  },
  querySelector(selector) {
    if (selector === '#preview-content') return previewContent;
    if (selector === '#preview-content .preview-hit-layer') return hitLayer;
    if (selector === '#preview-content > .preview-selection-layer') {
      return previewContent.querySelector(':scope > .preview-selection-layer');
    }
    if (selector === '#preview-content .preview-hit-layer .preview-selection-layer') {
      return hitLayer.querySelector('.preview-selection-layer');
    }
    return null;
  },
  querySelectorAll(selector) {
    if (selector.includes('.preview-selection-layer')) {
      return [
        ...previewContent.children.filter((child) => child.className === 'preview-selection-layer'),
        ...hitLayer.children.filter((child) => child.className === 'preview-selection-layer'),
      ];
    }
    if (selector.includes('preview-hit-layer')) return [previewNode];
    if (selector === '.cr-element') return [previewNode];
    if (selector === '.cr-section') return [];
    return [];
  },
  createElement() {
    return new FakeNode();
  },
};

global.DS = {
  previewMode: true,
  zoom: 2,
};

global.RF = {
  Geometry: {
    invalidate: () => undefined,
    zoom: () => 2,
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
  isSelected: (id) => id === selectedId,
};

global.SelectionHitTest = {
  resolveRenderSelectionIds: (_engine, selectedIds) => selectedIds,
};

global.SelectionGeometry = {
  selectionHandles: () => [],
};

let previewOverlayEnabled = false;

global.PreviewEngineMode = {
  enableSelectionOverlay: () => {
    previewOverlayEnabled = true;
  },
  isSelectionOverlayVisible: () => false,
};

const { default: SelectionOverlayModule } = await import('../../engines/SelectionOverlay.js');
const SelectionOverlay = SelectionOverlayModule || global.SelectionOverlay;

const engine = {
  updateSelectionInfo: () => undefined,
  attachHandleEvent: () => undefined,
};

SelectionOverlay.renderHandles(engine);

assert.equal(
  previewOverlayEnabled,
  true,
  'una selección en Preview debe habilitar el overlay aunque inicialmente esté oculto'
);

const previewSelectionLayer = previewContent.querySelector(':scope > .preview-selection-layer');
const forbiddenChildLayer = hitLayer.querySelector('.preview-selection-layer');

assert.ok(previewSelectionLayer, 'preview-selection-layer debe existir como hijo directo de preview-content');
assert.equal(forbiddenChildLayer, null, 'preview-selection-layer no debe vivir dentro de preview-hit-layer opacity:0');
assert.equal(handlesLayer.children.length, 0, 'en preview no debe dibujar selección en handles-layer');
assert.equal(previewSelectionLayer.children.length, 1);

assert.equal(previewSelectionLayer.style.opacity, '1');
assert.equal(previewSelectionLayer.style.visibility, 'visible');
assert.equal(previewSelectionLayer.style.display, 'block');
assert.equal(previewSelectionLayer.style.transform, hitLayer.style.transform);
assert.equal(previewSelectionLayer.style.transformOrigin, 'top left');

const box = previewSelectionLayer.children[0];

assert.equal(box.className, 'sel-box');
assert.equal(box.style.values['--sel-x'], '25px');
assert.equal(box.style.values['--sel-y'], '20px');
assert.equal(box.style.values['--sel-w'], '100px');
assert.equal(box.style.values['--sel-h'], '50px');

assert.equal(box.style.position, 'absolute');
assert.equal(box.style.left, '25px');
assert.equal(box.style.top, '20px');
assert.equal(box.style.width, '100px');
assert.equal(box.style.height, '50px');
assert.equal(box.style.boxSizing, 'border-box');
assert.equal(box.style.border, '1px solid var(--cr-sel-bdr, #0066CC)');
assert.equal(box.style.background, 'transparent');
assert.equal(box.style.pointerEvents, 'none');

console.log('selection overlay preview rect contract: PASS');
