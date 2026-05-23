import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDebugBundle } from '../../tools/rf-debug-center/rf-debug-center-bundle.js';
import { buildWarningsSnapshot } from '../../tools/rf-debug-center/rf-debug-center-warnings.js';
import { buildSelectionSnapshot, clearSelectionSnapshot, copySelectionJSON, getSelectionSnapshot } from '../../tools/rf-debug-center/rf-debug-center-selection.js';
import { startRuntimeServer, launchRuntimePage, enterPreview, assertNoConsoleErrors } from './runtime_harness.mjs';

const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top });
const element = (id, box, style = {}) => ({ id, tagName: 'DIV', className: '', dataset: {}, style, ownerDocument: { defaultView: { getComputedStyle: (node) => node.style } }, contains: (other) => other?.id === id, hasAttribute: () => false, getBoundingClientRect: () => box });
const ds = ({ ids = ['el-1'], el = { id: 'el-1', type: 'item', sectionId: 'sec-1', x: 10, y: 20, w: 40, h: 30 }, previewMode = false } = {}) => ({ selection: new Set(ids), previewMode, getElementById: (id) => (id === el.id ? el : null), getSectionTop: () => 100 });
const timeline = (entries = []) => ({ paused: false, sourceState: 'present', sourceCount: entries.length, lastSyncAt: entries.at(-1)?.timestamp || null, total: entries.length, counts: { debug: 0, info: entries.length, warning: 0, error: 0 }, recent: entries.slice(-12), entries, lastEvent: entries.at(-1) || null });
const entry = (action, before, after, extra = {}) => ({ timestamp: extra.timestamp || '2026-05-22T10:00:00.000Z', source: extra.source || 'SelectionInteraction', module: extra.module || 'SelectionInteraction', action, severity: extra.severity || 'info', before, after, dom: extra.dom || null, state: extra.state || null, eventId: extra.eventId || null, transactionId: extra.transactionId || null, writerActual: extra.writerActual || null, ownerExpected: extra.ownerExpected || null, result: extra.result || null, error: extra.error || null });
function doc({ selected = null, overlay = null, handles = [], guides = [], section = null, hit = null } = {}) {
  const map = new Map();
  if (selected) { map.set('.cr-element.selected[data-id="el-1"]', selected); map.set('.cr-element[data-id="el-1"]', selected); map.set('#preview-content .pv-el.selected[data-origin-id="el-1"]', selected); map.set('#preview-content .pv-el[data-origin-id="el-1"]', selected); }
  if (overlay) map.set('#handles-layer .sel-box', overlay);
  if (section) map.set('.cr-section[data-section-id="sec-1"]', section);
  const all = [...map.values(), ...handles, ...guides].filter(Boolean);
  return { readyState: 'complete', defaultView: { getComputedStyle: (node) => node.style }, querySelector: (selector) => map.get(selector) || (selector.includes('el-1') ? selected : selector.includes('sec-1') ? section : selector.includes('sel-box') ? overlay : null), querySelectorAll: (selector) => selector === '#handles-layer .sel-handle' ? handles : selector === '#handles-layer .selection-guide' ? guides : selector === '[id]' ? all : [], elementFromPoint: () => hit || selected || overlay || null, getElementById: (id) => (id === 'el-1' ? selected : id === 'sec-1' ? section : id === 'sel-box' ? overlay : null) };
}

