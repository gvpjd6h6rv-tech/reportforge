import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDebugBundle } from '../../tools/rf-debug-center/rf-debug-center-bundle.js';
import {
  buildLoopFreezeSnapshot,
  clearLoopFreezeSnapshot,
  copyLoopFreezeJSON,
  getLoopFreezeSnapshot,
  refreshLoopFreezeSnapshot,
} from '../../tools/rf-debug-center/rf-debug-center-loop-freeze.js';
import { startRuntimeServer, launchRuntimePage, enterPreview, assertNoConsoleErrors } from './runtime_harness.mjs';

function entry(source, action, timestamp, extra = {}) {
  return { timestamp, source, module: extra.module || source, action, severity: extra.severity || 'info', durationMs: extra.durationMs || 4, ownerExpected: extra.ownerExpected || null, writerActual: extra.writerActual || null, eventId: extra.eventId || null };
}

function timeline(entries, lastSyncAt = entries.at(-1)?.timestamp || null, sourceState = 'present') {
  return { paused: false, sourceState, sourceCount: entries.length, lastSyncAt, total: entries.length, counts: { debug: 0, info: entries.length, warning: 0, error: 0 }, recent: entries.slice(-12), entries, lastEvent: entries.at(-1) || null };
}

const Z = '2026-05-22T07:42:06.000Z';

test('rf debug center loop freeze pure fixtures detect storms loops gaps and clear/copy', () => {
  const originalTrace = [{ kind: 'ui', source: 'A', action: 'wheel', timestamp: Z }];
  const frozenTrace = JSON.stringify(originalTrace);
  const previousDs = globalThis.DS;
  let gap = null;
  globalThis.DS = { zoom: 1, zoomDesign: 1, zoomPreview: 1 };
  try {
    const storm = buildLoopFreezeSnapshot({ timeline: timeline(Array.from({ length: 6 }, (_, i) => entry('GlobalEventHandlers.wheel', 'wheel', `2026-05-22T07:42:06.${String(i).padStart(3, '0')}Z`, { module: 'ZoomEngine', writerActual: 'GlobalEventHandlers.wheel', ownerExpected: 'engines/ZoomEngine.js' }))), traceState: 'present', now: '2026-05-22T07:42:07.000Z' });
    assert.equal(storm.eventStorms[0].code, 'EVENT_STORM');
    assert.equal(storm.repeatedHandlers[0].code, 'REPEATED_HANDLER');

    const loop = buildLoopFreezeSnapshot({ timeline: timeline([entry('A', 'a', `${Z}`), entry('B', 'b', `2026-05-22T07:42:06.100Z`), entry('C', 'c', `2026-05-22T07:42:06.200Z`), entry('A', 'a', `2026-05-22T07:42:06.300Z`), entry('B', 'b', `2026-05-22T07:42:06.400Z`), entry('C', 'c', `2026-05-22T07:42:06.500Z`), entry('A', 'a', `2026-05-22T07:42:06.600Z`), entry('B', 'b', `2026-05-22T07:42:06.700Z`), entry('C', 'c', `2026-05-22T07:42:06.800Z`)]), traceState: 'present', now: '2026-05-22T07:42:10.000Z' });
    assert.equal(loop.possibleLoops[0].code, 'POSSIBLE_LOOP_PATTERN');

    gap = buildLoopFreezeSnapshot({ timeline: timeline([entry('X', 'tick', '2026-05-22T07:41:00.000Z')], '2026-05-22T07:41:00.000Z', 'present'), traceState: 'present', now: '2026-05-22T07:42:06.000Z', previous: loop });
    assert.equal(gap.heartbeat.thresholdMs, 1800);
    assert.equal(gap.heartbeat.gapMs, 66000);
    assert.ok(gap.lastEvents.length <= 12);
    assert.equal(new Set(gap.eventStorms.map((item) => item.code)).size, gap.eventStorms.length);

    refreshLoopFreezeSnapshot({ timeline: timeline([entry('D', 'd', '2026-05-22T07:42:06.000Z')]), traceState: 'present', now: '2026-05-22T07:42:07.000Z' });
    assert.doesNotThrow(() => JSON.parse(copyLoopFreezeJSON()));
    clearLoopFreezeSnapshot();
    assert.equal(getLoopFreezeSnapshot().status, 'unknown');
    assert.equal(JSON.stringify(originalTrace), frozenTrace);
    assert.deepEqual(globalThis.DS, { zoom: 1, zoomDesign: 1, zoomPreview: 1 });
  } finally {
    if (previousDs === undefined) delete globalThis.DS;
    else globalThis.DS = previousDs;
  }

  const bundle = buildDebugBundle({ state: { enabled: true, timeline: gap, zoom: { status: 'synced' }, dom: { status: 'synced' }, loopFreeze: gap }, traceApi: null, doc: { readyState: 'complete' }, win: { location: { href: 'http://example.test/?rfDebugCenter=1', pathname: '/', search: '?rfDebugCenter=1', hash: '' }, innerWidth: 800, innerHeight: 600, devicePixelRatio: 1, navigator: {}, URL: {}, Blob: null }, ownership: { tool: 'RF Debug Center' } });
  assert.equal(bundle.loopFreeze.status, gap.status);
});

test('rf debug center loop freeze live runtime panel stays read-only and visible', { timeout: 120000 }, async () => {
  const server = await startRuntimeServer();
  const debugUrl = new URL(server.baseUrl);
  debugUrl.searchParams.set('rfDebugCenter', '1');
  const { browser, page, consoleErrors } = await launchRuntimePage(debugUrl.toString());
  try {
    await page.waitForFunction(() => window.RFDebugCenter?.enabled === true);
    await enterPreview(page);
    await page.evaluate(() => window.RFDebugCenter.refreshLoopFreeze());
    const snapshot = await page.evaluate(() => {
      const host = document.getElementById('rf-debug-center-root');
      const shadow = host?.shadowRoot;
      const text = (id) => shadow?.getElementById(id)?.textContent?.replace(/\s+/g, ' ').trim() || '';
      return {
        state: window.RFDebugCenter?.getState?.()?.loopFreeze || null,
        status: text('rf-debug-center-loop-freeze-status'),
        panelExists: !!shadow?.getElementById('rf-debug-center-loop-freeze-panel'),
        ds: window.DS ? { zoom: window.DS.zoom, zoomDesign: window.DS.zoomDesign, zoomPreview: window.DS.zoomPreview } : null,
        traceLength: (window.RF_UI_TRACE?.getEntries?.() ?? []).length,
      };
    });
    assert.equal(snapshot.panelExists, true);
    assert.match(snapshot.status, /(ok|info|warning|error|unknown)/);
    assert.ok(snapshot.state);
    assert.equal(snapshot.traceLength > 0, true);
    assert.ok(snapshot.ds);
    await assertNoConsoleErrors(consoleErrors, 'rf debug center loop freeze live runtime panel');
  } finally {
    await browser.close();
    await server.stop();
  }
});
