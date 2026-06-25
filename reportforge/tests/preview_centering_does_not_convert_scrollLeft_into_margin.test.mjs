/**
 * RF-VIEWPORT-JUMP-POST-MOUSEUP-1
 *
 * Live console diagnostic (RF-DIAG instrumentation, reproduced by the
 * user in real Firefox) caught the exact moment: right after a mouseup
 * while in Preview at zoom 400%, #workspace.scrollWidth jumped from
 * 10914 to 41434 (~4x) with NO scrollTo()/scrollBy()/scrollLeft= write
 * logged anywhere — a passive reflow side effect, not a programmatic
 * scroll. Root cause: PreviewEngineRendererLayout.js's
 * _centerPreviewPageInWorkspace() computes
 *   stageLeftInWorkspace = stageRect.left - workspaceRect.left
 * — a SCREEN-SPACE measurement that shifts by exactly -scrollLeft as
 * the user scrolls right (the page moves left with the scroll, by
 * definition). That scroll-dependent quantity then gets subtracted
 * into content.style.marginLeft, a PERSISTENT CSS box-model property —
 * the more scrolled right the user is, the bigger the resulting
 * margin, which widens #preview-content (and therefore #workspace's
 * scrollWidth) proportionally. A feedback loop, not a one-off bug:
 * any refresh() while scrolled right re-derives an even bigger margin.
 *
 * Contract this test enforces: the computed marginLeft must be IDENTICAL
 * whether scrollLeft is 0 or deep into the page, and centering must
 * never multiply scrollWidth. No DOM-only assertion — this measures the
 * actual live #preview-content.style.marginLeft and #workspace.scrollWidth.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startRuntimeServer, launchRuntimePage } from './runtime_harness.mjs';

async function openAndEnterPreview(page, zoom) {
  await page.waitForFunction(() => typeof DS !== 'undefined' && DS.elements.length > 0);
  await page.waitForTimeout(600);
  await page.evaluate(() => { delete window.showOpenFilePicker; });
  const fc = page.waitForEvent('filechooser');
  await page.locator('button.tb-icon[data-action="open"]').click();
  await (await fc).setFiles('/home/mimi/Escritorio/sap_b1_linux/reportforge_layouts/factura_fv1.json');
  await page.waitForTimeout(500);
  await page.click('#tab-preview');
  await page.waitForTimeout(600);
  await page.evaluate((z) => { if (typeof PreviewZoomEngine !== 'undefined') PreviewZoomEngine.set(z); }, zoom);
  await page.waitForTimeout(600);
}

async function measure(page) {
  return page.evaluate(() => {
    const ws = document.getElementById('workspace');
    const content = document.getElementById('preview-content');
    return {
      marginLeft: content.style.marginLeft,
      scrollLeft: ws.scrollLeft,
      scrollWidth: ws.scrollWidth,
      clientWidth: ws.clientWidth,
    };
  });
}

for (const zoom of [1, 2, 4]) {
  test(`LIVE: centering marginLeft is identical at scrollLeft=0 vs scrollLeft deep, and scrollWidth does not balloon (zoom ${zoom * 100}%)`, { timeout: 60000 }, async () => {
    const server = await startRuntimeServer();
    const { browser, page } = await launchRuntimePage(server.baseUrl);
    try {
      await openAndEnterPreview(page, zoom);

      // Baseline at scrollLeft = 0.
      await page.evaluate(() => { document.getElementById('workspace').scrollLeft = 0; });
      await page.waitForTimeout(150);
      const before = await measure(page);

      // Force a real refresh (the same mouseup-triggered path) while scrolled deep right.
      await page.evaluate(() => {
        const ws = document.getElementById('workspace');
        ws.scrollLeft = Math.max(0, ws.scrollWidth - ws.clientWidth - 5);
      });
      await page.waitForTimeout(150);
      const scrolledBeforeRefresh = await measure(page);

      await page.evaluate(() => { DS.saveHistory(); }); // patched: triggers PreviewEngineRenderer.refresh() in preview mode
      await page.waitForTimeout(700);
      const after = await measure(page);

      assert.equal(
        after.marginLeft,
        before.marginLeft,
        `centering marginLeft must NOT depend on scrollLeft at the moment of refresh — before(scrollLeft=0)=${before.marginLeft} after(scrolled, post-refresh)=${after.marginLeft}`,
      );
      assert.ok(
        after.scrollWidth <= before.scrollWidth * 1.05,
        `scrollWidth must not balloon from re-centering while scrolled — before=${before.scrollWidth} after=${after.scrollWidth} (scrolled-pre-refresh was ${scrolledBeforeRefresh.scrollWidth})`,
      );
    } finally {
      await browser.close();
      await server.stop();
    }
  });
}

test('LIVE: full real-world repro — drag/resize + mouseup deep-scrolled in Preview at 400% must not corrupt scrollWidth', { timeout: 60000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page } = await launchRuntimePage(server.baseUrl);
  try {
    await openAndEnterPreview(page, 4);
    await page.evaluate(() => {
      const ws = document.getElementById('workspace');
      ws.scrollLeft = Math.max(0, ws.scrollWidth - ws.clientWidth - 5);
    });
    await page.waitForTimeout(150);
    const before = await measure(page);

    // Same trigger the user's real repro hits: a committed element edit's
    // saveHistory() call while DS.previewMode is true and deeply scrolled.
    await page.evaluate(() => { DS.saveHistory(); });
    await page.waitForTimeout(700);
    const after = await measure(page);

    assert.ok(
      after.scrollWidth <= before.scrollWidth * 1.05,
      `post-mouseup scrollWidth must stay stable, got before=${before.scrollWidth} after=${after.scrollWidth}`,
    );
  } finally {
    await browser.close();
    await server.stop();
  }
});
