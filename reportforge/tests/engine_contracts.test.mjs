import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { ContractGuards } = require('../../engines/EngineCore.js');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('ContractGuards accepts canonical contracts', () => {
  const rect = { left: 1, top: 2, width: 3, height: 4 };
  const selection = new Set(['e1', 'e2']);
  const layout = { id: 'e1', sectionId: 's-ph', x: 1, y: 2, w: 3, h: 4 };
  assert.equal(ContractGuards.assertRectShape(rect, 'test'), rect);
  assert.equal(ContractGuards.assertSelectionState(selection, 'test'), selection);
  assert.equal(ContractGuards.assertLayoutContract(layout, 'test'), layout);
  assert.equal(ContractGuards.assertZoomContract(1.25, 'test'), 1.25);
});

test('ContractGuards fail fast on invalid contracts', () => {
  assert.throws(() => ContractGuards.assertRectShape({ x: 1, y: 2, w: 3, h: 4 }, 'bad-rect'), /INVALID RECT SHAPE/);
  assert.throws(() => ContractGuards.assertSelectionState(['e1'], 'bad-selection'), /INVALID SELECTION STATE/);
  assert.throws(() => ContractGuards.assertLayoutContract({ id: 'e1', x: 1, y: 2, w: 3, h: 4 }, 'bad-layout'), /INVALID LAYOUT CONTRACT/);
  assert.throws(() => ContractGuards.assertZoomContract('1', 'bad-zoom'), /INVALID ZOOM CONTRACT/);
});

