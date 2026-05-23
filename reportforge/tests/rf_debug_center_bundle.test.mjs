import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDebugBundle,
  copyDebugBundleJSON,
  createBundleFilename,
  exportDebugBundle,
  serializeDebugBundle,
} from '../../tools/rf-debug-center/rf-debug-center-bundle.js';
import {
  startRuntimeServer,
  launchRuntimePage,
  enterPreview,
  assertNoConsoleErrors,
} from './runtime_harness.mjs';

function makeTraceEntries() {
  return [{
    kind: 'ui',
    timestamp: '2026-05-22T07:42:06.000Z',
    source: 'GlobalEventHandlers.wheel',
    module: 'ZoomEngine',
    action: 'wheel',
    severity: 'info',
    eventId: 'zoom-1',
    transactionId: 'tx-1',
    before: { token: 'abc123', password: 'secret', nested: { apiKey: 'keep-out' } },
    after: { zoom: 1.5, long: 'x'.repeat(1500), list: Array.from({ length: 300 }, (_, i) => i) },
    state: { zoom: 1.5, session: 'hidden' },
    dom: { selector: '#canvas-layer', visible: true },
    request: { authorization: 'Bearer deadbeef' },
    response: { cookie: 'sid=1' },
    durationMs: 12.5,
    ownerExpected: 'engines/ZoomEngine.js',
    writerActual: 'GlobalEventHandlers.wheel',
    result: 'ok',
    error: null,
  }];
}

function makeFakeDoc() {
  const nodes = new Map();
  const mk = (id, rect, style = {}) => {
    const node = {
      id,
      tagName: id === 'zw-slider' ? 'INPUT' : 'DIV',
      className: '',
      style,
      dataset: {},
      contains: (other) => other === node,
      hasAttribute: (name) => name === 'role' && id === 'zw-pct',
      getBoundingClientRect: () => rect,
    };
    nodes.set(`#${id}`, node);
    return node;
  };
  mk('canvas-layer', { x: 0, y: 0, left: 0, top: 0, width: 1000, height: 700, right: 1000, bottom: 700 }, { display: 'block', visibility: 'visible', opacity: '1', transform: 'matrix(1.5,0,0,1.5,0,0)', zIndex: '1', pointerEvents: 'auto' });
  mk('preview-layer', { x: 0, y: 0, left: 0, top: 0, width: 1000, height: 700, right: 1000, bottom: 700 }, { display: 'block', visibility: 'visible', opacity: '1', transform: 'none', zIndex: '2', pointerEvents: 'auto' });
  mk('preview-content', { x: 0, y: 0, left: 0, top: 0, width: 1000, height: 700, right: 1000, bottom: 700 }, { display: 'block', visibility: 'visible', opacity: '1', transform: 'matrix(1.5,0,0,1.5,0,0)', zIndex: '2', pointerEvents: 'auto' });
  mk('zw-slider', { x: 0, y: 0, left: 0, top: 0, width: 100, height: 24, right: 100, bottom: 24 }, { display: 'block', visibility: 'visible', opacity: '1', transform: 'none', zIndex: '3', pointerEvents: 'auto' });
  mk('zw-pct', { x: 0, y: 0, left: 0, top: 0, width: 60, height: 24, right: 60, bottom: 24 }, { display: 'block', visibility: 'visible', opacity: '1', transform: 'none', zIndex: '3', pointerEvents: 'auto' });
  mk('tb-zoom', { x: 0, y: 0, left: 0, top: 0, width: 72, height: 24, right: 72, bottom: 24 }, { display: 'block', visibility: 'visible', opacity: '1', transform: 'none', zIndex: '3', pointerEvents: 'auto' });
  const all = [...nodes.values()];
  const doc = {
    readyState: 'complete',
    defaultView: { getComputedStyle: (node) => node.style },
    querySelector: (selector) => nodes.get(selector) || null,
    querySelectorAll: (selector) => selector === '[id]' ? all : [],
    elementFromPoint: (x, y) => (x >= 0 && y >= 0 ? nodes.get('#canvas-layer') : null),
    getElementById: (id) => nodes.get(`#${id}`) || null,
  };
  return doc;
}

