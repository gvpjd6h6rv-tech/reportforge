import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDebugBundle } from '../../tools/rf-debug-center/rf-debug-center-bundle.js';
import { buildWarningsSnapshot, dedupeWarnings } from '../../tools/rf-debug-center/rf-debug-center-warnings.js';
import { clearDebugCenterWarnings, copyDebugCenterWarningsJSON } from '../../tools/rf-debug-center/rf-debug-center-store.js';
import { startRuntimeServer, launchRuntimePage, enterPreview, assertNoConsoleErrors } from './runtime_harness.mjs';

function traceApi(entries = [], snapshot = null) {
  let clearCalls = 0;
  return {
    get clearCalls() { return clearCalls; },
    getEntries: () => entries,
    snapshot: () => snapshot,
    clear: () => { clearCalls += 1; },
  };
}

test('rf debug center warnings classify evidence and dedupe', () => {
  const absent = buildWarningsSnapshot({ traceState: 'absent', ownership: { tool: 'RF Debug Center' } });
  assert.equal(absent.status, 'warning');
  assert.equal(absent.warnings[0].ruleId, 'RF_UI_TRACE_ABSENT');

  const invalid = buildWarningsSnapshot({ traceState: 'invalid', ownership: { tool: 'RF Debug Center' } });
  assert.equal(invalid.status, 'error');
  assert.equal(invalid.warnings[0].ruleId, 'RF_UI_TRACE_INVALID');

  const activeEmpty = buildWarningsSnapshot({ traceState: 'present', timeline: { paused: false, total: 0 }, active: true, ownership: { tool: 'RF Debug Center' } });
  assert.equal(activeEmpty.warnings[0].ruleId, 'TIMELINE_EMPTY_WHILE_ACTIVE');

  const zoom = buildWarningsSnapshot({ traceState: 'present', timeline: { paused: false, total: 1 }, zoom: { status: 'warning', divergences: ['slider-mismatch'], suggestedOwner: 'engines/ZoomEngine.js' }, ownership: { tool: 'RF Debug Center' } });
  assert.equal(zoom.warnings[0].ruleId, 'ZOOM_DIVERGENCE');
  assert.equal(zoom.warnings[0].suggestedOwner, 'engines/ZoomEngine.js');

  const dom = buildWarningsSnapshot({ traceState: 'present', timeline: { paused: false, total: 1 }, dom: { status: 'error', findings: [{ code: 'duplicate-id' }], owners: ['designer/crystal-reports-designer-v4.html'] }, ownership: { tool: 'RF Debug Center' } });
  assert.equal(dom.warnings[0].ruleId, 'DOM_DIVERGENCE');

  const domScanner = buildWarningsSnapshot({ traceState: 'present', timeline: { paused: false, total: 1 }, domScanner: { status: 'warning', findings: [{ ruleId: 'DOM_TARGET_HIDDEN', selector: '#zw-slider' }], suggestedOwner: 'engines/ZoomEngine.js' }, ownership: { tool: 'RF Debug Center' } });
  assert.equal(domScanner.warnings.some((item) => item.ruleId === 'DOM_SCANNER_RISK'), true);

  const causalBug = buildWarningsSnapshot({ traceState: 'present', timeline: { paused: false, total: 1 }, causalIntelligence: { status: 'warning', summary: { bugsSuspected: 1, critical: 0, warnings: 1, unknown: 0, evidenceChains: 1 }, diagnoses: [{ bugFamily: 'ui-dom', invariant: 'DOM_BLOCKED_BUT_CONTROL_INTERACTIVE', ownerExpected: 'engines/ZoomEngine.js', evidence: ['DOM_TARGET_HIDDEN'] }], unknowns: [] }, ownership: { tool: 'RF Debug Center' } });
  assert.equal(causalBug.warnings.some((item) => item.ruleId === 'CAUSAL_BUG_SUSPECTED'), true);

  const causalUnknown = buildWarningsSnapshot({ traceState: 'present', timeline: { paused: false, total: 1 }, causalIntelligence: { status: 'info', summary: { bugsSuspected: 0, critical: 0, warnings: 0, unknown: 1, evidenceChains: 0 }, diagnoses: [], unknowns: [{ id: 'unknown:1', message: 'UNKNOWN / INSUFFICIENT_EVIDENCE: gap' }] }, ownership: { tool: 'RF Debug Center' } });
  assert.equal(causalUnknown.warnings.some((item) => item.ruleId === 'CAUSAL_UNKNOWN_EVIDENCE_GAP'), true);

  const ownership = buildWarningsSnapshot({ traceState: 'present', timeline: { paused: false, total: 1 }, ownership: null });
  assert.equal(ownership.warnings[0].ruleId, 'OWNERSHIP_MAP_MISSING');

  const bundleError = buildWarningsSnapshot({ traceState: 'present', timeline: { paused: false, total: 1 }, bundle: { status: 'error', message: 'boom' }, ownership: { tool: 'RF Debug Center' } });
  assert.equal(bundleError.warnings[0].ruleId, 'BUNDLE_EXPORT_ERROR');

  const loopFreeze = buildWarningsSnapshot({ traceState: 'present', timeline: { paused: false, total: 1 }, loopFreeze: { status: 'warning', evidence: ['storm'] }, ownership: { tool: 'RF Debug Center' } });
  assert.equal(loopFreeze.warnings[0].ruleId, 'LOOP_FREEZE_RISK');

  const asyncRace = buildWarningsSnapshot({ traceState: 'present', timeline: { paused: false, total: 1 }, asyncRace: { status: 'warning', evidence: ['tx-1 -> tx-2'] }, ownership: { tool: 'RF Debug Center' } });
  assert.equal(asyncRace.warnings[0].ruleId, 'ASYNC_RACE_RISK');

  const performance = buildWarningsSnapshot({
    traceState: 'present',
    timeline: { paused: false, total: 2 },
    performance: {
      status: 'warning',
      risk: { level: 'medium', reason: 'event rate high' },
      eventRate: { windowMs: 5000, total: 90, perSecond: 18, topActions: [{ source: 'ZoomEngine', module: 'ZoomEngine', action: 'wheel', count: 90 }] },
      slowEvents: [{ label: 'ZoomEngine · wheel', durationMs: 140, source: 'ZoomEngine', module: 'ZoomEngine', action: 'wheel', evidence: ['duration=140'] }],
      slowRequests: [],
      longTasks: [],
      frameGaps: [],
      topSlowOperations: [],
      correlations: { loopFreeze: { risk: 'medium' }, asyncRace: { risk: 'low' }, network: { risk: 'low' } },
      limits: { eventRateThreshold: 12 },
      evidence: ['eventRate 18/s'],
      suggestedOwner: 'engines/ZoomEngine.js',
    },
    ownership: { tool: 'RF Debug Center' },
  });
  assert.equal(performance.warnings.some((item) => item.ruleId === 'PERFORMANCE_RISK'), true);
  assert.equal(performance.warnings.some((item) => item.ruleId === 'EVENT_RATE_HIGH'), true);
  assert.equal(performance.warnings.some((item) => item.ruleId === 'SLOW_EVENT'), true);

  const selection = buildWarningsSnapshot({ traceState: 'present', timeline: { paused: false, total: 1 }, selection: { status: 'warning', findings: [{ code: 'MODEL_DOM_POSITION_DRIFT' }], suggestedOwner: 'engines/SelectionOverlay.js' }, ownership: { tool: 'RF Debug Center' } });
  assert.equal(selection.warnings.some((item) => item.ruleId === 'SELECTION_RISK'), true);

  const renderPreview = buildWarningsSnapshot({ traceState: 'present', timeline: { paused: false, total: 1 }, renderPreview: { status: 'warning', findings: [{ code: 'PREVIEW_REQUEST_SLOW' }], suggestedOwner: 'engines/PreviewEngineRenderer.js' }, ownership: { tool: 'RF Debug Center' } });
  assert.equal(renderPreview.warnings.some((item) => item.ruleId === 'RENDER_PREVIEW_RISK'), true);

  const network = buildWarningsSnapshot({ traceState: 'present', timeline: { paused: false, total: 1 }, network: { status: 'warning', observerStatus: 'installed', failedRequests: [{ method: 'POST', path: '/render', status: 500, error: 'boom', ownerExpected: 'engines/PreviewEngineRenderer.js' }], slowRequests: [], activeRequests: [], redactions: 1 }, ownership: { tool: 'RF Debug Center' } });
  assert.equal(network.warnings.some((item) => item.ruleId === 'NETWORK_REQUEST_FAILED'), true);
  assert.equal(network.warnings.some((item) => item.ruleId === 'NETWORK_REDACTION_APPLIED'), true);

  const paused = buildWarningsSnapshot({ traceState: 'present', timeline: { paused: true, total: 1 }, ownership: { tool: 'RF Debug Center' } });
  assert.equal(paused.warnings[0].ruleId, 'SOURCE_PAUSED');

  const deduped = dedupeWarnings([
    { ruleId: 'A', source: 'x', message: 'm', evidence: ['e'] },
    { ruleId: 'A', source: 'x', message: 'm', evidence: ['e'] },
    { ruleId: 'B', source: 'x', message: 'm', evidence: ['e'] },
  ]);
  assert.equal(deduped.length, 2);
});

