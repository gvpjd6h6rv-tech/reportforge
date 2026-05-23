import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDebugBundle } from '../../tools/rf-debug-center/rf-debug-center-bundle.js';
import { buildWarningsSnapshot } from '../../tools/rf-debug-center/rf-debug-center-warnings.js';
import { buildRenderPreviewSnapshot, clearRenderPreviewSnapshot, copyRenderPreviewJSON, refreshRenderPreviewSnapshot } from '../../tools/rf-debug-center/rf-debug-center-render-preview.js';
import { startRuntimeServer, launchRuntimePage, enterPreview, assertNoConsoleErrors } from './runtime_harness.mjs';

function makeNode(doc, id, rect, style = {}) {
  return {
    ownerDocument: doc,
    id,
    tagName: id === 'zw-slider' ? 'INPUT' : 'DIV',
    className: '',
    style,
    dataset: {},
    hasAttribute: (name) => name === 'role' && id === 'zw-pct',
    getBoundingClientRect: () => rect,
    querySelector: (selector) => (selector === '.preview-render-layer' && id === 'preview-content' ? doc.nodes['.preview-render-layer'] : null),
    querySelectorAll: () => [],
    contains: (other) => other === doc.nodes[id] || other === doc.nodes['preview-content'] || other === doc.nodes['preview-layer'],
  };
}

function makeDoc({ root = true, rootVisible = true, visible = true, content = true, pages = 1, leakDesign = false } = {}) {
  const doc = { readyState: 'complete', nodes: {} };
  const rootNode = makeNode(doc, 'preview-layer', { left: 0, top: 0, width: 1000, height: 700, right: 1000, bottom: 700 }, { display: rootVisible ? 'block' : 'none', visibility: rootVisible ? 'visible' : 'hidden', opacity: rootVisible ? '1' : '0', transform: 'none', zIndex: '2', pointerEvents: 'auto' });
  const box = makeNode(doc, 'preview-content', { left: 0, top: 0, width: 1000, height: 700, right: 1000, bottom: 700 }, { display: visible ? 'block' : 'none', visibility: visible ? 'visible' : 'hidden', opacity: visible ? '1' : '0', transform: 'none', zIndex: '2', pointerEvents: 'auto' });
  const slider = makeNode(doc, 'zw-slider', { left: 0, top: 0, width: 100, height: 24, right: 100, bottom: 24 }, { display: 'block', visibility: 'visible', opacity: '1', transform: 'none', zIndex: '3', pointerEvents: 'auto' });
  const pct = makeNode(doc, 'zw-pct', { left: 0, top: 0, width: 60, height: 24, right: 60, bottom: 24 }, { display: 'block', visibility: 'visible', opacity: '1', transform: 'none', zIndex: '3', pointerEvents: 'auto' });
  const tb = makeNode(doc, 'tb-zoom', { left: 0, top: 0, width: 72, height: 24, right: 72, bottom: 24 }, { display: 'block', visibility: 'visible', opacity: '1', transform: 'none', zIndex: '3', pointerEvents: 'auto' });
  const renderLayer = makeNode(doc, 'preview-render-layer', { left: 0, top: 0, width: 1000, height: 700, right: 1000, bottom: 700 }, { display: 'block', visibility: 'visible', opacity: '1', transform: 'matrix(1.2,0,0,1.2,0,0)', zIndex: '4', pointerEvents: 'auto' });
  renderLayer.className = 'preview-render-layer';
  renderLayer.querySelectorAll = (selector) => selector === '.rpt-page' ? Array.from({ length: pages }, (_, i) => ({ id: `page-${i + 1}` })) : [];
  box.querySelector = (selector) => (selector === '.preview-render-layer' ? renderLayer : null);
  box.querySelectorAll = (selector) => selector === '.preview-render-layer .rpt-page, .preview-hit-layer .pv-page' ? Array.from({ length: pages }, (_, i) => ({ id: `page-${i + 1}` })) : [];
  if (root) doc.nodes['preview-layer'] = rootNode;
  doc.nodes['preview-content'] = box;
  doc.nodes['zw-slider'] = slider;
  doc.nodes['zw-pct'] = pct;
  doc.nodes['tb-zoom'] = tb;
  doc.nodes['.preview-render-layer'] = renderLayer;
  doc.defaultView = { getComputedStyle: (node) => node.style };
  doc.querySelector = (selector) => {
    if (selector === '#preview-layer') return root ? doc.nodes['preview-layer'] : null;
    if (selector === '#preview-content') return content ? doc.nodes['preview-content'] : null;
    if (selector === '#zw-slider') return doc.nodes['zw-slider'];
    if (selector === '#zw-pct') return doc.nodes['zw-pct'];
    if (selector === '#tb-zoom') return doc.nodes['tb-zoom'];
    if (selector === '#preview-content .preview-render-layer' || selector === '#preview-content .preview-hit-layer') return content ? doc.nodes['.preview-render-layer'] : null;
    if (selector === '#preview-content .cr-element, #preview-content .cr-section, #preview-content #canvas-layer') return leakDesign ? { id: 'canvas-layer', className: 'cr-element', tagName: 'DIV' } : null;
    return null;
  };
  doc.querySelectorAll = (selector) => {
    if (selector === '[id]') return Object.values(doc.nodes);
    if (selector === '.preview-render-layer .rpt-page, .preview-hit-layer .pv-page') return content ? Array.from({ length: pages }, (_, i) => ({ id: `page-${i + 1}` })) : [];
    return [];
  };
  doc.elementFromPoint = (x, y) => (x >= 0 && y >= 0 ? doc.nodes['.preview-render-layer'] : null);
  return doc;
}

