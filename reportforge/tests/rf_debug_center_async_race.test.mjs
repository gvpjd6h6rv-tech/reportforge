import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDebugBundle } from '../../tools/rf-debug-center/rf-debug-center-bundle.js';
import {
  buildAsyncRaceSnapshot,
  clearAsyncRaceSnapshot,
  copyAsyncRaceJSON,
  getAsyncRaceSnapshot,
} from '../../tools/rf-debug-center/rf-debug-center-async-race.js';
import { startRuntimeServer, launchRuntimePage, enterPreview, assertNoConsoleErrors } from './runtime_harness.mjs';

function entry(source, action, timestamp, extra = {}) {
  return { timestamp, source, module: extra.module || source, action, severity: extra.severity || 'info', eventId: extra.eventId || null, transactionId: extra.transactionId || null, requestId: extra.requestId || null, renderId: extra.renderId || null, stateRevision: extra.stateRevision ?? null, mode: extra.mode ?? null, docId: extra.docId ?? null, documentId: extra.documentId ?? null, phase: extra.phase || 'after', result: extra.result || null, error: extra.error || null, ownerExpected: extra.ownerExpected || null, writerActual: extra.writerActual || null };
}

function timeline(entries, sourceState = 'present') {
  return { paused: false, sourceState, sourceCount: entries.length, lastSyncAt: entries.at(-1)?.timestamp || null, total: entries.length, counts: { debug: 0, info: entries.length, warning: 0, error: 0 }, recent: entries.slice(-12), entries, lastEvent: entries.at(-1) || null };
}

const Z = '2026-05-22T07:42:06.000Z';

test('rf debug center async race fixtures detect races and clear/copy safely', () => {
  const outOfOrder = buildAsyncRaceSnapshot({ timeline: timeline([entry('RequestRunner', 'request-start', `${Z}`, { transactionId: 'tx-1', requestId: 'r-1' }), entry('RequestRunner', 'request-start', '2026-05-22T07:42:06.050Z', { transactionId: 'tx-2', requestId: 'r-2' }), entry('RequestRunner', 'request-end', '2026-05-22T07:42:06.060Z', { transactionId: 'tx-2', requestId: 'r-2' }), entry('RequestRunner', 'request-end', '2026-05-22T07:42:06.300Z', { transactionId: 'tx-1', requestId: 'r-1' })]), traceState: 'present', now: '2026-05-22T07:42:06.500Z' });
  assert.equal(outOfOrder.raceFindings.some((item) => item.ruleId === 'OUT_OF_ORDER_RESPONSE'), true);

  const renderOrder = buildAsyncRaceSnapshot({ timeline: timeline([entry('PreviewRenderer', 'render-start', `${Z}`, { renderId: 'render-1' }), entry('PreviewRenderer', 'render-start', '2026-05-22T07:42:06.050Z', { renderId: 'render-2' }), entry('PreviewRenderer', 'render-end', '2026-05-22T07:42:06.060Z', { renderId: 'render-2' }), entry('PreviewRenderer', 'render-end', '2026-05-22T07:42:06.300Z', { renderId: 'render-1' })]), traceState: 'present', now: '2026-05-22T07:42:06.500Z' });
  assert.equal(renderOrder.raceFindings.some((item) => item.ruleId === 'RENDER_AFTER_NEWER_RENDER'), true);

  const revision = buildAsyncRaceSnapshot({ timeline: timeline([entry('DocStore', 'state-update', `${Z}`, { stateRevision: 10 }), entry('DocStore', 'state-update', '2026-05-22T07:42:06.050Z', { stateRevision: 11 }), entry('DocStore', 'state-update', '2026-05-22T07:42:06.100Z', { stateRevision: 9 })]), traceState: 'present', now: '2026-05-22T07:42:06.500Z' });
  assert.equal(revision.raceFindings.some((item) => item.ruleId === 'STATE_REVISION_REGRESSION'), true);

  const stale = buildAsyncRaceSnapshot({ timeline: timeline([entry('ModeSwitch', 'mode-change', `${Z}`, { mode: 'create', docId: 'invoice-a' }), entry('DocWriter', 'write', '2026-05-22T07:42:06.050Z', { mode: 'preview', docId: 'invoice-b' })]), traceState: 'present', now: '2026-05-22T07:42:06.500Z' });
  assert.equal(stale.staleWrites.some((item) => item.ruleId === 'STALE_WRITE_AFTER_MODE_CHANGE'), true);

  const missing = buildAsyncRaceSnapshot({ timeline: timeline([entry('RequestRunner', 'request-start', '2026-05-22T07:41:00.000Z', { transactionId: 'tx-9', requestId: 'r-9' })]), traceState: 'present', now: '2026-05-22T07:42:06.500Z' });
  assert.equal(missing.missingEnds.some((item) => item.ruleId === 'MISSING_END_EVENT'), true);

  const duplicate = buildAsyncRaceSnapshot({ timeline: timeline([entry('RequestRunner', 'request-start', `${Z}`, { transactionId: 'tx-a', requestId: 'r-a' }), entry('RequestRunner', 'request-start', '2026-05-22T07:42:06.050Z', { transactionId: 'tx-b', requestId: 'r-b' }), entry('RequestRunner', 'request-end', '2026-05-22T07:42:06.200Z', { transactionId: 'tx-a', requestId: 'r-a' }), entry('RequestRunner', 'request-end', '2026-05-22T07:42:06.250Z', { transactionId: 'tx-b', requestId: 'r-b' })]), traceState: 'present', now: '2026-05-22T07:42:06.500Z' });
  assert.equal(duplicate.raceFindings.some((item) => item.ruleId === 'DUPLICATE_ACTIVE_TRANSACTION'), true);

  const repeated = buildAsyncRaceSnapshot({ timeline: timeline([entry('RequestRunner', 'request-start', `${Z}`, { transactionId: 'tx-1', requestId: 'r-1' }), entry('RequestRunner', 'request-start', '2026-05-22T07:42:06.050Z', { transactionId: 'tx-2', requestId: 'r-2' }), entry('RequestRunner', 'request-end', '2026-05-22T07:42:06.060Z', { transactionId: 'tx-2', requestId: 'r-2' }), entry('RequestRunner', 'request-end', '2026-05-22T07:42:06.300Z', { transactionId: 'tx-1', requestId: 'r-1' }), entry('RequestRunner', 'request-start', '2026-05-22T07:42:06.400Z', { transactionId: 'tx-1', requestId: 'r-1' }), entry('RequestRunner', 'request-start', '2026-05-22T07:42:06.450Z', { transactionId: 'tx-2', requestId: 'r-2' }), entry('RequestRunner', 'request-end', '2026-05-22T07:42:06.460Z', { transactionId: 'tx-2', requestId: 'r-2' }), entry('RequestRunner', 'request-end', '2026-05-22T07:42:06.800Z', { transactionId: 'tx-1', requestId: 'r-1' })]), traceState: 'present', now: '2026-05-22T07:42:06.900Z' });
  assert.equal(repeated.raceFindings.filter((item) => item.ruleId === 'OUT_OF_ORDER_RESPONSE').length, 1);

  const sparse = buildAsyncRaceSnapshot({ timeline: timeline([entry('Writer', 'write', `${Z}`, { mode: 'preview' })]), traceState: 'present', now: '2026-05-22T07:42:06.500Z' });
  assert.notEqual(sparse.status, 'error');
  assert.equal(sparse.raceFindings.some((item) => item.severity === 'error'), false);

  clearAsyncRaceSnapshot();
  assert.equal(getAsyncRaceSnapshot().status, 'unknown');
  assert.doesNotThrow(() => JSON.parse(copyAsyncRaceJSON()));

  const bundle = buildDebugBundle({ state: { enabled: true, timeline: outOfOrder, zoom: { status: 'synced' }, dom: { status: 'synced' }, asyncRace: outOfOrder }, traceApi: null, doc: { readyState: 'complete' }, win: { location: { href: 'http://example.test/?rfDebugCenter=1', pathname: '/', search: '?rfDebugCenter=1', hash: '' }, innerWidth: 800, innerHeight: 600, devicePixelRatio: 1, navigator: {}, URL: {}, Blob: null }, ownership: { tool: 'RF Debug Center' } });
  assert.equal(bundle.asyncRace.status, outOfOrder.status);
});

