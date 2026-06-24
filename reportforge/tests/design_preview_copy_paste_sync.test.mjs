/**
 * RF-PARITY-AUDIT-1: copy/paste must produce the same model-level result
 * (new element count, geometry of the clone) whether triggered in Design or
 * Preview, and both modes must agree on the resulting element count and
 * positions afterward (shared DS.elements).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  startRuntimeServer,
  launchRuntimePage,
  selectSingle,
  selectPreviewSingle,
  setZoom,
  enterPreview,
  exitPreview,
  assertNoConsoleErrors,
} from './runtime_harness.mjs';

test('LIVE: Ctrl+C / Ctrl+V in Design creates a new shared element, visible identically in Preview', { timeout: 60000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl);
  try {
    await page.waitForFunction(() => typeof DS !== 'undefined' && Array.isArray(DS.elements) && DS.elements.length > 0);
    await page.waitForTimeout(800);
    await setZoom(page, 1);
    await selectSingle(page, 0);

    const before = await page.evaluate(() => DS.elements.length);
    await page.keyboard.press('Control+c');
    await page.waitForTimeout(120);
    await page.keyboard.press('Control+v');
    await page.waitForTimeout(180);

    const after = await page.evaluate(() => DS.elements.length);
    assert.equal(after, before + 1, 'paste in Design must add exactly one new element to the shared model');

    const newId = await page.evaluate(() => [...DS.selection][0]);
    assert.ok(newId, 'pasted element must become selected');
    const designRect = await page.evaluate((id) => {
      const el = document.querySelector(`.cr-element[data-id="${id}"]`);
      const r = el.getBoundingClientRect();
      return { width: r.width, height: r.height };
    }, newId);
    assert.ok(designRect.width > 0 && designRect.height > 0, 'pasted element must render with non-zero size in Design');

    await enterPreview(page);
    await page.waitForTimeout(300);
    const afterPreviewCount = await page.evaluate(() => DS.elements.length);
    assert.equal(afterPreviewCount, after, 'Preview must see the same element count Design produced after paste');

    await assertNoConsoleErrors(consoleErrors, 'design copy/paste -> preview sync');
  } finally {
    await browser.close();
    await server.stop();
  }
});

test('LIVE: Ctrl+C / Ctrl+V in Preview creates a new shared element, visible identically in Design', { timeout: 60000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl);
  try {
    await page.waitForFunction(() => typeof DS !== 'undefined' && Array.isArray(DS.elements) && DS.elements.length > 0);
    await page.waitForTimeout(800);
    await setZoom(page, 1);

    await enterPreview(page);
    await page.waitForTimeout(300);
    await selectPreviewSingle(page, 0);

    const before = await page.evaluate(() => DS.elements.length);
    await page.keyboard.press('Control+c');
    await page.waitForTimeout(120);
    await page.keyboard.press('Control+v');
    await page.waitForTimeout(180);

    const after = await page.evaluate(() => DS.elements.length);
    assert.equal(after, before + 1, 'paste in Preview must add exactly one new element to the shared model');

    await exitPreview(page);
    const afterDesignCount = await page.evaluate(() => DS.elements.length);
    assert.equal(afterDesignCount, after, 'Design must see the same element count Preview produced after paste');

    const newId = await page.evaluate(() => [...DS.selection][0]);
    assert.ok(newId, 'pasted element must remain selected after switching to Design');
    const designRect = await page.evaluate((id) => {
      const el = document.querySelector(`.cr-element[data-id="${id}"]`);
      const r = el.getBoundingClientRect();
      return { width: r.width, height: r.height };
    }, newId);
    assert.ok(designRect.width > 0 && designRect.height > 0, 'element pasted in Preview must render with non-zero size once back in Design');

    await assertNoConsoleErrors(consoleErrors, 'preview copy/paste -> design sync');
  } finally {
    await browser.close();
    await server.stop();
  }
});
