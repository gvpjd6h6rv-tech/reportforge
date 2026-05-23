'use strict';
// PORT0 — ReportForge Adapter Metadata
// Static metadata for the ReportForge adapter v1.
// No runtime calls. No globals. No imports. Pure data.

export const REPORTFORGE_ADAPTER_METADATA = Object.freeze({
  id: 'reportforge',
  name: 'ReportForge',
  project: 'reportforge',
  version: '1.0.0',
  adapterSchema: '1.0.0',
  description: 'ReportForge adapter v1 — sidecar adapter for RF Debug Center',
  traceSource: 'window.RF_UI_TRACE',
  singleGlobal: 'window.RFDebugCenter',
  domSelectors: Object.freeze({
    root: '#rf-debug-center-root',
    app: '#app',
    workspace: '#workspace',
    previewLayer: '#preview-layer',
    previewContent: '#preview-content',
    canvasLayer: '#canvas-layer',
    zoomSlider: '#zw-slider',
    zoomPercent: '#zw-pct',
    zoomToolbar: '#tb-zoom',
    selectionLayer: '#handles-layer',
    selectionBox: '#handles-layer .sel-box',
    selectionHandles: '#handles-layer .sel-handle',
    selectionGuides: '#handles-layer .selection-guide',
  }),
  networkPaths: Object.freeze([
    '/designer-preview',
    '/render',
    '/rf-audit',
    '/export/pdf',
  ]),
  activationFlags: Object.freeze({
    queryParam: 'rfDebugCenter',
    localStorage: 'RF_DEBUG_CENTER',
    windowFlag: 'RF_DEBUG_TRACE',
  }),
  capabilities: Object.freeze([
    'timeline',
    'zoom',
    'domScanner',
    'selection',
    'renderPreview',
    'asyncRace',
    'loopFreeze',
    'network',
    'performance',
    'warnings',
    'visualEvidence',
    'bundle',
  ]),
  invariants: Object.freeze([
    'does not mutate RF_UI_TRACE',
    'does not mutate DS',
    'does not move DOM nodes',
    'does not trigger render or preview',
    'does not make external network requests',
    'single global: window.RFDebugCenter only',
  ]),
});
