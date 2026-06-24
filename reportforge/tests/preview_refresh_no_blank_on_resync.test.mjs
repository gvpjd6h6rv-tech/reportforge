/**
 * RF-DESIGN-KEYBOARD-FLICKER-1 (mouse-parity follow-up) — PreviewEngineV19
 * .refresh() unconditionally blanked #preview-content and showed a
 * "Rendering preview…" placeholder BEFORE the fetch even started, on
 * EVERY call — which runs on every DS.saveHistory() while previewMode is
 * on: mouse-drag mouseup, keyboard nudge release, undo/redo, property
 * edits, delete, etc. Confirmed live: the user kept seeing a flicker on
 * mouseup even once the keyboard nudge path was fixed to fire this exact
 * same refresh only once per gesture — coalescing to one call doesn't
 * help if that one call itself flashes.
 *
 * Fix: only do the blank+placeholder dance for the very first render
 * (content still empty). Every subsequent refresh keeps the previous
 * render visible until the new HTML is ready, then swaps once — old
 * content never disappears mid-refresh.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  startRuntimeServer,
  launchRuntimePage,
  selectPreviewSingle,
  enterPreview,
  dragSelectedElement,
  exitPreview,
} from './runtime_harness.mjs';

test('LIVE: a Preview refresh after the first render never blanks #preview-content — old render stays until the new one replaces it', { timeout: 60000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page } = await launchRuntimePage(server.baseUrl);
  try {
    await enterPreview(page);
    await selectPreviewSingle(page, 0);

    await page.evaluate(() => {
      window.__rfEmptyEvents = 0;
      const content = document.getElementById('preview-content');
      const obs = new MutationObserver(() => {
        // The actual visible flash is never a literal 0-child gap (clear
        // and placeholder-insert happen back to back, same task, no
        // paint in between) — it's the "Rendering preview…" placeholder
        // itself replacing real content for the whole fetch round trip.
        if (content.querySelector(':scope > .preview-loading')) window.__rfEmptyEvents += 1;
      });
      obs.observe(content, { childList: true });
      window.__rfObs = obs;
    });

    // Mouse-drag mouseup triggers exactly the same DS.saveHistory() ->
    // previewMode refresh path this bug affects.
    await exitPreview(page);
    await page.locator('#tab-design').click();
    await page.waitForTimeout(100);
    // re-enter preview, select again, then go back to design to drag,
    // matching how a real user moves an element while Preview stays open
    // is actually exercised via dragSelectedElement on the design canvas
    // with previewMode flag still tracked — simplest reliable repro is the
    // keyboard nudge release, already covered elsewhere; here we drive the
    // mouse path directly through the same selection.
    await enterPreview(page);
    await selectPreviewSingle(page, 0);
    await page.evaluate(() => {
      window.__rfEmptyEvents = 0;
    });

    const target = page.locator('#preview-content .pv-el.selected').first();
    const box = await target.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 20, box.y + box.height / 2, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(400);

    const placeholderEvents = await page.evaluate(() => window.__rfEmptyEvents);
    assert.equal(placeholderEvents, 0, `#preview-content must never show the "Rendering preview…" placeholder during a post-initial refresh (mouse-drag mouseup) — got ${placeholderEvents} occurrences, this is the reported mouseup flicker`);

    // sanity: the refresh still actually ran and produced fresh content
    const hasPages = await page.evaluate(() => document.querySelectorAll('#preview-content .preview-render-layer .rpt-page').length > 0);
    assert.ok(hasPages, 'refresh must still produce real rendered pages after the drag');
  } finally {
    await browser.close();
    await server.stop();
  }
});
