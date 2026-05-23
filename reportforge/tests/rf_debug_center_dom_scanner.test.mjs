import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDebugBundle } from '../../tools/rf-debug-center/rf-debug-center-bundle.js';
import { buildDomScanner, clearDomScannerSnapshot, copyDomScannerJSON, getDomScannerSnapshot, refreshDomScannerSnapshot } from '../../tools/rf-debug-center/rf-debug-center-dom-scanner.js';
import { buildWarningsSnapshot } from '../../tools/rf-debug-center/rf-debug-center-warnings.js';

const STYLE = { display: 'block', visibility: 'visible', opacity: '1', pointerEvents: 'auto', position: 'static', zIndex: '1', overflow: 'visible', overflowX: 'visible', overflowY: 'visible' };
const missing = { querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, elementFromPoint: () => null, defaultView: { getComputedStyle: () => STYLE } };
const codes = (snapshot) => snapshot.findings.map((item) => item.ruleId);
const matches = (node, selector) => selector.split(',').some((part) => { const sel = part.trim(); if (!sel) return false; if (sel === '[id]') return !!node.id; if (node.__selectors.includes(sel)) return true; if (sel === `#${node.id}`) return true; if (sel === `.${node.className}`) return true; return false; });

function makeNode(spec = {}) {
  const children = spec.children || [];
  const node = { id: spec.id || '', tagName: spec.tagName || 'DIV', className: spec.className || '', textContent: spec.textContent || '', value: spec.value || '', hidden: !!spec.hidden, onclick: spec.onclick || null, onpointerdown: spec.onpointerdown || null, onmousedown: spec.onmousedown || null, onmouseup: spec.onmouseup || null, onchange: spec.onchange || null, isContentEditable: !!spec.isContentEditable, __style: { ...STYLE, ...(spec.style || {}) }, __selectors: spec.selectors || (spec.id ? [`#${spec.id}`] : [spec.tagName ? spec.tagName.toLowerCase() : 'div']), __children: children, parentElement: spec.parentElement || null, getBoundingClientRect: () => spec.rect || { x: 0, y: 0, left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 }, contains(other) { return other === node || children.includes(other); }, querySelectorAll(selector) { return children.filter((child) => matches(child, selector)); }, querySelector(selector) { return children.find((child) => matches(child, selector)) || null; }, classList: { contains: (name) => String(node.className || '').split(/\s+/).includes(name) }, getAttribute(name) { return name === 'role' ? spec.role || null : name === 'tabindex' ? spec.tabindex ?? null : null; }, matches(selector) { return matches(node, selector); } };
  return node;
}

function makeDoc(nodes, hit = null) {
  return {
    defaultView: { getComputedStyle: (node) => node.__style || STYLE },
    querySelector: (selector) => nodes.find((node) => matches(node, selector)) || null,
    querySelectorAll: (selector) => selector === '[id]' ? nodes.filter((node) => node.id) : nodes.filter((node) => matches(node, selector)),
    getElementById: (id) => nodes.find((node) => node.id === id) || null,
    elementFromPoint: typeof hit === 'function' ? hit : hit ? (() => hit) : () => null,
  };
}

