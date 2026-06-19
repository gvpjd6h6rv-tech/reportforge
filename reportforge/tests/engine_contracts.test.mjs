import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { ContractGuards } = require('../../engines/EngineCore.js');
const { createEngineCoreContractAsserts } = require('../../engines/EngineCoreContractAsserts.js');
const { createEngineCoreContractSnapshots } = require('../../engines/EngineCoreContractSnapshots.js');
const { createEngineCoreContractValidators } = require('../../engines/EngineCoreContractValidators.js');
const { createEngineCoreContracts } = require('../../engines/EngineCoreContracts.js');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function makeFailureRecorder() {
  const calls = [];
  return {
    calls,
    contractFailure(kind, source, detail) {
      calls.push({ kind, source, detail });
      throw new Error(`${kind} (${source})`);
    },
  };
}

function makeDoc(map = {}) {
  return {
    querySelectorAll(selector) {
      return map.querySelectorAll ? map.querySelectorAll(selector) : (map[selector] || []);
    },
    querySelector(selector) {
      return map.querySelector ? map.querySelector(selector) : (map[selector] || null);
    },
    getElementById(id) {
      return map.getElementById ? map.getElementById(id) : (map[`#${id}`] || null);
    },
  };
}

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

test('EngineCore contract split composes the public API unchanged', () => {
  const ds = {
    sections: [{ id: 's1', stype: 'det', height: 10, visible: true, label: 'Detail', abbr: 'DET' }],
    elements: [{ id: 'e1', sectionId: 's1', type: 'text', x: 1, y: 2, w: 3, h: 4, zIndex: 2 }],
    selection: new Set(['e1']),
    previewMode: false,
  };
  const doc = makeDoc({
    querySelectorAll(selector) {
      if (selector === '.cr-section[data-section-id]') return [{}, {}];
      if (selector === '.cr-element[data-id]') return [{ dataset: { id: 'e1' } }];
      if (selector === '.cr-element.selected[data-id]') return [{ dataset: { id: 'e1' } }];
      if (selector === '#handles-layer .sel-box') return [];
      return [];
    },
    querySelector(selector) {
      if (selector === '.cr-section[data-section-id="s1"]') {
        return { style: { height: '10px', width: '100px', display: '' } };
      }
      return null;
    },
    getElementById(id) {
      if (id === 'canvas-layer') {
        return { style: { width: '100px', height: '10px', maxHeight: '10px' } };
      }
      return null;
    },
  });
  const runtimeServices = { getOwner() { return 'CanvasLayoutEngine'; } };
  const contracts = createEngineCoreContracts({
    DS: ds,
    doc,
    win: { SelectionEngine: { __active: true }, PreviewEngineV19: { __active: true } },
    runtimeServices,
    getEngine(name) {
      if (name === 'SectionLayoutEngine') return { getLayoutContract: () => ({ ready: true, sections: ds.sections.map((sec) => ({ ...sec, top: 0 })), totalHeight: 10, pageWidth: 100 }) };
      if (name === 'CanvasLayoutEngine') return { getLayoutContract: () => ({ ready: true, width: 100, height: 10, minHeight: 0, maxHeight: 10 }) };
      if (name === 'WorkspaceScrollEngine') return { getLayoutContract: () => ({ ready: true, scaledW: 100, scaledH: 10, padding: 0 }) };
      return null;
    },
    contractFailure: (kind, source, detail) => { throw new Error(`${kind} (${source}) ${JSON.stringify(detail || null)}`); },
  });

  assert.deepEqual([
    contracts.assertRectShape,
    contracts.assertSelectionState,
    contracts.assertLayoutContract,
    contracts.assertZoomContract,
    contracts.snapshotSections,
    contracts.snapshotElements,
    contracts.snapshotContracts,
    contracts.summarizeContracts,
    contracts.validateSectionContract,
    contracts.validateCanvasContract,
    contracts.validateScrollContract,
    contracts.validateCanonicalRuntime,
    contracts.validateOrphanNodes,
  ].map((fn) => typeof fn), Array(13).fill('function'));
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
    enterprise: path.join(ROOT, 'reportforge/core/render/engines/enterprise_engine.py'),
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
  const enterprise = fs.readFileSync(files.enterprise, 'utf8');
  const core = fs.readFileSync(files.core, 'utf8');
  const contracts = fs.readFileSync(files.contracts, 'utf8');
  const contractAsserts = fs.readFileSync(path.join(ROOT, 'engines/EngineCoreContractAsserts.js'), 'utf8');
  const contractSnapshots = fs.readFileSync(path.join(ROOT, 'engines/EngineCoreContractSnapshots.js'), 'utf8');
  const contractValidators = fs.readFileSync(path.join(ROOT, 'engines/EngineCoreContractValidators.js'), 'utf8');

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
  assert.match(enterprise, /from \.enterprise_engine_data import/);
  assert.match(enterprise, /from \.enterprise_engine_layout import/);
  assert.match(enterprise, /from \.enterprise_engine_shared import/);
  assert.match(enterprise, /EnterpriseHtmlEngine = EnterpriseEngine/);
  assert.doesNotMatch(enterprise, /return render_enterprise\(/);
  assert.doesNotMatch(enterprise, /return render_preview\(/);
  assert.doesNotMatch(enterprise, /def build_css\(/);
  assert.doesNotMatch(enterprise, /def build_pages\(/);
  assert.doesNotMatch(enterprise, /def build_body_rows\(/);
  assert.doesNotMatch(enterprise, /def build_page\(/);
  assert.doesNotMatch(enterprise, /def build_row\(/);
  assert.doesNotMatch(enterprise, /def build_section\(/);

  assert.match(contractAsserts, /INVALID RECT SHAPE/);
  assert.match(contractAsserts, /INVALID SELECTION STATE/);
  assert.match(contractAsserts, /INVALID LAYOUT CONTRACT/);
  assert.match(contractAsserts, /INVALID ZOOM CONTRACT/);
  assert.match(contractSnapshots, /snapshotSections/);
  assert.match(contractSnapshots, /snapshotElements/);
  assert.match(contractValidators, /validateSectionContract/);
  assert.match(contractValidators, /validateCanonicalRuntime/);
  assert.doesNotMatch(core, /INVALID RECT SHAPE/);
  assert.doesNotMatch(core, /INVALID SELECTION STATE/);
  assert.doesNotMatch(core, /INVALID LAYOUT CONTRACT/);
  assert.doesNotMatch(core, /INVALID ZOOM CONTRACT/);
});

test('snapshot builders return canonical data and summaries', () => {
  const ds = {
    sections: [
      { id: 's1', stype: 'det', height: 10, visible: false, label: 'Detail', abbr: 'DET' },
      { id: 's2', stype: 'hdr', height: 20, visible: true },
    ],
    elements: [
      { id: 'e1', sectionId: 's1', type: 'text', x: 1, y: 2, w: 3, h: 4, zIndex: 7 },
      { id: 'e2', sectionId: 's2', type: 'box', x: 5, y: 6, w: 7, h: 8 },
    ],
  };
  const seenLayouts = [];
  const snapshots = createEngineCoreContractSnapshots({
    DS: ds,
    getEngine(name) {
      if (name === 'SectionLayoutEngine') return { getLayoutContract: () => ({ ready: true, sections: ds.sections, totalHeight: 30, pageWidth: 100 }) };
      if (name === 'CanvasLayoutEngine') return { getLayoutContract: () => ({ ready: true, width: 100, height: 30, minHeight: 0, maxHeight: 30 }) };
      if (name === 'WorkspaceScrollEngine') return { getLayoutContract: () => ({ ready: true, scaledW: 100, scaledH: 30, padding: 4 }) };
      return null;
    },
    assertLayoutContract(el, source) {
      seenLayouts.push([source, el.id]);
      return el;
    },
  });

  assert.deepEqual(snapshots.snapshotSections(), [
    { id: 's1', stype: 'det', height: 10, visible: false, label: 'Detail', abbr: 'DET' },
    { id: 's2', stype: 'hdr', height: 20, visible: true, label: '', abbr: '' },
  ]);
  assert.deepEqual(snapshots.snapshotElements(), [
    { id: 'e1', sectionId: 's1', type: 'text', x: 1, y: 2, w: 3, h: 4, zIndex: 7 },
    { id: 'e2', sectionId: 's2', type: 'box', x: 5, y: 6, w: 7, h: 8, zIndex: 0 },
  ]);
  assert.deepEqual(seenLayouts, [
    ['EngineCore._snapshotElements', 'e1'],
    ['EngineCore._snapshotElements', 'e2'],
  ]);

  const contracts = snapshots.snapshotContracts();
  assert.equal(contracts.section.ready, true);
  assert.equal(contracts.canvas.width, 100);
  assert.equal(contracts.scroll.padding, 4);

  assert.deepEqual(snapshots.summarizeContracts(contracts), {
    section: { ready: true, count: 2, totalHeight: 30, pageWidth: 100 },
    canvas: { ready: true, width: 100, height: 30 },
    scroll: { ready: true, scaledW: 100, scaledH: 30, padding: 4 },
  });
});

test('section, canvas, scroll and orphan validators emit stable issue codes', () => {
  const doc = makeDoc({
    querySelectorAll(selector) {
      if (selector === '.cr-section[data-section-id]') {
        return [
          { dataset: { sectionId: 's1' } },
          { dataset: { sectionId: 's2' } },
        ];
      }
      if (selector === '.cr-element[data-id]') return [{ dataset: { id: 'ghost' } }];
      return [];
    },
    querySelector(selector) {
      if (selector === '.cr-section[data-section-id="s1"]') return { style: { height: '12px', width: '90px', display: '' } };
      if (selector === '.cr-section[data-section-id="s2"]') return { style: { height: '20px', width: '90px', display: 'none' } };
      return null;
    },
    getElementById(id) {
      if (id === 'canvas-layer') return { style: { width: '90px', height: '35px', maxHeight: '40px' } };
      return null;
    },
  });
  const validators = createEngineCoreContractValidators({
    DS: {
      elements: [{ id: 'e1', sectionId: null, type: 'text', x: 0, y: 0, w: 1, h: 1 }],
      selection: new Set(),
    },
    doc,
    finite: (value) => typeof value === 'number' && Number.isFinite(value),
    same: (a, b, eps = 0.5) => Math.abs((a || 0) - (b || 0)) <= eps,
    parsePx: (value) => parseFloat(value || '0'),
  });

  const sectionIssues = [];
  validators.validateSectionContract({
    section: {
      ready: true,
      pageWidth: 100,
      totalHeight: 40,
      sections: [
        { id: 's1', top: 0, height: 10, visible: true },
        { id: 's2', top: 15, height: 20, visible: true },
      ],
    },
  }, sectionIssues);
  assert.ok(sectionIssues.some((issue) => issue.code === 'section.dom.height'));
  assert.ok(sectionIssues.some((issue) => issue.code === 'section.band.gap'));
  assert.ok(sectionIssues.some((issue) => issue.code === 'section.totalHeight.invalid'));
  assert.deepEqual(sectionIssues.find((issue) => issue.code === 'section.dom.height').meta, {
    id: 's1',
    contractHeight: 10,
    domHeight: 12,
  });

  const canvasIssues = [];
  validators.validateCanvasContract({
    section: { ready: true, pageWidth: 100, totalHeight: 30 },
    canvas: { ready: true, width: 100, height: 30, minHeight: 0, maxHeight: 20 },
  }, canvasIssues);
  assert.ok(canvasIssues.some((issue) => issue.code === 'canvas.bounds.invalid'));
  assert.ok(canvasIssues.some((issue) => issue.code === 'canvas.dom.maxHeight'));

  const scrollIssues = [];
  validators.validateScrollContract({
    canvas: { width: 100, height: 30 },
    scroll: { ready: true, scaledW: 90, scaledH: 25, padding: -1 },
  }, scrollIssues);
  assert.deepEqual(scrollIssues.map((issue) => issue.code), [
    'scroll.width.mismatch',
    'scroll.height.mismatch',
    'scroll.padding.invalid',
  ]);

  const orphanIssues = [];
  validators.validateOrphanNodes(orphanIssues);
  assert.ok(orphanIssues.some((issue) => issue.code === 'orphan.dom-element'));
  assert.ok(orphanIssues.some((issue) => issue.code === 'orphan.model-element.no-section-id'));
});

test('canonical runtime validator emits owner and legacy issue codes', () => {
  const validators = createEngineCoreContractValidators({
    runtimeServices: {
      getOwner(owner) {
        if (owner === 'canvas') return 'LegacyCanvas';
        if (owner === 'selection') return 'LegacySelection';
        if (owner === 'preview') return 'LegacyPreview';
        return null;
      },
    },
    win: {
      CanvasEngine: {},
      PreviewEngine: {},
      SelectionEngine: { __active: false },
      PreviewEngineV19: { __active: false },
    },
    doc: makeDoc({
      querySelectorAll(selector) {
        if (selector === '#handles-layer .sel-box') return [{}, {}];
        return [];
      },
    }),
  });

  const issues = [];
  validators.validateCanonicalRuntime(issues);
  assert.ok(issues.some((issue) => issue.code === 'runtime.canvas.owner' && issue.meta.actual === 'LegacyCanvas'));
  assert.ok(issues.some((issue) => issue.code === 'runtime.selection.owner' && issue.meta.actual === 'LegacySelection'));
  assert.ok(issues.some((issue) => issue.code === 'runtime.preview.owner' && issue.meta.actual === 'LegacyPreview'));
  assert.ok(issues.some((issue) => issue.code === 'runtime.canvas.legacy-present'));
  assert.ok(issues.some((issue) => issue.code === 'runtime.preview.legacy-present'));
  assert.ok(issues.some((issue) => issue.code === 'runtime.selection.inactive'));
  assert.ok(issues.some((issue) => issue.code === 'runtime.preview.inactive'));
  assert.ok(issues.some((issue) => issue.code === 'runtime.selection.duplicate-box'));
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
    routingPointer: path.join(ROOT, 'engines/EngineCoreRoutingPointer.js'),
    routingZoom: path.join(ROOT, 'engines/EngineCoreRoutingZoom.js'),
    routingRegistry: path.join(ROOT, 'engines/EngineCoreRoutingRegistry.js'),
    routingWorkspace: path.join(ROOT, 'engines/EngineCoreRoutingWorkspace.js'),
  };

  const selection = fs.readFileSync(files.selection, 'utf8');
  const canvas = fs.readFileSync(files.canvas, 'utf8');
  const preview = fs.readFileSync(files.preview, 'utf8');
  const core = fs.readFileSync(files.core, 'utf8');
  const contracts = fs.readFileSync(files.contracts, 'utf8');
  const runtime = fs.readFileSync(files.runtime, 'utf8');
  const routing = fs.readFileSync(files.routing, 'utf8');
  const routingPointer = fs.readFileSync(files.routingPointer, 'utf8');
  const routingZoom = fs.readFileSync(files.routingZoom, 'utf8');
  const routingRegistry = fs.readFileSync(files.routingRegistry, 'utf8');
  const routingWorkspace = fs.readFileSync(files.routingWorkspace, 'utf8');

  assert.match(selection, /\bDS\.selection\b/);
  assert.match(selection, /\bDS\.zoom\b/);
  assert.match(selection, /\bDS\.getElementById\b/);

  assert.match(canvas, /\bDS\.selection\b/);
  assert.match(canvas, /\bDS\.zoom\b/);
  assert.match(canvas, /\bDS\.getElementById\b/);

  assert.match(preview, /\bDS\.selection\b/);
  assert.match(preview, /\bDS\.zoom\b/);

  assert.doesNotMatch(contracts, /\bDS\.elements\b/);
  assert.doesNotMatch(contracts, /\bDS\.selection\b/);
  assert.doesNotMatch(contracts, /\bDS\.previewMode\b/);
  assert.match(runtime, /\bDS\.selection\b/);
  assert.match(runtime, /\bDS\.zoom\b/);
  assert.match(runtime, /\bDS\.elements\b/);
  assert.match(routing, /\bDS\.previewMode\b/);
  assert.match(routing, /\bDS\.getSelectedElements\b/);
  assert.match(routing, /EngineCoreRoutingPointer/);
  assert.match(routing, /EngineCoreRoutingZoom/);
  assert.match(routing, /EngineCoreRoutingRegistry/);
  assert.match(routing, /EngineCoreRoutingWorkspace/);
  assert.match(routingPointer, /function routePointer\(/);
  assert.match(routingZoom, /function onZoomDidChange\(/);
  assert.match(routingRegistry, /function registerAllEngines\(/);
  assert.match(routingWorkspace, /function wireWorkspaceEvents\(/);
  assert.doesNotMatch(core, /\bDS\.selection\b/);
  assert.doesNotMatch(core, /\bDS\.elements\b/);
});
