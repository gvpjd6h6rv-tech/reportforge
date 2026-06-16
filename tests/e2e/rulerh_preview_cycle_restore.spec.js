'use strict';

const { test, expect } = require('@playwright/test');
const { enterPreview, returnDesign } = require('./support/rf_live_preview_cycle');
const { captureCanvasGeometry, captureRulerHGeometry } = require('./support/rf_live_geometry_snapshot');
const { RULER_H_ZOOM_CASES } = require('./support/rf_live_zoom_cases');

const URL = process.env.RF_URL || 'http://127.0.0.1:8080/classic';

test.describe('RF live geometry contract: rulerH preview chrome restore', () => {
  test.setTimeout(120000);

  for (const zoom of RULER_H_ZOOM_CASES) {
    test(`restores horizontal ruler design chrome after Preview → Design at ${Math.round(zoom * 100)}%`, async ({ page }) => {
      await page.goto(URL, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1200);

      await page.evaluate((zoom) => {
        DesignZoomEngine.setFree(zoom, undefined, undefined, {
          event: 'live-regression',
          fn: 'rulerh_preview_cycle_restore.setZoom',
        });
      }, zoom);
      await page.waitForTimeout(500);

      const canvasBefore = await captureCanvasGeometry(page, `canvas-before-${zoom}`);
      expect(canvasBefore.mode).toBe('design');
      expect(canvasBefore.inlineWidth).toBe(`${canvasBefore.pageW}px`);
      expect(Math.abs(canvasBefore.rectWidth - canvasBefore.expectedRectWidth)).toBeLessThanOrEqual(2);

      const rulerBefore = await captureRulerHGeometry(page, `ruler-before-${zoom}`);
      expect(rulerBefore.mode).toBe('design');
      expect(rulerBefore.rulerBox.inlineWidth).toBe('');
      expect(rulerBefore.rulerBox.inlineFlex).toBe('');

      await enterPreview(page);
      await page.waitForTimeout(800);

      const rulerPreview = await captureRulerHGeometry(page, `ruler-preview-${zoom}`);
      expect(rulerPreview.mode).toBe('preview');
      expect(rulerPreview.rulerBox.inlineWidth).toBe(`${rulerPreview.pageW}px`);
      expect(rulerPreview.rulerBox.inlineFlex).toBe(`0 0 ${rulerPreview.pageW}px`);

      await returnDesign(page);
      await page.waitForTimeout(800);

      const canvasAfter = await captureCanvasGeometry(page, `canvas-after-${zoom}`);
      expect(canvasAfter.mode).toBe('design');
      expect(canvasAfter.inlineWidth).toBe(`${canvasAfter.pageW}px`);
      expect(Math.abs(canvasAfter.rectWidth - canvasAfter.expectedRectWidth)).toBeLessThanOrEqual(2);

      const rulerAfter = await captureRulerHGeometry(page, `ruler-after-${zoom}`);
      expect(rulerAfter.mode).toBe('design');
      expect(rulerAfter.rulerBox.inlineWidth).toBe('');
      expect(rulerAfter.rulerBox.inlineFlex).toBe('');
      expect(rulerAfter.rulerBox.computedFlex).toBe('1 1 0%');
      expect(rulerAfter.rulerBox.attrStyle).not.toContain(`flex: 0 0 ${rulerAfter.pageW}px`);
      expect(rulerAfter.rulerBox.attrStyle).not.toContain(`width: ${rulerAfter.pageW}px`);
    });
  }
});