test('rf debug center selection fixtures detect missing nodes and drift', () => {
  const selected = element('el-1', rect(10, 20, 40, 30), { display: 'block', visibility: 'visible', opacity: '1', pointerEvents: 'auto' });
  const overlay = element('sel-box', rect(12, 24, 50, 32), { display: 'block', visibility: 'visible', opacity: '1', pointerEvents: 'auto' });
  const section = element('sec-1', rect(0, 0, 20, 20), { display: 'block', visibility: 'visible', opacity: '1', pointerEvents: 'auto' });
  const baseTimeline = timeline([entry('drag', { left: 10, top: 20, width: 40, height: 30 }, { left: 10, top: 20, width: 40, height: 30 }, { source: 'SelectionInteraction', action: 'move', before: { left: 10, top: 20, width: 40, height: 30 }, after: { left: 10, top: 20, width: 40, height: 30 } }), entry('resize', { left: 10, top: 20, width: 40, height: 30 }, { left: 10, top: 20, width: 40, height: 30 }, { source: 'SelectionInteraction', action: 'resize', before: { dom: { left: 10, top: 20, width: 40, height: 30 } }, after: { dom: { left: 10, top: 20, width: 40, height: 30 } } })]);
  const hidden = buildSelectionSnapshot({ ds: ds(), doc: doc({ selected: element('el-1', rect(10, 20, 40, 30), { display: 'none', visibility: 'hidden', opacity: '0', pointerEvents: 'none' }), overlay, section }), timeline: baseTimeline, traceState: 'present' });
  assert.equal(hidden.findings.some((item) => item.code === 'SELECTED_ELEMENT_HIDDEN'), true);
  const missing = buildSelectionSnapshot({ ds: ds(), doc: doc({ overlay, section }), timeline: timeline(), traceState: 'present' });
  assert.equal(missing.findings.some((item) => item.code === 'SELECTED_ELEMENT_MISSING'), true);
  const noBox = buildSelectionSnapshot({ ds: ds(), doc: doc({ selected, section }), timeline: timeline(), traceState: 'present' });
  assert.equal(noBox.findings.some((item) => item.code === 'SELECTION_BOX_MISSING'), true);
  assert.equal(noBox.findings.some((item) => item.code === 'HANDLES_MISSING'), true);
  const drift = buildSelectionSnapshot({ ds: ds(), doc: doc({ selected, overlay, section, hit: selected }), timeline: baseTimeline, traceState: 'present' });
  assert.equal(drift.findings.some((item) => item.code === 'MODEL_DOM_POSITION_DRIFT'), true);
  assert.equal(drift.findings.some((item) => item.code === 'MODEL_DOM_SIZE_DRIFT'), true);
  assert.equal(drift.findings.some((item) => item.code === 'ELEMENT_OUT_OF_SECTION'), true);
  const noSelection = buildSelectionSnapshot({ ds: ds({ ids: [] }), doc: doc({ selected, overlay, section, handles: [element('h1', rect(0, 0, 4, 4), { display: 'block', visibility: 'visible', opacity: '1', pointerEvents: 'auto' })] }), timeline: timeline(), traceState: 'present' });
  assert.match(noSelection.status, /ok|info|unknown/);
  assert.equal(noSelection.findings.length, 0);
  const dragIssue = buildSelectionSnapshot({ ds: ds(), doc: doc({ selected, overlay, section, handles: [element('h1', rect(0, 0, 4, 4), { display: 'block', visibility: 'visible', opacity: '1', pointerEvents: 'auto' })], hit: selected }), timeline: timeline([entry('drag', { left: 10, top: 20, width: 40, height: 30 }, { left: 10, top: 20, width: 40, height: 30 }, { source: 'SelectionInteraction', action: 'move', before: { left: 10, top: 20, width: 40, height: 30 }, after: { left: 10, top: 20, width: 40, height: 30 }, writerActual: 'SelectionInteraction.move' })]), traceState: 'present' });
  assert.equal(dragIssue.findings.some((item) => item.code === 'DRAG_WITHOUT_MODEL_UPDATE'), true);
  const resizeIssue = buildSelectionSnapshot({ ds: ds(), doc: doc({ selected, overlay, section, handles: [element('h1', rect(0, 0, 4, 4), { display: 'block', visibility: 'visible', opacity: '1', pointerEvents: 'auto' })], hit: selected }), timeline: timeline([entry('resize', { dom: { left: 10, top: 20, width: 40, height: 30 } }, { dom: { left: 10, top: 20, width: 40, height: 30 } }, { source: 'SelectionInteraction', action: 'resize', before: { dom: { left: 10, top: 20, width: 40, height: 30 } }, after: { dom: { left: 10, top: 20, width: 40, height: 30 } }, writerActual: 'SelectionInteraction.resize' })]), traceState: 'present' });
  assert.equal(resizeIssue.findings.some((item) => item.code === 'RESIZE_WITHOUT_DOM_UPDATE'), true);
  const bundle = buildDebugBundle({ state: { enabled: true, selection: drift, timeline: baseTimeline, zoom: { status: 'synced' }, dom: { status: 'synced' } }, traceApi: null, doc: { readyState: 'complete' }, win: { location: { href: 'http://example.test/?rfDebugCenter=1', pathname: '/', search: '?rfDebugCenter=1', hash: '' }, innerWidth: 800, innerHeight: 600, devicePixelRatio: 1, navigator: {}, URL: {}, Blob: null }, ownership: { tool: 'RF Debug Center' } });
  assert.equal(bundle.selection.status, drift.status);
  const warnings = buildWarningsSnapshot({ traceState: 'present', timeline: baseTimeline, selection: drift, ownership: { tool: 'RF Debug Center' } });
  assert.equal(warnings.warnings.some((item) => item.ruleId === 'SELECTION_RISK'), true);
  clearSelectionSnapshot();
  assert.equal(getSelectionSnapshot().status, 'unknown');
  assert.doesNotThrow(() => JSON.parse(copySelectionJSON()));
});