const timeline = (entries = [], sourceState = 'present') => ({ paused: false, sourceState, total: entries.length, counts: { debug: 0, info: entries.length, warning: 0, error: 0 }, recent: entries.slice(-12), entries, lastEvent: entries.at(-1) || null });
const traceApi = (entries = []) => ({ getEntries: () => entries, snapshot: () => ({ entries }) });

test('render preview snapshot stays read-only and handles empty state', () => {
  const ds = { previewMode: false, zoomPreview: 1, zoomDesign: 1, zoom: 1 };
  const before = JSON.stringify(ds);
  const snap = buildRenderPreviewSnapshot({ ds, doc: makeDoc({ visible: true, content: true, pages: 1 }), timeline: timeline([]), network: null, performance: null, asyncRace: null, loopFreeze: null, bundle: null, traceState: 'empty', active: false });
  assert.notEqual(snap.status, 'error');
  assert.equal(JSON.stringify(ds), before);
  assert.equal(snap.previewDom.rootExists, true);
  assert.equal(snap.previewDom.contentExists, true);
  assert.equal(snap.previewDom.visible, true);
});

test('render preview snapshot detects preview root, content, visibility and request failures', () => {
  const previewEvent = { timestamp: '2026-05-22T07:42:06.000Z', source: 'PreviewEngineMode.show', action: 'show' };
  const renderEvent = { timestamp: '2026-05-22T07:42:06.100Z', source: 'PreviewEngineRenderer.refresh', action: 'refresh' };
  const base = { traceState: 'present', timeline: timeline([previewEvent, renderEvent]), bundle: { status: 'ready', filename: 'rf-debug-bundle-20260522-074206.json' }, active: true };
  const rootMissing = buildRenderPreviewSnapshot({ ...base, doc: makeDoc({ root: false, content: true }), ds: { previewMode: true } });
  assert.equal(rootMissing.findings.some((item) => item.code === 'PREVIEW_ROOT_MISSING'), true);
  const contentMissing = buildRenderPreviewSnapshot({ ...base, doc: makeDoc({ content: false }), ds: { previewMode: true } });
  assert.equal(contentMissing.findings.some((item) => item.code === 'PREVIEW_CONTENT_MISSING'), true);
  const hidden = buildRenderPreviewSnapshot({ ...base, doc: makeDoc({ rootVisible: false }), ds: { previewMode: true } });
  assert.equal(hidden.findings.some((item) => item.code === 'PREVIEW_NOT_VISIBLE'), true);
  const requestFailed = buildRenderPreviewSnapshot({ ...base, doc: makeDoc(), ds: { previewMode: true }, network: { failedRequests: [{ requestId: 'r-1', transactionId: 'r-1', method: 'POST', path: '/render', url: '/render', status: 500, ok: false, durationMs: 120, ownerExpected: 'engines/PreviewEngineRenderer.js' }], slowRequests: [], activeRequests: [], completedRequests: [], lastRequests: [] } });
  assert.equal(requestFailed.findings.some((item) => item.code === 'PREVIEW_REQUEST_FAILED'), true);
  const requestSlow = buildRenderPreviewSnapshot({ ...base, doc: makeDoc(), ds: { previewMode: true }, network: { slowRequests: [{ requestId: 'r-2', transactionId: 'r-2', method: 'POST', path: '/render', url: '/render', status: 200, ok: true, durationMs: 1500, ownerExpected: 'engines/PreviewEngineRenderer.js' }], failedRequests: [], activeRequests: [], completedRequests: [], lastRequests: [] } });
  assert.equal(requestSlow.findings.some((item) => item.code === 'PREVIEW_REQUEST_SLOW'), true);
  const exportFailed = buildRenderPreviewSnapshot({ ...base, doc: makeDoc(), ds: { previewMode: true }, network: { failedRequests: [{ requestId: 'e-1', transactionId: 'e-1', method: 'POST', path: '/export/pdf', url: '/export/pdf', status: 500, ok: false, durationMs: 1800, ownerExpected: 'engines/PreviewEngineRenderer.js' }], slowRequests: [], activeRequests: [], completedRequests: [], lastRequests: [] } });
  assert.equal(exportFailed.findings.some((item) => item.code === 'EXPORT_PDF_REQUEST_FAILED'), true);
});