function makeFakeWin() {
  const actions = [];
  return {
    location: { href: 'http://example.test/designer?rfDebugCenter=1', pathname: '/designer', search: '?rfDebugCenter=1', hash: '' },
    innerWidth: 1440,
    innerHeight: 980,
    devicePixelRatio: 2,
    navigator: {},
    Blob: class Blob { constructor(parts, opts) { this.parts = parts; this.type = opts.type; } },
    URL: { createObjectURL: () => 'blob:rf-debug', revokeObjectURL: () => actions.push('revoke') },
    setTimeout: (fn) => { fn(); return 0; },
    addEventListener: () => {},
  };
}

test('rf debug center bundle builds, sanitizes, and serializes safely', () => {
  const trace = { getEntries: () => makeTraceEntries(), snapshot: () => ({ dsZoom: 1.5 }), clear: () => {} };
  const doc = makeFakeDoc();
  const win = makeFakeWin();
  const bundle = buildDebugBundle({
    state: {
      enabled: true,
      activation: 'query:rfDebugCenter',
      theme: 'dark',
      timeline: { paused: false, sourceState: 'present', sourceCount: 1, total: 1, counts: { debug: 0, info: 1, warning: 0, error: 0 }, recent: [], entries: [], lastEvent: null },
      zoom: { status: 'synced', mode: 'preview', zoom: { dsZoom: 1.5, dsZoomDesign: 1, dsZoomPreview: 1.5, effectiveZoom: 1.5 }, controls: { sliderValue: '150', sliderMin: '25', sliderMax: '400', sliderStep: '1', pctText: '150%', tbZoomValue: '150%' }, dom: { status: 'synced', summary: { ok: true }, findings: [], owners: ['engines/ZoomEngine.js'] }, lastZoomEvent: { source: 'DesignZoomEngine._apply', action: 'wheel', writerActual: 'GlobalEventHandlers.wheel', ownerExpected: 'engines/ZoomEngine.js' }, divergences: [], evidence: ['ok'] },
      loopFreeze: { status: 'ok', heartbeat: { gapMs: 12, thresholdMs: 1800 }, eventStorms: [], repeatedHandlers: [], possibleLoops: [], lastEvents: [], risk: { level: 'none', reason: 'stable' }, evidence: [] },
      network: { status: 'ok', observerStatus: 'installed', counters: { total: 1, active: 0, completed: 1, failed: 0, slow: 0 }, activeRequests: [], completedRequests: [{ requestId: 'net-1', transactionId: 'net-1', method: 'POST', url: '/designer-preview', path: '/designer-preview', status: 200, ok: true, contentType: 'application/json', durationMs: 12, startedAt: '2026-05-22T07:42:06.000Z', endedAt: '2026-05-22T07:42:06.012Z', requestSummary: { value: { token: '[REDACTED]' } }, responseSummary: { value: { ok: true } }, error: null, sensitiveFieldsRedacted: ['token'] }], failedRequests: [], slowRequests: [], lastRequests: [], risk: { level: 'none', reason: 'stable' }, evidence: [] },
      performance: { status: 'ok', risk: { level: 'none', reason: 'stable' }, eventRate: { windowMs: 5000, total: 1, perSecond: 0.2, topActions: [{ source: 'ZoomEngine', module: 'ZoomEngine', action: 'wheel', count: 1 }] }, slowEvents: [], slowRequests: [], longTasks: [], frameGaps: [], topSlowOperations: [], correlations: { loopFreeze: { status: 'ok', risk: 'none', reason: 'stable', evidence: [], suggestedOwner: null }, asyncRace: { status: 'ok', risk: 'none', reason: 'stable', evidence: [], suggestedOwner: null }, network: { status: 'ok', risk: 'none', reason: 'stable', evidence: [], suggestedOwner: null } }, limits: { maxEntries: 50, slowEventThresholdMs: 100, slowRequestThresholdMs: 1000, frameGapThresholdMs: 250, longTaskThresholdMs: 50, windowMs: 5000, eventRateThreshold: 12 }, evidence: [] },
      selection: { status: 'warning', selected: { ids: ['el-1'], id: 'el-1', type: 'box', source: 'SelectionOverlay.renderHandles' }, visual: { selectionBoxVisible: true, handlesVisible: true, guidesVisible: false, selectedRect: { left: 10, top: 20, width: 40, height: 30 }, overlayRect: { left: 12, top: 22, width: 42, height: 30 }, computed: {} }, drag: { lastEvent: null, delta: null, modelBefore: null, modelAfter: null, domBefore: null, domAfter: null }, resize: { lastEvent: null, modelBefore: null, modelAfter: null, domBefore: null, domAfter: null }, section: { id: 'sec-1', rect: { left: 0, top: 0, width: 100, height: 100 }, outOfBounds: false }, findings: [{ code: 'MODEL_DOM_POSITION_DRIFT', severity: 'warning', ownerExpected: 'engines/SelectionOverlay.js' }], evidence: ['selection drift'] },
      domScanner: { status: 'warning', summary: { targetsScanned: 8, findings: 1, critical: 0, warnings: 1, duplicates: 0, blocked: 0, hidden: 1 }, targets: [], findings: [{ ruleId: 'DOM_TARGET_HIDDEN', severity: 'warning', title: 'Target hidden', message: 'target hidden', selector: '#zw-slider', target: 'zw-slider', evidence: ['display=none'], suggestedOwner: 'engines/ZoomEngine.js' }], evidence: ['display=none'], suggestedOwner: 'engines/ZoomEngine.js', limits: { maxTargets: 80, maxFindings: 80, maxEvidence: 12, maxAncestors: 6 } },
      causalIntelligence: { status: 'warning', summary: { bugsSuspected: 1, critical: 0, warnings: 1, unknown: 0, evidenceChains: 1 }, diagnoses: [{ id: 'causal-1', bugFamily: 'ui-dom', severity: 'warning', title: 'UI/DOM causal correlation', message: 'synthetic causal signal', causalChain: ['sig-1'], evidence: ['DOM_TARGET_HIDDEN'], layer: 'dom', ownerExpected: 'engines/ZoomEngine.js', writerActual: null, invariant: 'DOM_BLOCKED_BUT_CONTROL_INTERACTIVE', confidence: 'medium', nextAction: 'inspect DOM', doNotPatchYet: true }], invariants: [{ id: 'DOM_BLOCKED_BUT_CONTROL_INTERACTIVE', project: 'reportforge', description: 'synthetic', appliesWhen: 'synthetic', severity: 'warning', ownerExpected: 'engines/ZoomEngine.js', evidenceRequired: ['domScanner.findings'], violated: true, evidence: ['DOM_TARGET_HIDDEN'], result: 'violated' }], evidenceChains: [{ id: 'chain:causal-1', name: 'causal-1', events: [{ id: 'sig-1', source: 'domScanner', ruleId: 'DOM_TARGET_HIDDEN', severity: 'warning', selector: '#zw-slider', path: null, requestId: null, transactionId: null, renderId: null, eventId: null, ownerExpected: 'engines/ZoomEngine.js', writerActual: null }], snapshots: [{ source: 'domScanner', status: 'warning', summary: 1 }], result: 'suspected', confidence: 'medium' }], ownershipViolations: [], unknowns: [], confidence: { overall: 'medium', reason: 'synthetic' }, recommendations: [{ title: 'UI/DOM causal correlation', action: 'inspect DOM', doNotPatchYet: true, ownerExpected: 'engines/ZoomEngine.js', confidence: 'medium' }], limits: { maxDiagnoses: 50, maxEvidencePerDiagnosis: 12, maxChains: 30 } },
      renderPreview: { status: 'warning', mode: 'preview', lifecycle: { lastPreviewEvent: { source: 'PreviewEngineMode.show', action: 'show' }, lastRenderEvent: { source: 'PreviewEngineRenderer.refresh', action: 'refresh' }, lastExportEvent: null }, previewDom: { rootExists: true, contentExists: true, visible: true, pageCount: 1, rect: { left: 0, top: 0, width: 1000, height: 700 }, transform: 'none', scale: 1, rendererTargetSelector: '#preview-content' }, network: { previewRequests: [], renderRequests: [{ requestId: 'rp-1', transactionId: 'rp-1', method: 'POST', url: '/render', path: '/render', status: 200, ok: true, contentType: 'application/json', durationMs: 320, startedAt: '2026-05-22T07:42:06.000Z', endedAt: '2026-05-22T07:42:06.320Z', requestSummary: {}, responseSummary: {}, error: null, sensitiveFieldsRedacted: [] }], auditRequests: [], exportRequests: [], failed: [], slow: [] }, correlations: { timeline: ['PreviewEngineRenderer.refresh'], performance: ['render slow op'], asyncRace: ['RENDER_MISSING_END'] }, findings: [{ code: 'PREVIEW_REQUEST_SLOW', severity: 'warning', ownerExpected: 'engines/PreviewEngineRenderer.js', evidence: ['slow render request'] }], evidence: ['render preview warning'], suggestedOwner: 'engines/PreviewEngineRenderer.js' },
      dom: { status: 'synced', summary: { criticalNodes: 6 }, findings: [], owners: ['engines/ZoomEngine.js'] },
      ownership: { tool: 'RF Debug Center' },
      build: { commit: 'abc123', assetVersion: '2026-05-22T07:42:06Z' },
    },
    traceApi: trace,
    doc,
    win,
    ownership: { tool: 'RF Debug Center', subsystems: [] },
  });

  assert.equal(bundle.schema, 'rf-debug-bundle/v1');
  assert.equal(bundle.project, 'reportforge');
  assert.equal(bundle.tool.name, 'RF Debug Center');
  assert.equal(bundle.session.flags.query, true);
  assert.equal(bundle.session.flags.localStorage, false);
  assert.equal(bundle.session.sourceState, 'present');
  assert.equal(bundle.timeline.state, 'present');
  assert.equal(bundle.timeline.count, 1);
  assert.equal(bundle.zoom.status, 'synced');
  assert.equal(bundle.network.status, 'ok');
    assert.equal(bundle.performance.status, 'ok');
    assert.equal(bundle.selection.status, 'warning');
    assert.equal(bundle.renderPreview.status, 'warning');
    assert.equal(bundle.dom.status, 'synced');
  assert.ok(bundle.ownership);
  assert.equal(bundle.domScanner.status, 'warning');
  assert.equal(bundle.causalIntelligence.status, 'warning');
  assert.ok(bundle.governance.roadmap.some((item) => /Z2 LISTO/.test(item)));
  assert.ok(bundle.governance.roadmap.some((item) => /X1 LISTO/.test(item)));
  assert.ok(bundle.governance.backlog.some((item) => /histórico superado/.test(item)));
  assert.equal(bundle.evidence.trace[0].before.password, '[REDACTED]');
  assert.equal(bundle.evidence.trace[0].before.nested.apiKey, '[REDACTED]');
  assert.ok(bundle.evidence.trace[0].after.long.length <= 1000);
  assert.ok(bundle.evidence.trace[0].after.list.length <= 200);
  assert.equal(JSON.parse(serializeDebugBundle(bundle)).schema, 'rf-debug-bundle/v1');
  assert.equal(createBundleFilename(new Date('2026-05-22T07:42:06Z')), 'rf-debug-bundle-20260522-074206.json');
});