function makeHiddenFixture() {
  const root = makeNode({ id: 'rf-debug-center-root', selectors: ['#rf-debug-center-root'], rect: { x: 0, y: 0, left: 0, top: 0, width: 1200, height: 900, right: 1200, bottom: 900 } });
  const workspace = makeNode({ id: 'workspace', selectors: ['#workspace'], rect: { x: 0, y: 0, left: 0, top: 0, width: 20, height: 20, right: 20, bottom: 20 }, style: { overflow: 'hidden' } });
  const toolbar = makeNode({ id: 'tb-zoom', selectors: ['#tb-zoom'], rect: { x: 0, y: 0, left: 0, top: 0, width: 140, height: 24, right: 140, bottom: 24 } });
  const sliderA = makeNode({ id: 'zw-slider', selectors: ['#zw-slider'], rect: { x: 2, y: 2, left: 2, top: 2, width: 0, height: 0, right: 2, bottom: 2 }, style: { display: 'none', visibility: 'hidden', opacity: '0', pointerEvents: 'none' }, onclick: () => {} });
  const sliderB = makeNode({ id: 'zw-slider', selectors: ['#zw-slider'], rect: { x: 6, y: 2, left: 6, top: 2, width: 60, height: 18, right: 66, bottom: 20 }, style: { display: 'block', visibility: 'visible', opacity: '1', pointerEvents: 'auto' } });
  const pct = makeNode({ id: 'zw-pct', selectors: ['#zw-pct'], rect: { x: 70, y: 2, left: 70, top: 2, width: 24, height: 18, right: 94, bottom: 20 } });
  const canvas = makeNode({ id: 'canvas-layer', selectors: ['#canvas-layer'], rect: { x: 0, y: 0, left: 0, top: 0, width: 200, height: 200, right: 200, bottom: 200 }, style: { position: 'relative' } });
  const overlay = makeNode({ id: 'rf-overlay', className: 'overlay', selectors: ['.overlay'], rect: { x: 0, y: 0, left: 0, top: 0, width: 200, height: 200, right: 200, bottom: 200 }, style: { position: 'fixed', zIndex: '99' } });
  toolbar.__children.push(pct);
  workspace.__children.push(toolbar, canvas);
  sliderA.parentElement = workspace;
  sliderB.parentElement = workspace;
  pct.parentElement = toolbar;
  canvas.parentElement = workspace;
  return makeDoc([root, workspace, toolbar, sliderA, sliderB, canvas, overlay], (x) => (x < 80 ? overlay : root));
}

function makePreviewFixture() {
  const root = makeNode({ id: 'rf-debug-center-root', selectors: ['#rf-debug-center-root'] });
  const workspace = makeNode({ id: 'workspace', selectors: ['#workspace'] });
  const canvas = makeNode({ id: 'canvas-layer', selectors: ['#canvas-layer'], rect: { x: 0, y: 0, left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600 }, style: { position: 'relative' } });
  const preview = makeNode({ id: 'preview-content', selectors: ['#preview-content'], rect: { x: 0, y: 0, left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600 }, style: { position: 'relative' } });
  workspace.__children.push(canvas, preview);
  canvas.parentElement = workspace;
  preview.parentElement = workspace;
  return makeDoc([root, workspace, canvas, preview], null);
}

function makeHugeFixture(count = 100) {
  const nodes = [makeNode({ id: 'rf-debug-center-root', selectors: ['#rf-debug-center-root'] }), makeNode({ id: 'workspace', selectors: ['#workspace'] }), makeNode({ id: 'tb-zoom', selectors: ['#tb-zoom'] }), makeNode({ id: 'zw-pct', selectors: ['#zw-pct'] })];
  for (let i = 0; i < count; i += 1) {
    nodes.push(makeNode({ id: `dup-${i}`, selectors: [`#dup-${i}`] }));
    nodes.push(makeNode({ id: `dup-${i}`, selectors: [`#dup-${i}`] }));
  }
  return makeDoc(nodes);
}

test('dom scanner tolerates missing document and stays read-only', () => {
  let clearCalls = 0;
  const traceApi = { getEntries: () => [], snapshot: () => null, clear: () => { clearCalls += 1; } };
  const ds = Object.freeze({ previewMode: false, zoom: 1 });
  const snapshot = buildDomScanner({ doc: null, adapter: null, ds, traceApi });
  assert.equal(snapshot.status, 'unknown');
  assert.equal(snapshot.targets.length, 0);
  assert.equal(clearCalls, 0);
  assert.equal(JSON.stringify(ds), '{"previewMode":false,"zoom":1}');
  assert.equal(typeof globalThis.RFDebugCenter, 'undefined');
});