test('rf debug center warnings bundle integration and copy helpers stay read-only', () => {
  const warnings = buildWarningsSnapshot({
    traceState: 'present',
    timeline: { paused: false, total: 1, counts: { info: 1, warning: 0, error: 0 }, recent: [], entries: [], lastEvent: null },
    zoom: { status: 'warning', divergences: ['slider-mismatch'], suggestedOwner: 'engines/ZoomEngine.js' },
  });
  const bundle = buildDebugBundle({ state: { enabled: true, warnings, timeline: { paused: false, sourceState: 'present', sourceCount: 1, total: 1, counts: { debug: 0, info: 1, warning: 0, error: 0 }, recent: [], entries: [], lastEvent: null }, zoom: { status: 'synced' }, asyncRace: { status: 'warning', evidence: ['request 1 -> request 2'] }, dom: { status: 'synced' } }, traceApi: traceApi([], { dsZoom: 1 }), doc: { readyState: 'complete' }, win: { location: { href: 'http://example.test/?rfDebugCenter=1', pathname: '/', search: '?rfDebugCenter=1', hash: '' }, innerWidth: 800, innerHeight: 600, devicePixelRatio: 1, navigator: { clipboard: { writeText: async () => {} } }, URL: {}, Blob: null }, ownership: { tool: 'RF Debug Center' } });
  assert.equal(bundle.warnings.total, warnings.total);
  assert.equal(bundle.warnings.warnings[0].ruleId, 'ZOOM_DIVERGENCE');
  assert.equal(bundle.asyncRace.status, 'warning');
  assert.ok(bundle.renderPreview == null || typeof bundle.renderPreview === 'object');
  assert.ok(bundle.network == null || typeof bundle.network === 'object');
  const json = JSON.parse(JSON.stringify(bundle));
  assert.equal(json.schema, 'rf-debug-bundle/v1');
});

