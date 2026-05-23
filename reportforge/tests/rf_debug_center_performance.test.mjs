import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPerformanceSnapshot,
  clearPerformanceSnapshot,
  copyPerformanceJSON,
  getPerformanceSnapshot,
  installPerformanceObservers,
  recordPerformanceFrameGap,
  recordPerformanceLongTask,
  refreshPerformanceSnapshot,
  uninstallPerformanceObservers,
} from '../../tools/rf-debug-center/rf-debug-center-performance.js';
import { buildDebugBundle } from '../../tools/rf-debug-center/rf-debug-center-bundle.js';
import { startRuntimeServer, launchRuntimePage, enterPreview, assertNoConsoleErrors } from './runtime_harness.mjs';

const now = new Date('2026-05-22T07:42:06.000Z').getTime();
const iso = (offset = 0) => new Date(now + offset).toISOString();
const trace = (entries = []) => ({ sourceState: 'present', total: entries.length, counts: { debug: 0, info: entries.length, warning: 0, error: 0 }, recent: entries.slice(-12), entries, lastEvent: entries.at(-1) || null, paused: false, lastSyncAt: iso() });
const network = (slow = [{ requestId: 'net-1', transactionId: 'net-1', method: 'POST', path: '/render', url: '/render', status: 200, ok: true, contentType: 'application/json', durationMs: 1200, startedAt: iso(-1200), endedAt: iso(), ownerExpected: 'engines/PreviewEngineRenderer.js' }]) => ({ status: slow.length ? 'warning' : 'ok', observerStatus: 'installed', activeRequests: [], completedRequests: slow, failedRequests: [], slowRequests: slow, counters: { total: slow.length, active: 0, completed: slow.length, failed: 0, slow: slow.length }, risk: { level: slow.length ? 'medium' : 'none', reason: slow.length ? 'slow request' : 'healthy' }, evidence: ['slow request'] });
const loopFreeze = (status = 'ok') => ({ status, risk: { level: status === 'ok' ? 'none' : 'medium', reason: status }, evidence: status === 'ok' ? [] : ['loop risk'], suggestedOwner: 'tools/rf-debug-center/rf-debug-center-loop-freeze.js' });
const asyncRace = (status = 'ok') => ({ status, risk: { level: status === 'ok' ? 'none' : 'medium', reason: status }, raceFindings: status === 'ok' ? [] : [{ ruleId: 'MISSING_END_EVENT' }], missingEnds: status === 'ok' ? [] : [{ ruleId: 'MISSING_END_EVENT' }], evidence: status === 'ok' ? [] : ['async risk'], suggestedOwner: 'tools/rf-debug-center/rf-debug-center-async-race.js' });
function fakeObserverWin() {
  const rafs = [];
  class FakePerformanceObserver {
    constructor(callback) { this.callback = callback; FakePerformanceObserver.instance = this; }
    observe() { this.observed = true; }
    disconnect() { this.disconnected = true; }
    emit(entries) { this.callback({ getEntries: () => entries }); }
  }
  return {
    location: { href: 'http://example.test/designer?rfDebugCenter=1', pathname: '/designer', search: '?rfDebugCenter=1', hash: '' },
    document: { visibilityState: 'visible' },
    performance: { now: () => 1000 },
    PerformanceObserver: FakePerformanceObserver,
    requestAnimationFrame: (cb) => { rafs.push(cb); return rafs.length; },
    cancelAnimationFrame: () => {},
    __rafs: rafs,
    navigator: {},
  };
}

test('rf debug center performance handles missing browser APIs', () => {
  clearPerformanceSnapshot();
  const snapshot = buildPerformanceSnapshot();
  assert.equal(snapshot.status, 'unknown');
  assert.equal(snapshot.eventRate.total, 0);
  assert.doesNotThrow(() => JSON.parse(copyPerformanceJSON()));
  const installed = installPerformanceObservers({ location: { href: 'http://example.test/' }, navigator: {} });
  assert.match(installed.status, /unknown|ok/);
  uninstallPerformanceObservers({ cancelAnimationFrame: () => {} });
});

test('rf debug center performance detects slow events rate requests tasks and frame gaps', () => {
  clearPerformanceSnapshot();
  const entries = [
    { timestamp: iso(0), source: 'ZoomEngine', module: 'ZoomEngine', action: 'wheel', durationMs: 140, severity: 'info', ownerExpected: 'engines/ZoomEngine.js' },
    ...Array.from({ length: 70 }, (_, i) => ({ timestamp: iso(100 + i * 10), source: 'GlobalEventHandlers', module: 'ZoomEngine', action: 'wheel', durationMs: i === 60 ? 150 : 8, severity: 'info', ownerExpected: 'engines/GlobalEventHandlers.js' })),
  ];
  const snapshot = refreshPerformanceSnapshot({ timeline: trace(entries), network: network(), loopFreeze: loopFreeze('warning'), asyncRace: asyncRace('warning'), warnings: { status: 'warning', total: 1 }, active: true, win: { performance: { now: () => 2222 }, document: { visibilityState: 'visible' } } });
  assert.equal(snapshot.slowEvents.length >= 1, true);
  assert.equal(snapshot.eventRate.perSecond > 12, true);
  assert.equal(snapshot.slowRequests.length >= 1, true);
  assert.equal(snapshot.correlations.loopFreeze.risk, 'medium');
  assert.equal(snapshot.correlations.asyncRace.risk, 'medium');
  assert.ok(snapshot.topSlowOperations.length >= 1);
  assert.match(snapshot.status, /warning|error|info|ok|unknown/);
});