test('dom scanner adversarial rules fire with bounded evidence', () => {
  const snapshot = buildDomScanner({ doc: makeHiddenFixture(), adapter: null, ds: { previewMode: false } });
  const list = codes(snapshot);
  assert.ok(list.includes('DOM_TARGET_MISSING'));
  assert.ok(list.includes('DOM_TARGET_HIDDEN'));
  assert.ok(list.includes('DOM_ZERO_SIZE_CONTROL'));
  assert.ok(list.includes('DOM_INTERACTIVE_HIDDEN'));
  assert.ok(list.includes('DOM_POINTER_EVENTS_NONE'));
  assert.ok(list.includes('DOM_ELEMENT_FROM_POINT_MISMATCH'));
  assert.ok(list.includes('DOM_BLOCKED_BY_OVERLAY'));
  assert.ok(list.includes('DOM_DUPLICATE_ID'));
  assert.ok(list.includes('DOM_DUPLICATE_TARGET_SELECTOR'));
  assert.ok(list.includes('DOM_CLIPPED_BY_OVERFLOW'));
  assert.ok(list.includes('DOM_ORPHANED_CONTROL'));
  assert.equal(snapshot.findings.filter((item) => item.ruleId === 'DOM_DUPLICATE_ID').length, 1);
  assert.equal(snapshot.findings.filter((item) => item.ruleId === 'DOM_DUPLICATE_TARGET_SELECTOR').length, 1);
  assert.ok(snapshot.summary.blocked >= 1);
  assert.ok(snapshot.summary.hidden >= 1);
});

test('dom scanner preview overlap and empty preview are reported', () => {
  const snapshot = buildDomScanner({ doc: makePreviewFixture(), adapter: null, ds: { previewMode: true } });
  const list = codes(snapshot);
  assert.ok(list.includes('DOM_DESIGN_PREVIEW_OVERLAP'));
  assert.ok(list.includes('DOM_PREVIEW_EMPTY_WHILE_VISIBLE'));
  assert.equal(snapshot.status, 'warning');
});

test('dom scanner refresh, clear, copy, bundle, and warnings integration stay read-only', () => {
  const doc = makeHiddenFixture();
  const refreshed = refreshDomScannerSnapshot({ doc, adapter: null, ds: { previewMode: false } });
  assert.equal(refreshed.status, 'error');
  assert.doesNotThrow(() => JSON.parse(copyDomScannerJSON()));
  clearDomScannerSnapshot();
  assert.equal(getDomScannerSnapshot().status, 'unknown');
  const snapshot = refreshDomScannerSnapshot({ doc, adapter: null, ds: { previewMode: false } });
  const bundle = buildDebugBundle({ state: { enabled: true, domScanner: snapshot, dom: { status: 'synced' }, warnings: { status: 'unknown', total: 0 } }, traceApi: null, doc, win: { location: { href: 'http://example.test/?rfDebugCenter=1', pathname: '/', search: '?rfDebugCenter=1', hash: '' }, innerWidth: 800, innerHeight: 600, devicePixelRatio: 1, navigator: {}, URL: {}, Blob: null }, ownership: { tool: 'RF Debug Center' } });
  assert.equal(bundle.domScanner.status, 'error');
  const warnings = buildWarningsSnapshot({ traceState: 'present', timeline: { paused: false, total: 1 }, domScanner: snapshot, ownership: { tool: 'RF Debug Center' } });
  assert.equal(warnings.warnings.some((item) => item.ruleId === 'DOM_SCANNER_RISK'), true);
});

test('dom scanner caps findings and targets', () => {
  const snapshot = buildDomScanner({ doc: makeHugeFixture(), adapter: null, ds: { previewMode: false } });
  assert.ok(snapshot.targets.length <= snapshot.limits.maxTargets);
  assert.ok(snapshot.findings.length <= snapshot.limits.maxFindings);
});