test('rf debug center selection live runtime panel stays read-only and visible', { timeout: 120000 }, async () => {
  const server = await startRuntimeServer();
  const debugUrl = new URL(server.baseUrl);
  debugUrl.searchParams.set('rfDebugCenter', '1');
  const { browser, page, consoleErrors } = await launchRuntimePage(debugUrl.toString());
  try {
    await page.waitForFunction(() => window.RFDebugCenter?.enabled === true);
    await enterPreview(page);
    const before = await page.evaluate(() => ({ traceLength: (window.RF_UI_TRACE?.getEntries?.() ?? []).length, ds: window.DS ? { zoom: window.DS.zoom, zoomDesign: window.DS.zoomDesign, zoomPreview: window.DS.zoomPreview, previewMode: window.DS.previewMode } : null }));
    const result = await page.evaluate(() => {
      window.RFDebugCenter.refreshSelection();
      const state = window.RFDebugCenter.getState();
      const host = document.getElementById('rf-debug-center-root');
      const shadow = host?.shadowRoot;
      const text = (id) => shadow?.getElementById(id)?.textContent?.replace(/\s+/g, ' ').trim() || '';
      return {
        selection: state.selection,
        traceLength: (window.RF_UI_TRACE?.getEntries?.() ?? []).length,
        ds: window.DS ? { zoom: window.DS.zoom, zoomDesign: window.DS.zoomDesign, zoomPreview: window.DS.zoomPreview, previewMode: window.DS.previewMode } : null,
        copy: window.RFDebugCenter.copySelectionJSON(),
        bundle: window.RFDebugCenter.buildBundle(),
        panel: { status: text('rf-debug-center-selection-status'), meta: text('rf-debug-center-selection-meta'), body: text('rf-debug-center-selection-body') },
      };
    });
    assert.ok(result.selection);
    assert.match(result.panel.status, /(ok|info|warning|error|unknown)/);
    assert.deepEqual(result.ds, before.ds);
    assert.equal(result.traceLength, before.traceLength);
    assert.doesNotThrow(() => JSON.parse(result.copy));
    assert.ok(result.bundle.selection);
    await assertNoConsoleErrors(consoleErrors, 'rf debug center selection live runtime panel');
  } finally {
    await browser.close();
    await server.stop();
  }
});
