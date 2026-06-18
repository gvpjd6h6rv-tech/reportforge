import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('PreviewEngineRenderer refreshes selection overlay through a preview bridge, not SelectionEngine مباشرة', () => {
  const rendererSource = fs.readFileSync('engines/PreviewEngineRenderer.js', 'utf8');
  const engineSource = fs.readFileSync('engines/SelectionEngine.js', 'utf8');

  assert.match(
    rendererSource,
    /dispatchEvent\(\s*new\s+CustomEvent\(\s*['"]rf-preview-rendered['"]/,
    'PreviewEngineRenderer must publish a preview-rendered bridge event'
  );
  assert.doesNotMatch(
    rendererSource,
    /SelectionEngine\.renderHandles\s*\(/,
    'PreviewEngineRenderer must not call SelectionEngine.renderHandles() directly'
  );
  assert.match(
    engineSource,
    /rf-preview-rendered/,
    'SelectionEngine must subscribe to the preview-rendered bridge event'
  );
  assert.match(
    engineSource,
    /SelectionEngine\.renderHandles\s*\(/,
    'SelectionEngine bridge handler must call SelectionEngine.renderHandles()'
  );
});

test('PreviewEngineRenderer bridge event triggers selection rerender at runtime', async () => {
  const events = [];
  let selectionRenders = 0;
  let previewOverlayVisible = false;

  const context = {
    console,
    CustomEvent: class CustomEvent {
      constructor(type, init = {}) {
        this.type = type;
        this.detail = init.detail;
      }
    },
    document: {
      listeners: new Map(),
      createElement(tag) {
        return {
          tagName: String(tag).toUpperCase(),
          className: '',
          style: {},
          textContent: '',
          innerHTML: '',
          appendChild() {},
          replaceChildren() {},
        };
      },
      addEventListener(type, handler) {
        this.listeners.set(type, handler);
      },
      dispatchEvent(event) {
        events.push(event.type);
        const handler = this.listeners.get(event.type);
        if (handler) handler(event);
        return true;
      },
      getElementById(id) {
        if (id === 'preview-content') {
          return {
            style: {},
            replaceChildren() {},
            appendChild() {},
            querySelectorAll() { return []; },
          };
        }
        return null;
      },
    },
    PreviewEngineContracts: {
      assertSelectionState() {},
      assertZoomContract() {},
      assertPreviewDomContract() {},
    },
    PreviewEngineRendererLayout: {
      _previewPageWidth() { return 100; },
      _previewPageHeight() { return 200; },
      _preparePreviewStageWidth() {},
      _applyCleanHtml() {},
      _resetPreviewStageWidth() {},
    },
    PreviewEngineMode: {
      isActive() { return true; },
      enableSelectionOverlay() { previewOverlayVisible = true; },
      isSelectionOverlayVisible() { return previewOverlayVisible; },
    },
    PreviewEngineData: { renderWithData() { return '<div></div>'; } },
    DS: { zoom: 1, previewMode: true, selection: new Set(['e101']), getTotalHeight() { return 0; } },
    fetch: async () => ({ ok: true, text: async () => '<div></div>' }),
    module: { exports: {} },
  };

  context.window = context;
  context.global = context;
  context.globalThis = context;
  vm.createContext(context);

  vm.runInContext(fs.readFileSync('engines/SelectionEngine.js', 'utf8'), context, { filename: 'engines/SelectionEngine.js' });
  const SelectionEngine = context.module.exports;
  context.SelectionEngine = SelectionEngine;
  vm.runInContext(fs.readFileSync('engines/PreviewEngineRenderer.js', 'utf8'), context, { filename: 'engines/PreviewEngineRenderer.js' });
  SelectionEngine.renderHandles = () => { selectionRenders += 1; };
  SelectionEngine.enableSelectionOverlay();

  await context.window.PreviewEngineRenderer.refresh();

  assert.deepStrictEqual(events, ['rf-preview-rendered']);
  assert.equal(selectionRenders, 1, 'selection rerender must be triggered once from preview bridge');
});

test('late rf-preview-rendered during preview hide does not rearm the overlay', async () => {
  let selectionRenders = 0;
  let previewOverlayVisible = false;
  let previewActive = true;
  let previewHiding = false;

  const context = {
    console,
    CustomEvent: class CustomEvent {
      constructor(type, init = {}) {
        this.type = type;
        this.detail = init.detail;
      }
    },
    document: {
      listeners: new Map(),
      addEventListener(type, handler) {
        this.listeners.set(type, handler);
      },
      dispatchEvent(event) {
        const handler = this.listeners.get(event.type);
        if (handler) handler(event);
        return true;
      },
    },
    PreviewEngineMode: {
      isActive() { return previewActive; },
      isSelectionOverlayTransitioningOut() { return previewHiding; },
      enableSelectionOverlay() { previewOverlayVisible = true; },
      isSelectionOverlayVisible() { return previewOverlayVisible; },
    },
    DS: { zoom: 1, previewMode: true, selection: new Set(['e101']) },
    module: { exports: {} },
  };

  context.window = context;
  context.global = context;
  context.globalThis = context;
  vm.createContext(context);

  vm.runInContext(fs.readFileSync('engines/SelectionEngine.js', 'utf8'), context, { filename: 'engines/SelectionEngine.js' });
  const SelectionEngine = context.module.exports;
  SelectionEngine.renderHandles = () => { selectionRenders += 1; };

  previewOverlayVisible = false;
  previewActive = false;
  previewHiding = true;
  context.document.dispatchEvent(new context.CustomEvent('rf-preview-rendered', {
    detail: { source: 'adversarial-hide-race' },
  }));

  assert.equal(selectionRenders, 0, 'late preview-rendered must not rerender selection during hide');
  assert.equal(previewOverlayVisible, false, 'late preview-rendered must not re-enable overlay during hide');
});