test('rf debug center performance records long tasks and frame gaps with observers', () => {
  clearPerformanceSnapshot();
  const win = fakeObserverWin();
  installPerformanceObservers(win);
  win.PerformanceObserver.instance.emit([{ entryType: 'longtask', name: 'task', duration: 80 }]);
  assert.equal(getPerformanceSnapshot().longTasks.length, 1);
  win.__rafs.at(-1)(0);
  win.__rafs.at(-1)(400);
  const snapshot = refreshPerformanceSnapshot({ timeline: trace(), network: network([]), loopFreeze: loopFreeze('ok'), asyncRace: asyncRace('ok'), warnings: { status: 'unknown', total: 0 }, active: true, win });
  assert.equal(snapshot.frameGaps.length >= 1, true);
  assert.doesNotThrow(() => JSON.parse(copyPerformanceJSON()));
  uninstallPerformanceObservers(win);
});

test('rf debug center performance integrates into bundle and live runtime safely', { timeout: 120000 }, async () => {
  const bundle = buildDebugBundle({
    state: {
      enabled: true,
      timeline: trace([{ timestamp: iso(), source: 'ZoomEngine', module: 'ZoomEngine', action: 'wheel', durationMs: 120, severity: 'info' }]),
      zoom: { status: 'synced', mode: 'preview', zoom: { dsZoom: 1.5, dsZoomDesign: 1, dsZoomPreview: 1.5, effectiveZoom: 1.5 } },
      network: network(),
      loopFreeze: loopFreeze('warning'),
      asyncRace: asyncRace('warning'),
      performance: { status: 'warning', risk: { level: 'medium', reason: 'event rate high' }, eventRate: { windowMs: 5000, total: 80, perSecond: 16, topActions: [{ source: 'ZoomEngine', module: 'ZoomEngine', action: 'wheel', count: 80 }] }, slowEvents: [{ label: 'ZoomEngine · wheel', durationMs: 120, source: 'ZoomEngine', module: 'ZoomEngine', action: 'wheel', evidence: ['duration=120'] }], slowRequests: [], longTasks: [], frameGaps: [], topSlowOperations: [], correlations: { loopFreeze: { status: 'warning', risk: 'medium', reason: 'loop', evidence: ['loop'] }, asyncRace: { status: 'warning', risk: 'medium', reason: 'async', evidence: ['async'] }, network: { status: 'warning', risk: 'medium', reason: 'network', evidence: ['network'] } }, limits: { maxEntries: 50, slowEventThresholdMs: 100, slowRequestThresholdMs: 1000, frameGapThresholdMs: 250, longTaskThresholdMs: 50, windowMs: 5000, eventRateThreshold: 12 }, evidence: ['eventRate 16/s'] },
      dom: { status: 'synced', findings: [], owners: ['designer/crystal-reports-designer-v4.html'] },
    },
    traceApi: { getEntries: () => [], snapshot: () => null },
    doc: { readyState: 'complete' },
    win: { location: { href: 'http://example.test/?rfDebugCenter=1', pathname: '/', search: '?rfDebugCenter=1', hash: '' }, innerWidth: 800, innerHeight: 600, devicePixelRatio: 1, navigator: { clipboard: { writeText: async () => {} } }, URL: {}, Blob: null },
    ownership: { tool: 'RF Debug Center' },
  });
  assert.equal(bundle.performance.status, 'warning');
  assert.ok(Array.isArray(bundle.performance.topSlowOperations));

  const server = await startRuntimeServer();
  const debugUrl = new URL(server.baseUrl);
  debugUrl.searchParams.set('rfDebugCenter', '1');
  const { browser, page, consoleErrors } = await launchRuntimePage(debugUrl.toString());
  try {
    await page.waitForFunction(() => window.RFDebugCenter?.enabled === true);
    await enterPreview(page);
    const before = await page.evaluate(() => ({ traceLength: (window.RF_UI_TRACE?.getEntries?.() ?? []).length, ds: window.DS ? { zoom: window.DS.zoom, zoomDesign: window.DS.zoomDesign, zoomPreview: window.DS.zoomPreview } : null }));
    const result = await page.evaluate(() => {
      const fetchBefore = window.fetch;
      const xhrBefore = window.XMLHttpRequest;
      window.RFDebugCenter.refreshPerformance();
      const state = window.RFDebugCenter.getState();
      const host = document.getElementById('rf-debug-center-root');
      const shadow = host?.shadowRoot;
      const text = (id) => shadow?.getElementById(id)?.textContent?.replace(/\s+/g, ' ').trim() || '';
      return {
        performance: state.performance,
        traceLength: (window.RF_UI_TRACE?.getEntries?.() ?? []).length,
        fetchUnchanged: window.fetch === fetchBefore,
        xhrUnchanged: window.XMLHttpRequest === xhrBefore,
        panel: { status: text('rf-debug-center-performance-status'), meta: text('rf-debug-center-performance-meta'), body: text('rf-debug-center-performance-body') },
        copy: window.RFDebugCenter.copyPerformanceJSON(),
        ds: window.DS ? { zoom: window.DS.zoom, zoomDesign: window.DS.zoomDesign, zoomPreview: window.DS.zoomPreview } : null,
      };
    });
    assert.ok(result.performance);
    assert.equal(result.fetchUnchanged, true);
    assert.equal(result.xhrUnchanged, true);
    assert.equal(result.traceLength, before.traceLength);
    assert.deepEqual(result.ds, before.ds);
    assert.match(result.panel.status, /(ok|info|warning|error|unknown)/);
    assert.doesNotThrow(() => JSON.parse(result.copy));
    assert.ok(result.panel.body.includes('event rate'));
    await assertNoConsoleErrors(consoleErrors, 'rf debug center performance live runtime');
  } finally {
    await browser.close();
    await server.stop();
  }
});
