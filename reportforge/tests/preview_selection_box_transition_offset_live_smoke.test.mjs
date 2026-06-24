/**
 * RF-PREVIEW-SELECTION-OFFSET-1
 *
 * Reported manual smoke: select an element in Design (blue box correct),
 * switch Design -> Preview — the blue box appears displaced above/left of
 * the now-relocated element. Switching Preview -> Design back snaps it
 * correct again.
 *
 * Root cause, proven live (no hypothesis — see rect dumps below):
 * PreviewEngineMode.show() calls freezeSelectionOverlay() synchronously,
 * then fires PreviewEngineRenderer.refresh() — an ASYNC function (fetches
 * /designer-preview) that only dispatches 'rf-preview-rendered' once the
 * new preview DOM exists, well after show() has already returned.
 * SelectionEnginePreviewBridge's listener for that event gates the
 * renderHandles() call on isSelectionOverlayVisible(), which itself
 * requires the overlay to NOT be frozen — but nothing ever unfreezes it,
 * so that listener's call is always skipped on initial preview entry. The
 * stale Design-space .sel-box (still in #handles-layer, which CSS forces
 * visible in preview-mode) is left displayed untouched, showing OLD
 * Design coordinates instead of the relocated preview-space rect.
 *
 * Preview -> Design "working" is not a real correction: the box was never
 * touched while in Preview, so it was never wrong for Design in the first
 * place — going back just exposes the coordinates it always had.
 *
 * Fix: PreviewEngineMode.show() now chains off refresh()'s returned
 * promise to unfreeze + explicitly re-render handles once the new
 * preview-space DOM is actually ready.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  startRuntimeServer,
  launchRuntimePage,
  selectSingle,
  setZoom,
  assertRectClose,
} from './runtime_harness.mjs';

test('LIVE: Design -> Preview transition keeps the selection box aligned to the relocated element (no stale Design-space drift)', { timeout: 60000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page } = await launchRuntimePage(server.baseUrl);
  try {
    await page.waitForFunction(() => typeof DS !== 'undefined' && Array.isArray(DS.elements) && DS.elements.length > 0);
    await page.waitForTimeout(500);
    await setZoom(page, 1);
    await selectSingle(page, 0);
    await page.waitForTimeout(150);

    const design = await page.evaluate(() => {
      const id = [...DS.selection][0];
      const el = document.querySelector(`.cr-element[data-id="${id}"]`);
      const box = document.querySelector('#handles-layer .sel-box');
      return { id, elRect: el.getBoundingClientRect(), boxRect: box ? box.getBoundingClientRect() : null };
    });
    assert.ok(design.boxRect, 'sanity: Design must show a sel-box for the selected element');
    assertRectClose(design.boxRect, design.elRect, 0.5, 'design sel-box vs element');

    await page.click('#tab-preview');
    // Real render wait: PreviewEngineRenderer.refresh() is async (fetches
    // /designer-preview) — give it real time to land, not a fixed guess.
    await page.waitForFunction(() => {
      const root = document.querySelector('#preview-content .preview-hit-layer .pv-el');
      return !!root && !PreviewEngineMode.isSelectionOverlayFrozen();
    }, { timeout: 15000 });
    await page.waitForTimeout(150);

    const preview = await page.evaluate((id) => {
      const hitEl = document.querySelector(`#preview-content .preview-hit-layer .pv-el[data-id="${id}"]`);
      const previewBox = document.querySelector('.preview-selection-layer .sel-box');
      const staleHandlesBox = document.querySelector('#handles-layer .sel-box');
      return {
        hitElRect: hitEl ? hitEl.getBoundingClientRect() : null,
        previewBoxRect: previewBox ? previewBox.getBoundingClientRect() : null,
        staleHandlesBoxRect: staleHandlesBox ? staleHandlesBox.getBoundingClientRect() : null,
        frozen: PreviewEngineMode.isSelectionOverlayFrozen(),
        visible: PreviewEngineMode.isSelectionOverlayVisible(),
      };
    }, design.id);

    assert.ok(preview.hitElRect, 'sanity: the element must exist in the preview hit-layer');
    assert.equal(preview.staleHandlesBoxRect, null, 'the stale Design-space #handles-layer sel-box must be cleared once Preview owns the overlay');
    assert.ok(preview.previewBoxRect, 'Preview must render its own sel-box in .preview-selection-layer');
    assert.equal(preview.frozen, false, 'the selection overlay must be unfrozen once the new preview DOM is ready');

    // The actual reported bug: drift <= 1px between the box and the real
    // relocated element, NOT between the box and its own stale Design rect.
    assertRectClose(preview.previewBoxRect, preview.hitElRect, 1, 'preview sel-box vs relocated element');

    await page.click('#tab-design');
    await page.waitForTimeout(200);
    const backToDesign = await page.evaluate((id) => {
      const el = document.querySelector(`.cr-element[data-id="${id}"]`);
      const box = document.querySelector('#handles-layer .sel-box');
      return { elRect: el.getBoundingClientRect(), boxRect: box ? box.getBoundingClientRect() : null };
    }, design.id);
    assert.ok(backToDesign.boxRect, 'Preview -> Design must still show a sel-box');
    assertRectClose(backToDesign.boxRect, backToDesign.elRect, 0.5, 'design sel-box vs element after round trip');
  } finally {
    await browser.close();
    await server.stop();
  }
});
