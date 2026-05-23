import test from 'node:test';
import assert from 'node:assert/strict';
import {
  startRuntimeServer,
  launchRuntimePage,
  assertNoConsoleErrors,
} from './runtime_harness.mjs';

function overlaps(a, b) {
  if (!a || !b) return false;
  return !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
}

function withinViewport(rect, width, height) {
  return !!rect && rect.left >= 0 && rect.top >= 0 && rect.right <= width && rect.bottom <= height;
}

test('rf debug center overlay layout stays inside viewport and separates debug HUDs', { timeout: 120000 }, async () => {
  const server = await startRuntimeServer();
  const debugUrl = new URL(server.baseUrl);
  debugUrl.searchParams.set('rfDebugCenter', '1');
  const { browser, page, consoleErrors } = await launchRuntimePage(debugUrl.toString());

  try {
    await page.setViewportSize({ width: 900, height: 420 });
    await page.waitForFunction(() => window.RFDebugCenter?.enabled === true);
    await page.waitForFunction(() => !!document.getElementById('rf-debug-center-root')?.shadowRoot);
    await page.waitForTimeout(300);

    const before = await page.evaluate(() => ({
      ds: window.DS ? {
        zoom: window.DS.zoom,
        zoomDesign: window.DS.zoomDesign,
        zoomPreview: window.DS.zoomPreview,
        previewMode: window.DS.previewMode,
      } : null,
      traceLength: window.RF_UI_TRACE?.getEntries?.()?.length ?? 0,
    }));

    const snapshot = await page.evaluate(() => {
      const host = document.getElementById('rf-debug-center-root');
      const shadow = host?.shadowRoot;
      const build = document.getElementById('rf-build-debug');
      const zoom = document.getElementById('rf-zoom-live-debug');
      const runtime = document.getElementById('rf-debug-overlay-host');
      const hostRect = host?.getBoundingClientRect?.();
      const buildRect = build?.getBoundingClientRect?.();
      const zoomRect = zoom?.getBoundingClientRect?.();
      const runtimeRect = runtime?.getBoundingClientRect?.();
      const grid = shadow?.querySelector('.rf-debug-center__grid');
      const gridStyle = grid ? getComputedStyle(grid) : null;
      const hostStyle = host ? getComputedStyle(host) : null;
      const buildStyle = build ? getComputedStyle(build) : null;
      const zoomStyle = zoom ? getComputedStyle(zoom) : null;
      return {
        viewport: { width: window.innerWidth, height: window.innerHeight },
        hostVisible: host ? (() => {
          const cs = getComputedStyle(host);
          return cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0';
        })() : false,
        hostRect: hostRect ? { left: hostRect.left, top: hostRect.top, right: hostRect.right, bottom: hostRect.bottom, width: hostRect.width, height: hostRect.height } : null,
        hostStyle: hostStyle ? { maxBlockSize: hostStyle.maxBlockSize, overflow: hostStyle.overflow } : null,
        gridStyle: gridStyle ? { overflowY: gridStyle.overflowY, maxBlockSize: gridStyle.maxBlockSize } : null,
        gridMetrics: grid ? { scrollHeight: grid.scrollHeight, clientHeight: grid.clientHeight } : null,
        buildRect: buildRect ? { left: buildRect.left, top: buildRect.top, right: buildRect.right, bottom: buildRect.bottom, width: buildRect.width, height: buildRect.height } : null,
        buildStyle: buildStyle ? { pointerEvents: buildStyle.pointerEvents } : null,
        zoomRect: zoomRect ? { left: zoomRect.left, top: zoomRect.top, right: zoomRect.right, bottom: zoomRect.bottom, width: zoomRect.width, height: zoomRect.height } : null,
        zoomStyle: zoomStyle ? { pointerEvents: zoomStyle.pointerEvents } : null,
        runtimeVisible: runtime ? (() => {
          const cs = getComputedStyle(runtime);
          return cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0';
        })() : false,
        runtimeRect: runtimeRect ? { left: runtimeRect.left, top: runtimeRect.top, right: runtimeRect.right, bottom: runtimeRect.bottom, width: runtimeRect.width, height: runtimeRect.height } : null,
        runtimeCollapsed: runtime?.dataset?.collapsed || null,
        debugIndicator: document.getElementById('rf-debug-indicator')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      };
    });

    assert.equal(snapshot.hostVisible, true, 'RF Debug Center must be visible when enabled');
    assert.ok(withinViewport(snapshot.hostRect, snapshot.viewport.width, snapshot.viewport.height), 'RF Debug Center must stay within viewport');
    assert.match(snapshot.hostStyle.maxBlockSize || '', /\d+px/);
    assert.match(snapshot.gridStyle.overflowY || '', /auto|scroll/);
    assert.ok((snapshot.gridMetrics?.scrollHeight || 0) > (snapshot.gridMetrics?.clientHeight || 0), 'Debug Center grid must be scrollable');
    assert.equal(overlaps(snapshot.buildRect, snapshot.zoomRect), false, 'BUILD and zoom HUDs must not overlap');
    assert.equal(snapshot.buildStyle.pointerEvents, 'auto');
    assert.equal(snapshot.zoomStyle.pointerEvents, 'auto');
    assert.equal(snapshot.runtimeVisible, false, 'runtime layers must stay hidden without RF_DEBUG_TRACE');
    assert.equal(snapshot.runtimeCollapsed, null, 'runtime layers must not be mounted or visible without debug trace');
    assert.match(snapshot.debugIndicator, /debug on/i);

    const resetResult = await page.evaluate(() => {
      const host = document.getElementById('rf-debug-center-root');
      const before = host?.getBoundingClientRect?.();
      localStorage.setItem('RF_DEBUG_CENTER_POS', JSON.stringify({ left: -999, top: -999 }));
      const reset = window.RFDebugCenter?.resetPosition?.();
      const after = host?.getBoundingClientRect?.();
      return {
        before: before ? { left: before.left, top: before.top } : null,
        after: after ? { left: after.left, top: after.top, right: after.right, bottom: after.bottom } : null,
        stored: localStorage.getItem('RF_DEBUG_CENTER_POS'),
        ds: window.DS ? {
          zoom: window.DS.zoom,
          zoomDesign: window.DS.zoomDesign,
          zoomPreview: window.DS.zoomPreview,
          previewMode: window.DS.previewMode,
        } : null,
        traceLength: window.RF_UI_TRACE?.getEntries?.()?.length ?? 0,
        reset,
      };
    });

    assert.equal(resetResult.stored, null, 'reset must clear stored Debug Center position');
    assert.ok(resetResult.after.left >= 0 && resetResult.after.top >= 0, 'reset must return Debug Center to a visible position');
    assert.ok(resetResult.reset, 'reset must return a position payload');
    assert.deepEqual(resetResult.ds, before.ds, 'reset must not mutate DS');
    assert.equal(resetResult.traceLength, before.traceLength, 'reset must not mutate RF_UI_TRACE');

    await page.evaluate(() => {
      window.RF_DEBUG_TRACE = true;
      window.DebugOverlay?.syncVisibility?.();
    });
    await page.waitForFunction(() => document.getElementById('rf-debug-overlay-host')?.classList.contains('is-on'));
    await page.waitForTimeout(250);

    const runtimeVisible = await page.evaluate(() => {
      const host = document.getElementById('rf-debug-overlay-host');
      const shadow = host?.shadowRoot;
      const collapse = shadow?.getElementById('rf-debug-overlay-collapse');
      collapse?.click();
      const rect = host?.getBoundingClientRect?.();
      const cs = host ? getComputedStyle(host) : null;
      return {
        visible: host ? (cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0') : false,
        collapsed: host?.dataset?.collapsed || null,
        rect: rect ? { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height } : null,
        pointerEvents: cs?.pointerEvents || null,
      };
    });

    assert.equal(runtimeVisible.visible, true, 'runtime layers must become visible when debug trace is enabled');
    assert.equal(runtimeVisible.collapsed, 'true', 'runtime layers panel must collapse');
    assert.equal(runtimeVisible.pointerEvents, 'auto');
    assert.ok(withinViewport(runtimeVisible.rect, 900, 420), 'runtime layers must remain clamped to the viewport');

    await assertNoConsoleErrors(consoleErrors, 'rf debug center overlay layout');
  } finally {
    await browser.close();
    await server.stop();
  }
});

test('rf debug center is absent without the activation flag', { timeout: 120000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl);

  try {
    await page.waitForTimeout(300);
    const snapshot = await page.evaluate(() => {
      const center = document.getElementById('rf-debug-center-root');
      const runtime = document.getElementById('rf-debug-overlay-host');
      return {
        debugCenterGlobal: typeof window.RFDebugCenter === 'object',
        debugCenterEnabled: window.RFDebugCenter?.enabled ?? null,
        debugCenterHost: !!center,
        runtimeVisible: runtime ? (() => {
          const cs = getComputedStyle(runtime);
          return cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0';
        })() : false,
      };
    });
    assert.equal(snapshot.debugCenterGlobal, true);
    assert.equal(snapshot.debugCenterEnabled, false);
    assert.equal(snapshot.debugCenterHost, false);
    assert.equal(snapshot.runtimeVisible, false);
    await assertNoConsoleErrors(consoleErrors, 'rf debug center overlay layout disabled');
  } finally {
    await browser.close();
    await server.stop();
  }
});