test('render preview snapshot detects async out-of-order, missing end, empty DOM after success and design canvas leakage', () => {
  const asyncRace = {
    raceFindings: [{ ruleId: 'RENDER_AFTER_NEWER_RENDER', severity: 'warning', renderId: 'r-2', transactionId: 'r-2', evidence: ['r-1 after r-2'], suggestedOwner: 'engines/PreviewEngineRenderer.js' }],
    missingEnds: [{ ruleId: 'RENDER_MISSING_END', severity: 'warning', renderId: 'r-3', transactionId: 'r-3', evidence: ['render missing end'], suggestedOwner: 'engines/PreviewEngineRenderer.js' }],
  };
  const performance = { topSlowOperations: [{ label: 'PreviewEngineRenderer.refresh', source: 'PreviewEngineRenderer', action: 'refresh' }] };
  const timelineState = timeline([{ timestamp: '2026-05-22T07:42:06.000Z', source: 'PreviewEngineMode.show', action: 'show' }]);
  const leaked = buildRenderPreviewSnapshot({ ds: { previewMode: true }, doc: makeDoc({ pages: 0, leakDesign: true }), timeline: timelineState, network: { completedRequests: [{ requestId: 'p-1', transactionId: 'p-1', method: 'POST', path: '/designer-preview', url: '/designer-preview', status: 200, ok: true, durationMs: 12 }], activeRequests: [], failedRequests: [], slowRequests: [], lastRequests: [] }, performance, asyncRace, loopFreeze: { evidence: ['gap'] }, bundle: { status: 'ready' }, traceState: 'present', active: true });
  assert.equal(leaked.findings.some((item) => item.code === 'RENDER_OUT_OF_ORDER'), true);
  assert.equal(leaked.findings.some((item) => item.code === 'RENDER_MISSING_END'), true);
  assert.equal(leaked.findings.some((item) => item.code === 'PREVIEW_DOM_EMPTY_AFTER_SUCCESS'), true);
  assert.equal(leaked.findings.some((item) => item.code === 'PREVIEW_USES_DESIGN_CANVAS_SUSPECTED'), true);
  assert.ok(leaked.correlations.performance.length > 0);
});