test('canonical engines reference contract guards explicitly', () => {
  const files = {
    selection: path.join(ROOT, 'engines/SelectionEngine.js'),
    selectionState: path.join(ROOT, 'engines/SelectionState.js'),
    selectionHitTest: path.join(ROOT, 'engines/SelectionHitTest.js'),
    selectionGeometry: path.join(ROOT, 'engines/SelectionGeometry.js'),
    selectionOverlay: path.join(ROOT, 'engines/SelectionOverlay.js'),
    selectionInteraction: path.join(ROOT, 'engines/SelectionInteraction.js'),
    geometryCore: path.join(ROOT, 'engines/GeometryCore.js'),
    canvasGeometry: path.join(ROOT, 'engines/CanvasGeometry.js'),
    hitTestGeometry: path.join(ROOT, 'engines/HitTestGeometry.js'),
    canvas: path.join(ROOT, 'engines/CanvasLayoutEngine.js'),
    preview: path.join(ROOT, 'engines/PreviewEngine.js'),
    core: path.join(ROOT, 'engines/EngineCore.js'),
    contracts: path.join(ROOT, 'engines/EngineCoreContracts.js'),
  };

  const selection = fs.readFileSync(files.selection, 'utf8');
  const selectionState = fs.readFileSync(files.selectionState, 'utf8');
  const selectionHitTest = fs.readFileSync(files.selectionHitTest, 'utf8');
  const selectionGeometry = fs.readFileSync(files.selectionGeometry, 'utf8');
  const selectionOverlay = fs.readFileSync(files.selectionOverlay, 'utf8');
  const selectionInteraction = fs.readFileSync(files.selectionInteraction, 'utf8');
  const geometryCore = fs.readFileSync(files.geometryCore, 'utf8');
  const canvasGeometry = fs.readFileSync(files.canvasGeometry, 'utf8');
  const hitTestGeometry = fs.readFileSync(files.hitTestGeometry, 'utf8');
  const canvas = fs.readFileSync(files.canvas, 'utf8');
  const preview = fs.readFileSync(files.preview, 'utf8');
  const core = fs.readFileSync(files.core, 'utf8');
  const contracts = fs.readFileSync(files.contracts, 'utf8');

  assert.match(selection, /assertRectShape/);
  assert.match(selection, /assertSelectionState/);
  assert.match(selection, /assertZoomContract/);
  assert.match(selectionState, /selectedElementsFromIds/);
  assert.match(selectionHitTest, /resolveRenderSelectionIds/);
  assert.match(selection, /CanvasGeometry/);
  assert.match(selectionGeometry, /selectionBoundsFromRects/);
  assert.match(selectionGeometry, /selectionHandles/);
  assert.match(selectionOverlay, /renderHandles/);
  assert.match(selectionInteraction, /onMouseMove/);
  assert.match(geometryCore, /function makeRect\(/);
  assert.match(canvasGeometry, /function elementViewRect\(/);
  assert.match(hitTestGeometry, /function handleAt\(/);

  assert.match(canvas, /assertLayoutContract/);
  assert.match(canvas, /assertSelectionState/);
  assert.match(canvas, /assertZoomContract/);

  assert.match(preview, /assertSelectionState/);
  assert.match(preview, /assertLayoutContract/);
  assert.match(preview, /assertZoomContract/);

  assert.match(contracts, /INVALID RECT SHAPE/);
  assert.match(contracts, /INVALID SELECTION STATE/);
  assert.match(contracts, /INVALID LAYOUT CONTRACT/);
  assert.match(contracts, /INVALID ZOOM CONTRACT/);
  assert.doesNotMatch(core, /INVALID RECT SHAPE/);
  assert.doesNotMatch(core, /INVALID SELECTION STATE/);
  assert.doesNotMatch(core, /INVALID LAYOUT CONTRACT/);
  assert.doesNotMatch(core, /INVALID ZOOM CONTRACT/);
});

test('geometry modules stay pure and split by concern', () => {
  const geometryCore = fs.readFileSync(path.join(ROOT, 'engines/GeometryCore.js'), 'utf8');
  const canvasGeometry = fs.readFileSync(path.join(ROOT, 'engines/CanvasGeometry.js'), 'utf8');
  const selectionGeometry = fs.readFileSync(path.join(ROOT, 'engines/SelectionGeometry.js'), 'utf8');
  const hitTestGeometry = fs.readFileSync(path.join(ROOT, 'engines/HitTestGeometry.js'), 'utf8');

  for (const src of [geometryCore, canvasGeometry, selectionGeometry, hitTestGeometry]) {
    assert.doesNotMatch(src, /\bdocument\b/);
    assert.doesNotMatch(src, /\bwindow\b/);
  }

  assert.doesNotMatch(geometryCore, /\bDS\b/);
  assert.doesNotMatch(geometryCore, /\bRenderScheduler\b/);
  assert.doesNotMatch(geometryCore, /\bSelectionOverlay\b/);
  assert.match(canvasGeometry, /function selectionViewRects\(/);
  assert.match(selectionGeometry, /function selectionBoundsFromRects\(/);
  assert.match(selectionGeometry, /function selectionHandles\(/);
  assert.match(selectionGeometry, /function rubberBandRect\(/);
  assert.match(hitTestGeometry, /function handleAt\(/);
  assert.match(hitTestGeometry, /function edgeAt\(/);
});

test('runtime engines do not consume legacy rect keys x/y/w/h', () => {
  const files = [
    path.join(ROOT, 'engines/SelectionEngine.js'),
    path.join(ROOT, 'engines/CanvasLayoutEngine.js'),
    path.join(ROOT, 'engines/PreviewEngine.js'),
  ];

  for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(src, /\bgr\.x\b/);
    assert.doesNotMatch(src, /\bgr\.y\b/);
    assert.doesNotMatch(src, /\bgr\.w\b/);
    assert.doesNotMatch(src, /\bgr\.h\b/);
  }
});

test('HTML host contains all canonical DOM contract IDs', () => {
  const html = fs.readFileSync(path.join(ROOT, 'designer/crystal-reports-designer-v4.html'), 'utf8');
  const required = [
    // canvas stack
    'canvas-layer', 'viewport', 'workspace', 'sections-layer',
    'handles-layer', 'selection-layer', 'guides-layer', 'guide-layer',
    'labels-layer', 'rubber-band', 'insert-ghost', 'field-drop-indicator',
    'preview-layer', 'preview-content',
    // panels
    'field-explorer', 'field-tree', 'properties-panel', 'props-body',
    'sections-list',
    // chrome
    'menubar', 'statusbar', 'sb-msg', 'tabs-row', 'tab-design', 'tab-preview',
    'doc-type-bar', 'ctx-menu',
  ];
  for (const id of required) {
    assert.match(html, new RegExp(`id="${id}"`), `DOM contract missing: #${id}`);
  }
});

test('canonical runtime engines consume selection, zoom and layout from DS', () => {
  const files = {
    selection: path.join(ROOT, 'engines/SelectionEngine.js'),
    canvas: path.join(ROOT, 'engines/CanvasLayoutEngine.js'),
    preview: path.join(ROOT, 'engines/PreviewEngine.js'),
    core: path.join(ROOT, 'engines/EngineCore.js'),
    contracts: path.join(ROOT, 'engines/EngineCoreContracts.js'),
    runtime: path.join(ROOT, 'engines/EngineCoreRuntime.js'),
    routing: path.join(ROOT, 'engines/EngineCoreRouting.js'),
  };

  const selection = fs.readFileSync(files.selection, 'utf8');
  const canvas = fs.readFileSync(files.canvas, 'utf8');
  const preview = fs.readFileSync(files.preview, 'utf8');
  const core = fs.readFileSync(files.core, 'utf8');
  const contracts = fs.readFileSync(files.contracts, 'utf8');
  const runtime = fs.readFileSync(files.runtime, 'utf8');
  const routing = fs.readFileSync(files.routing, 'utf8');

  assert.match(selection, /\bDS\.selection\b/);
  assert.match(selection, /\bDS\.zoom\b/);
  assert.match(selection, /\bDS\.getElementById\b/);

  assert.match(canvas, /\bDS\.selection\b/);
  assert.match(canvas, /\bDS\.zoom\b/);
  assert.match(canvas, /\bDS\.getElementById\b/);

  assert.match(preview, /\bDS\.selection\b/);
  assert.match(preview, /\bDS\.zoom\b/);

  assert.match(contracts, /\bDS\.elements\b/);
  assert.match(contracts, /\bDS\.selection\b/);
  assert.match(contracts, /\bDS\.previewMode\b/);
  assert.match(runtime, /\bDS\.selection\b/);
  assert.match(runtime, /\bDS\.zoom\b/);
  assert.match(runtime, /\bDS\.elements\b/);
  assert.match(routing, /\bDS\.previewMode\b/);
  assert.match(routing, /\bDS\.getSelectedElements\b/);
  assert.doesNotMatch(core, /\bDS\.selection\b/);
  assert.doesNotMatch(core, /\bDS\.elements\b/);
});
