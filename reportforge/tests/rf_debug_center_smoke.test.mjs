import test from 'node:test';
import assert from 'node:assert/strict';
import {
  startRuntimeServer,
  launchRuntimePage,
  assertNoConsoleErrors,
} from './runtime_harness.mjs';

test('rf debug center sidecar activates by flag and mirrors RF_UI_TRACE', { timeout: 120000 }, async () => {
  const server = await startRuntimeServer();

  try {
    const disabled = await launchRuntimePage(server.baseUrl);
    try {
      const disabledState = await disabled.page.evaluate(() => ({
        hasGlobal: typeof window.RFDebugCenter === 'object',
        enabled: window.RFDebugCenter?.enabled ?? null,
        hostExists: !!document.getElementById('rf-debug-center-root'),
      }));
      assert.equal(disabledState.hasGlobal, true, 'RFDebugCenter global must exist');
      assert.equal(disabledState.enabled, false, 'RFDebugCenter must stay disabled without a flag');
      assert.equal(disabledState.hostExists, false, 'RF Debug Center host must not mount without a flag');
      await assertNoConsoleErrors(disabled.consoleErrors, 'rf debug center disabled smoke');
    } finally {
      await disabled.browser.close();
    }

    const debugUrl = new URL(server.baseUrl);
    debugUrl.searchParams.set('rfDebugCenter', '1');
    const { browser, page, consoleErrors } = await launchRuntimePage(debugUrl.toString());

    try {
      await page.waitForFunction(() => {
        const host = document.getElementById('rf-debug-center-root');
        return !!host && !!host.shadowRoot && host.classList.contains('is-on');
      });
      await page.waitForFunction(() => window.RFDebugCenter?.enabled === true);
      await page.waitForFunction(() => !!window.RFDebugCenter?.ownership);
      await page.evaluate(() => window.RF_UI_TRACE?.clear?.());

      const sliderBox = await page.locator('#zw-slider').boundingBox();
      assert.ok(sliderBox, 'zoom slider must have a bounding box');
      await page.mouse.move(sliderBox.x + 4, sliderBox.y + sliderBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(sliderBox.x + sliderBox.width * 0.85, sliderBox.y + sliderBox.height / 2, { steps: 12 });
      await page.mouse.up();
      await page.waitForFunction(() => (window.RF_UI_TRACE?.getEntries?.() ?? []).length > 0);

      const snapshot = await page.evaluate(() => {
        const host = document.getElementById('rf-debug-center-root');
        const shadow = host?.shadowRoot;
        const text = (id) => shadow?.getElementById(id)?.textContent?.replace(/\s+/g, ' ').trim() || '';
        return {
          api: window.RFDebugCenter?.getState?.(),
          badge: text('rf-debug-center-badge'),
          sub: text('rf-debug-center-sub'),
          live: text('rf-debug-center-live'),
          divergence: text('rf-debug-center-divergence'),
          timeline: text('rf-debug-center-timeline-list'),
          timelineStatus: text('rf-debug-center-timeline-status'),
          ownership: text('rf-debug-center-ownership'),
          hostVisible: host ? (() => {
            const cs = getComputedStyle(host);
            return cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0';
          })() : false,
        };
      });

      assert.equal(snapshot.hostVisible, true, 'RF Debug Center host must be visible when enabled');
      assert.equal(snapshot.badge, 'live', 'RF Debug Center badge must show live state');
      assert.match(snapshot.sub, /query:rfDebugCenter|flag:RF_DEBUG_TRACE|localStorage:RF_DEBUG_CENTER/);
      assert.match(snapshot.live, /programmatic/);
      assert.match(snapshot.live, /DesignZoomEngine\._apply/);
      assert.match(snapshot.live, /\d+%/);
      assert.match(snapshot.divergence, /synced/);
      assert.match(snapshot.timelineStatus, /Live · RF_UI_TRACE/);
      assert.match(snapshot.timeline, /DesignZoomEngine\._apply/);
      assert.match(snapshot.timeline, /zoom \d+(\.\d)?/);
      assert.match(snapshot.timeline, /slider \d+ · \d+%/);
      assert.match(snapshot.ownership, /rf-debug-center-store\.js/);
      assert.equal(snapshot.api.enabled, true);
      assert.equal(snapshot.api.last.event, 'programmatic');
      assert.equal(snapshot.api.last.source, 'DesignZoomEngine._apply');
      assert.ok(Number(snapshot.api.live.sliderValue) > 0);
      assert.equal(snapshot.api.divergence.ok, true);

      await page.locator('#rf-debug-center-root').screenshot({ path: '/tmp/rf-debug-center.png', animations: 'disabled' });
      await assertNoConsoleErrors(consoleErrors, 'rf debug center enabled smoke');
    } finally {
      await browser.close();
    }
  } finally {
    await server.stop();
  }
});