test('rf debug center async race live runtime panel stays read-only and visible', { timeout: 120000 }, async () => {
  const server = await startRuntimeServer();
  const debugUrl = new URL(server.baseUrl);
  debugUrl.searchParams.set('rfDebugCenter', '1');
  const { browser, page, consoleErrors } = await launchRuntimePage(debugUrl.toString());
  try {
    await page.waitForFunction(() => window.RFDebugCenter?.enabled === true);
    await enterPreview(page);
    const before = await page.evaluate(() => ({ ds: window.DS ? { zoom: window.DS.zoom, zoomDesign: window.DS.zoomDesign, zoomPreview: window.DS.zoomPreview } : null, traceLength: (window.RF_UI_TRACE?.getEntries?.() ?? []).length }));
    const result = await page.evaluate(() => {
      window.RFDebugCenter.refreshAsyncRace();
      const state = window.RFDebugCenter.getState();
      const host = document.getElementById('rf-debug-center-root');
      const shadow = host?.shadowRoot;
      const text = (id) => shadow?.getElementById(id)?.textContent?.replace(/\s+/g, ' ').trim() || '';
      return { asyncRace: state.asyncRace, ds: window.DS ? { zoom: window.DS.zoom, zoomDesign: window.DS.zoomDesign, zoomPreview: window.DS.zoomPreview } : null, traceLength: (window.RF_UI_TRACE?.getEntries?.() ?? []).length, copy: window.RFDebugCenter.copyAsyncRaceJSON(), panel: { status: text('rf-debug-center-async-race-status'), meta: text('rf-debug-center-async-race-meta'), body: text('rf-debug-center-async-race-body') } };
    });
    assert.ok(result.asyncRace);
    assert.match(result.panel.status, /(ok|info|warning|error|unknown)/);
    assert.deepEqual(result.ds, before.ds);
    assert.equal(result.traceLength, before.traceLength);
    assert.doesNotThrow(() => JSON.parse(result.copy));
    await assertNoConsoleErrors(consoleErrors, 'rf debug center async race live runtime panel');
  } finally {
    await browser.close();
    await server.stop();
  }
});
