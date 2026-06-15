import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source = fs.readFileSync('engines/PreviewEngineRenderer.js', 'utf8');

class FakeNode {
  constructor(className = '', rect = null) {
    this.className = className;
    this.children = [];
    this.style = {};
    this.textContent = '';
    this.id = '';
    this.isConnected = false;
    this._innerHTML = '';
    this._rect = rect || { left: 0, top: 0, width: 0, height: 0 };
    this._rptPage = null;
  }

  appendChild(child) {
    child.isConnected = true;
    this.children.push(child);
    return child;
  }

  replaceChildren(...nodes) {
    this.children = [];
    for (const node of nodes) this.appendChild(node);
  }

  querySelector(selector) {
    if (selector === '.rpt-page') return this._rptPage;
    if (selector.startsWith('.')) {
      const wanted = selector.slice(1);
      return this.children.find((child) => child.className === wanted) || null;
    }
    return null;
  }

  querySelectorAll(selector) {
    if (selector === 'style') return [new FakeNode('style')];
    return [];
  }

  getBoundingClientRect() {
    return this._rect;
  }

  set innerHTML(value) {
    this._innerHTML = value;
    if (this.className === 'preview-render-layer') {
      this._rptPage = new FakeNode('rpt-page', {
        left: 130,
        top: 90,
        width: 300,
        height: 400,
      });
    }
  }

  get innerHTML() {
    return this._innerHTML;
  }
}

const previewContent = new FakeNode('preview-content', {
  left: 100,
  top: 40,
  width: 500,
  height: 700,
});

const sandbox = {
  window: {},
  document: {
    head: new FakeNode('head'),
    getElementById(id) {
      if (id === 'preview-content') return previewContent;
      return null;
    },
    createElement(tagName) {
      return new FakeNode(tagName);
    },
  },
  DOMParser: class {
    parseFromString() {
      return {
        head: new FakeNode('head'),
        body: {
          innerHTML: '<div class="rpt-page"></div>',
        },
      };
    }
  },
  fetch: async () => ({
    ok: true,
    text: async () => '<html><head><style></style></head><body><div class="rpt-page"></div></body></html>',
  }),
  DS: {
    zoom: 2,
    previewMode: true,
    _sampleData: {},
    layout: {},
    sections: [],
    getTotalHeight: () => 0,
  },
  CFG: {
    PAGE_W: 671,
  },
  console,
};

sandbox.window.PreviewEngineContracts = {
  assertSelectionState: () => undefined,
  assertZoomContract: () => undefined,
  assertPreviewDomContract: () => undefined,
};

sandbox.window.PreviewEngineData = {
  renderWithData: () => '<div class="pv-page"></div>',
};

sandbox.window.PreviewEngineMode = {
  isActive: () => true,
};

sandbox.window.RF_UI_TRACE = null;
sandbox.globalThis = sandbox;

vm.createContext(sandbox);
vm.runInContext(source, sandbox);

await sandbox.window.PreviewEngineRenderer.refresh();

const renderLayer = previewContent.querySelector('.preview-render-layer');
const hitLayer = previewContent.querySelector('.preview-hit-layer');

assert.equal(previewContent.style.position, 'relative');
assert.equal(renderLayer.style.position, 'relative');
assert.equal(hitLayer.style.position, 'absolute');
assert.equal(hitLayer.style.left, '0px');
assert.equal(hitLayer.style.top, '0px');
assert.equal(hitLayer.style.width, '100%');
assert.equal(hitLayer.style.height, '0px');
assert.equal(hitLayer.style.overflow, 'visible');
assert.equal(hitLayer.style.transformOrigin, 'top left');
assert.equal(hitLayer.style.transform, 'translate(15px, 25px)');

console.log('preview engine hit-layer geometry contract: PASS');