test('rf debug center warnings clear and copy helpers are controlled', () => {
  const before = clearDebugCenterWarnings();
  assert.equal(before.status, 'unknown');
  const copied = copyDebugCenterWarningsJSON();
  assert.match(copied, /"status": "unknown"/);
  assert.doesNotThrow(() => JSON.parse(copied));
});

test('rf debug center warnings live runtime panel does not mutate DS or RF_UI_TRACE', { timeout: 120000 }, async () => {
  const server = await startRuntimeServer();
  const debugUrl = new URL(server.baseUrl);
  debugUrl.searchParams.set('rfDebugCenter', '1');
  const { browser, page, consoleErrors } = await launchRuntimePage(debugUrl.toString());
  try {
    await page.waitForFunction(() => window.RFDebugCenter?.enabled === true);
    await enterPreview(page);

    const before = await page.evaluate(() => ({
      ds: window.DS ? {
        zoom: window.DS.zoom,
        zoomDesign: window.DS.zoomDesign,
        zoomPreview: window.DS.zoomPreview,
        previewMode: window.DS.previewMode,
      } : null,
      traceLength: (window.RF_UI_TRACE?.getEntries?.() ?? []).length,
    }));

    const result = await page.evaluate(() => {
      window.__rfWarnClearCalls = 0;
      if (window.RF_UI_TRACE) {
        window.RF_UI_TRACE.clear = () => { window.__rfWarnClearCalls += 1; };
      }
      window.RFDebugCenter.refreshWarnings();
      const state = window.RFDebugCenter.getState();
      return {
        warnings: state.warnings,
        ds: window.DS ? {
          zoom: window.DS.zoom,
          zoomDesign: window.DS.zoomDesign,
          zoomPreview: window.DS.zoomPreview,
          previewMode: window.DS.previewMode,
        } : null,
        traceLength: (window.RF_UI_TRACE?.getEntries?.() ?? []).length,
        clearCalls: window.__rfWarnClearCalls || 0,
        api: {
          enabled: window.RFDebugCenter?.enabled === true,
          copy: window.RFDebugCenter.copyWarningsJSON(),
        },
        panel: (() => {
          const host = document.getElementById('rf-debug-center-root');
          const shadow = host?.shadowRoot;
          const text = (id) => shadow?.getElementById(id)?.textContent?.replace(/\s+/g, ' ').trim() || '';
          return {
            status: text('rf-debug-center-warnings-status'),
            meta: text('rf-debug-center-warnings-meta'),
            body: text('rf-debug-center-warnings-body'),
          };
        })(),
      };
    });

    assert.equal(result.api.enabled, true);
    assert.equal(result.clearCalls, 0);
    assert.deepEqual(result.ds, before.ds);
    assert.equal(result.traceLength, before.traceLength);
    assert.match(result.api.copy, /"status"/);
    assert.match(result.panel.status, /(unknown|info|warning|error)/);
    assert.ok(result.warnings);
    await assertNoConsoleErrors(consoleErrors, 'rf debug center warnings live runtime panel');
  } finally {
    await browser.close();
    await server.stop();
  }
});
