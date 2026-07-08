'use strict';

const { test, expect } = require('@playwright/test');
const { enterPreview, returnDesign } = require('./support/rf_live_preview_cycle');
const { captureCanvasGeometry } = require('./support/rf_live_geometry_snapshot');
const { WHITE_STRIP_ZOOM } = require('./support/rf_live_zoom_cases');

const URL = process.env.RF_URL || 'http://127.0.0.1:5001/classic';

test.describe('RF live geometry contract: canvas anti double-scale', () => {
  test.setTimeout(90000);

  test('keeps canvas-layer base width after Design → Preview → Design', async ({ page }) => {
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);

    await page.evaluate((zoom) => {
      DesignZoomEngine.setFree(zoom, undefined, undefined, {
        event: 'live-regression',
        fn: 'geometry_white_strip_preview_design.setZoom',
      });
    }, WHITE_STRIP_ZOOM);
    await page.waitForTimeout(500);

    const before = await captureCanvasGeometry(page, 'before-preview');
    expect(before.mode).toBe('design');
    expect(before.inlineWidth).toBe(`${before.pageW}px`);
    expect(before.computedWidth).toBe(`${before.pageW}px`);
    expect(Math.abs(before.rectWidth - before.expectedRectWidth)).toBeLessThanOrEqual(2);

    for (let cycle = 1; cycle <= 3; cycle += 1) {
      await enterPreview(page);
      await page.waitForTimeout(800);

      await returnDesign(page);
      await page.waitForTimeout(800);

      const after = await captureCanvasGeometry(page, `after-design-cycle-${cycle}`);
      expect(after.mode).toBe('design');
      expect(after.inlineWidth).toBe(`${after.pageW}px`);
      expect(after.computedWidth).toBe(`${after.pageW}px`);
      // #viewport is the real owner of the zoom transform (DesignZoomEngine
      // applies scale(z) there, not on #canvas-layer — see
      // RF-ZOOM-VIEWPORT-OWNER-1 in rf_live_geometry_snapshot.js).
      expect(after.viewportTransform).toContain(`scale(${WHITE_STRIP_ZOOM})`);
      // Anti double-scale: #canvas-layer must stay untransformed — if the
      // zoom leaked onto it too, the page would render at zoom² size.
      expect(after.transform).toBe('none');
      expect(Math.abs(after.rectWidth - after.expectedRectWidth)).toBeLessThanOrEqual(2);

      if (after.expectedRectWidth <= after.workspaceClientWidth) {
        expect(after.workspaceSlack).toBeLessThanOrEqual(2);
      }
    }
  });
});