test('rf debug center bundle export and copy helpers are safe without clipboard', async () => {
  const bundle = buildDebugBundle({ state: { enabled: true, activation: 'query:rfDebugCenter', timeline: { paused: false, sourceState: 'empty', sourceCount: 0, total: 0, counts: { debug: 0, info: 0, warning: 0, error: 0 }, recent: [], entries: [], lastEvent: null }, zoom: { status: 'unknown' }, dom: { status: 'unknown' } }, traceApi: null, doc: makeFakeDoc(), win: makeFakeWin(), ownership: { tool: 'RF Debug Center' } });
  const copied = await copyDebugBundleJSON(bundle, { win: makeFakeWin() });
  assert.equal(JSON.parse(copied).schema, 'rf-debug-bundle/v1');
  const exported = exportDebugBundle(bundle, { doc: { body: { appendChild: (node) => { node.__appended = true; }, }, createElement: () => ({ style: {}, click: () => {}, remove: () => {} }) }, win: makeFakeWin() });
  assert.equal(exported.ok, true);
  assert.match(exported.filename, /^rf-debug-bundle-\d{8}-\d{6}\.json$/);
});

test('rf debug center bundle api works in live runtime', { timeout: 120000 }, async () => {
  const server = await startRuntimeServer();
  const debugUrl = new URL(server.baseUrl);
  debugUrl.searchParams.set('rfDebugCenter', '1');
  const { browser, page, consoleErrors } = await launchRuntimePage(debugUrl.toString());

  try {
    await page.waitForFunction(() => window.RFDebugCenter?.enabled === true);
    await enterPreview(page);
    await page.locator('#zw-in').click();
    await page.waitForFunction(() => (window.RFDebugCenter?.getState?.()?.timeline?.total || 0) > 0);

    const bundle = await page.evaluate(() => window.RFDebugCenter.buildBundle());
    assert.equal(bundle.schema, 'rf-debug-bundle/v1');
    assert.ok(bundle.timeline.count >= 1);
    assert.equal(bundle.zoom.status, 'synced');
    assert.ok(bundle.network);
    assert.ok(bundle.performance);
    assert.ok(bundle.selection);
    assert.ok(bundle.renderPreview);
    assert.equal(bundle.loopFreeze.status, 'ok');
    assert.ok(Array.isArray(bundle.evidence.trace));
    assert.ok(bundle.evidence.trace.length > 0);
    assert.ok(bundle.ownership);
    assert.ok(bundle.governance.roadmap.some((item) => /B1/.test(item)));

    const exported = await page.evaluate(() => window.RFDebugCenter.exportBundle());
    assert.equal(exported.ok, true);
    assert.match(exported.filename, /^rf-debug-bundle-\d{8}-\d{6}\.json$/);

    const copied = await page.evaluate(() => window.RFDebugCenter.copyBundleJSON());
    assert.match(copied, /"schema": "rf-debug-bundle\/v1"/);

    const panel = await page.evaluate(() => {
      const host = document.getElementById('rf-debug-center-root');
      const shadow = host?.shadowRoot;
      const text = (id) => shadow?.getElementById(id)?.textContent?.replace(/\s+/g, ' ').trim() || '';
      return {
        status: text('rf-debug-center-bundle-status'),
        meta: text('rf-debug-center-bundle-meta'),
        body: text('rf-debug-center-bundle-body'),
      };
    });
    assert.match(panel.status, /copied|exported|ready/);
    assert.match(panel.body, /rf-debug-bundle\/v1/);
    assert.match(bundle.loopFreeze.status, /ok|info|warning|error|unknown/);
    await assertNoConsoleErrors(consoleErrors, 'rf debug center bundle api works in live runtime');
  } finally {
    await browser.close();
    await server.stop();
  }
});