test('render preview clear/copy helpers and bundle integration stay controlled', () => {
  const snapshot = refreshRenderPreviewSnapshot({ ds: { previewMode: true }, doc: makeDoc(), timeline: timeline([{ source: 'PreviewEngineRenderer.refresh', action: 'refresh' }]), network: null, performance: null, asyncRace: null, loopFreeze: null, bundle: { status: 'ready' }, traceState: 'present', active: true });
  assert.equal(snapshot.engine, 'render-preview');
  const copied = copyRenderPreviewJSON();
  assert.doesNotThrow(() => JSON.parse(copied));
  const cleared = clearRenderPreviewSnapshot();
  assert.equal(cleared.status, 'unknown');
  const bundle = buildDebugBundle({ state: { enabled: true, timeline: timeline([{ source: 'PreviewEngineRenderer.refresh', action: 'refresh' }]), renderPreview: snapshot, zoom: { status: 'synced' }, selection: { status: 'synced' }, network: { status: 'ok' }, performance: { status: 'ok' }, asyncRace: { status: 'ok' }, loopFreeze: { status: 'ok' }, warnings: { status: 'ok', total: 0, counts: { info: 0, warning: 0, error: 0 }, warnings: [] }, dom: { status: 'synced' } }, traceApi: traceApi([{ source: 'PreviewEngineRenderer.refresh', action: 'refresh' }]), doc: makeDoc(), win: { location: { href: 'http://example.test/?rfDebugCenter=1', pathname: '/', search: '?rfDebugCenter=1', hash: '' }, innerWidth: 800, innerHeight: 600, devicePixelRatio: 1, navigator: {}, URL: {}, Blob: null }, ownership: { tool: 'RF Debug Center' } });
  assert.equal(bundle.renderPreview.status, 'info');
});

test('render preview live runtime panel renders without mutating trace or ds', { timeout: 120000 }, async () => {
  const server = await startRuntimeServer();
  const debugUrl = new URL(server.baseUrl);
  debugUrl.searchParams.set('rfDebugCenter', '1');
  const { browser, page, consoleErrors } = await launchRuntimePage(debugUrl.toString());
  try {
    await page.waitForFunction(() => typeof window.RFDebugCenter === 'object' && !!window.RFDebugCenter);
    const started = await page.evaluate(() => window.RFDebugCenter.start?.() === true || window.RFDebugCenter.enabled === true);
    assert.equal(started, true);
    await enterPreview(page);
    await page.waitForFunction(() => (window.RFDebugCenter?.getState?.()?.timeline?.total || 0) >= 0);

    const before = await page.evaluate(() => ({
      ds: window.DS ? { previewMode: window.DS.previewMode, zoom: window.DS.zoom, zoomPreview: window.DS.zoomPreview, zoomDesign: window.DS.zoomDesign } : null,
      traceLength: (window.RF_UI_TRACE?.getEntries?.() ?? []).length,
    }));

    const result = await page.evaluate(() => {
      const state = window.RFDebugCenter.refreshRenderPreview();
      return {
        snapshot: window.RFDebugCenter.getState().renderPreview,
        ds: window.DS ? { previewMode: window.DS.previewMode, zoom: window.DS.zoom, zoomPreview: window.DS.zoomPreview, zoomDesign: window.DS.zoomDesign } : null,
        traceLength: (window.RF_UI_TRACE?.getEntries?.() ?? []).length,
        api: {
          copy: window.RFDebugCenter.copyRenderPreviewJSON(),
          bundle: window.RFDebugCenter.buildBundle(),
        },
        panel: (() => {
          const host = document.getElementById('rf-debug-center-root');
          const shadow = host?.shadowRoot;
          const text = (id) => shadow?.getElementById(id)?.textContent?.replace(/\s+/g, ' ').trim() || '';
          return {
            status: text('rf-debug-center-render-preview-status'),
            meta: text('rf-debug-center-render-preview-meta'),
            body: text('rf-debug-center-render-preview-body'),
          };
        })(),
      };
    });

    assert.equal(result.ds?.previewMode, before.ds?.previewMode);
    assert.equal(result.traceLength, before.traceLength);
    assert.ok(result.snapshot);
    assert.match(result.api.copy, /"engine": "render-preview"/);
    assert.equal(result.api.bundle.renderPreview.engine, 'render-preview');
    assert.match(result.panel.status, /(ok|info|warning|error|unknown)/);
    assert.match(result.panel.meta, /(root|content|pages)/);
    await assertNoConsoleErrors(consoleErrors, 'render preview live runtime panel');
  } finally {
    await browser.close();
    await server.stop();
  }
});
