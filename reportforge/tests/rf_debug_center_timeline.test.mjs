import test from 'node:test';
import assert from 'node:assert/strict';
import {
  startRuntimeServer,
  launchRuntimePage,
  assertNoConsoleErrors,
} from './runtime_harness.mjs';

function makeWeirdTrace() {
  return [
    {
      kind: 'ui',
      timestamp: null,
      source: 'ZoomEngine.test',
      event: 'wheel',
      severity: 'warning',
      before: { dsZoom: 1 },
      after: { dsZoom: 1.5 },
      dom: { dsZoom: 1.5 },
    },
    {
      kind: 'ui',
      source: 'SelectionOverlay.renderHandles',
      event: 'select',
      action: 'select',
      before: 'bad-before',
      after: 42,
      state: { selected: true },
      dom: { visibleElement: { tag: 'DIV', id: 'sel' } },
      error: { code: 'E1', message: 'boom' },
    },
    {
      kind: 'ui',
      timestamp: '2026-05-22T10:00:00.000Z',
      source: 'PreviewEngineRenderer.refresh',
      event: 'preview-refresh',
      severity: 'error',
      durationMs: '12.5',
      ownerExpected: 'reportforge',
      writerActual: 'adapter',
      result: 'ok',
    },
  ];
}

test('rf debug center timeline advanced', { timeout: 120000 }, async () => {
  const server = await startRuntimeServer();
  const debugUrl = new URL(server.baseUrl);
  debugUrl.searchParams.set('rfDebugCenter', '1');
  const { browser, page, consoleErrors } = await launchRuntimePage(debugUrl.toString());

  try {
    const readState = () => page.evaluate(() => {
      const host = document.getElementById('rf-debug-center-root');
      const shadow = host?.shadowRoot;
      const text = (id) => shadow?.getElementById(id)?.textContent?.replace(/\s+/g, ' ').trim() || '';
      const api = window.RFDebugCenter?.getState?.() || {};
      return {
        status: text('rf-debug-center-timeline-status'),
        meta: text('rf-debug-center-timeline-meta'),
        counts: text('rf-debug-center-timeline-counts'),
        list: text('rf-debug-center-timeline-list'),
        timeline: api.timeline || null,
        clearCalls: window.__rfTimelineClearCalls || 0,
      };
    });

    const setTrace = (entries, snapshot = null) => page.evaluate(({ entries: nextEntries, snapshot: nextSnapshot }) => {
      window.__rfTimelineClearCalls = 0;
      window.RF_UI_TRACE = {
        getEntries: () => nextEntries,
        snapshot: () => nextSnapshot,
        clear: () => { window.__rfTimelineClearCalls += 1; },
      };
    }, { entries, snapshot });

    await page.waitForFunction(() => !!document.getElementById('rf-debug-center-root')?.shadowRoot);
    await page.waitForFunction(() => window.RFDebugCenter?.enabled === true);
    await page.waitForFunction(() => !!window.RFDebugCenter?.ownership);
    await page.evaluate(() => window.RFDebugCenter.clearTimeline());

    await page.locator('#zw-in').click();
    await page.waitForFunction(() => (window.RFDebugCenter?.getState?.()?.timeline?.total || 0) > 0);
    let state = await readState();
    assert.match(state.status, /^Live · RF_UI_TRACE present · \d+ events$/);
    assert.match(state.list, /DesignZoomEngine\._apply/);
    assert.equal(state.timeline.sourceState, 'present');
    assert.ok(state.timeline.total > 0);
    assert.ok(state.timeline.counts.info >= 1);

    await page.evaluate(() => window.RFDebugCenter.pauseTimeline());
    const pausedTotal = await page.evaluate(() => window.RFDebugCenter.getState().timeline.total);
    await page.locator('#zw-out').click();
    await page.waitForTimeout(240);
    state = await readState();
    assert.match(state.status, /^Paused · RF_UI_TRACE present/);
    assert.equal(state.timeline.total, pausedTotal);

    await page.evaluate(() => window.RFDebugCenter.resumeTimeline());
    await page.locator('#zw-out').click();
    await page.waitForFunction((expected) => (window.RFDebugCenter?.getState?.()?.timeline?.total || 0) > expected, pausedTotal);
    state = await readState();
    assert.match(state.status, /^Live · RF_UI_TRACE present/);
    assert.ok(state.timeline.total > pausedTotal);

    await page.evaluate(() => { window.RF_UI_TRACE = undefined; window.RFDebugCenter.clearTimeline(); window.RFDebugCenter.refreshTimeline(); });
    state = await readState();
    assert.match(state.status, /^Live · RF_UI_TRACE absent · 0 events$/);
    assert.equal(state.timeline.sourceState, 'absent');
    assert.equal(state.timeline.total, 0);

    await setTrace([]);
    await page.evaluate(() => { window.RFDebugCenter.clearTimeline(); window.RFDebugCenter.refreshTimeline(); });
    state = await readState();
    assert.match(state.status, /^Live · RF_UI_TRACE empty · 0 events$/);
    assert.equal(state.timeline.sourceState, 'empty');
    assert.equal(state.timeline.total, 0);

    await page.evaluate(() => {
      window.RF_UI_TRACE = {
        getEntries: () => ({ nope: true }),
        snapshot: () => null,
        clear: () => { window.__rfTimelineClearCalls += 1; },
      };
      window.RFDebugCenter.clearTimeline();
      window.RFDebugCenter.refreshTimeline();
    });
    state = await readState();
    assert.match(state.status, /^Live · RF_UI_TRACE invalid\/no compatible · 0 events$/);
    assert.equal(state.timeline.sourceState, 'invalid');
    assert.equal(state.timeline.total, 0);

    await setTrace([]);
    await page.evaluate(() => { window.RFDebugCenter.clearTimeline(); window.RFDebugCenter.refreshTimeline(); });
    await setTrace(makeWeirdTrace(), {
      dsZoom: 1,
      sliderValue: '100',
      pctText: '100%',
      visibleElement: { tag: 'DIV', id: 'debug' },
    });
    await page.evaluate(() => window.RFDebugCenter.refreshTimeline());
    state = await readState();
    assert.equal(state.timeline.total, 3);
    assert.equal(state.timeline.counts.warning, 1);
    assert.equal(state.timeline.counts.info, 1);
    assert.equal(state.timeline.counts.error, 1);
    assert.match(state.list, /ZoomEngine\.test/);
    assert.match(state.list, /PreviewEngineRenderer\.refresh/);

    const exported = await page.evaluate(() => window.RFDebugCenter.copyTimelineJSON());
    const parsed = JSON.parse(exported);
    assert.equal(parsed.entries.length, 3);
    assert.equal(parsed.counts.warning, 1);
    assert.equal(parsed.counts.info, 1);
    assert.equal(parsed.counts.error, 1);
    assert.equal(parsed.entries[0].timestamp, null);
    assert.equal(parsed.entries[1].before, null);
    assert.equal(parsed.entries[1].after, null);
    assert.equal(parsed.entries[2].durationMs, 12.5);
    assert.equal(parsed.entries[2].writerActual, 'adapter');
    assert.equal(state.clearCalls, 0);

    await assertNoConsoleErrors(consoleErrors, 'rf debug center timeline advanced');
  } finally {
    await browser.close();
    await server.stop();
  }
});
