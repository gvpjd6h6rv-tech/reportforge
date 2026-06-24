/**
 * RF-PARITY-AUDIT-1: multiselect state (which ids are selected, overlay box
 * count) must agree between Design and Preview for the shared DS.selection,
 * and a multiselect drag must move every selected element by the same
 * delta in both modes without any of them ending up critically occluded
 * (see the multiselect occlusion fix — engines/CanvasLayoutElements.js —
 * proven root cause: an inline z-index:0 always overrode the CSS
 * `.cr-element.selected` elevation).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  startRuntimeServer,
  launchRuntimePage,
  selectMulti,
  selectPreviewMulti,
  setZoom,
  enterPreview,
  exitPreview,
  dragSelectedElement,
  assertNoConsoleErrors,
} from './runtime_harness.mjs';

test('LIVE: multiselect in Design (2 elements) is reflected identically in Preview', { timeout: 60000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl);
  try {
    await page.waitForFunction(() => typeof DS !== 'undefined' && Array.isArray(DS.elements) && DS.elements.length > 0);
    await page.waitForTimeout(800);
    await setZoom(page, 1);
    await selectMulti(page, 0, 1);

    const designSel = await page.evaluate(() => [...DS.selection].sort());
    assert.equal(designSel.length, 2, 'design multiselect must select exactly 2 ids');
    const designOverlay = await page.evaluate(() => document.querySelectorAll('#handles-layer .sel-box').length);
    assert.equal(designOverlay, 1, 'design must show exactly one multiselect overlay box for 2 selected elements');

    await enterPreview(page);
    await page.waitForTimeout(300);
    const previewSel = await page.evaluate(() => [...DS.selection].sort());
    assert.deepEqual(previewSel, designSel, 'Preview must keep the exact same selection ids Design had');

    await assertNoConsoleErrors(consoleErrors, 'design multiselect -> preview sync');
  } finally {
    await browser.close();
    await server.stop();
  }
});

test('LIVE: multiselect drag in Design moves both elements by the same delta, neither ends up critically occluded', { timeout: 60000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl);
  try {
    await page.waitForFunction(() => typeof DS !== 'undefined' && Array.isArray(DS.elements) && DS.elements.length > 0);
    await page.waitForTimeout(800);
    await setZoom(page, 1);
    await selectMulti(page, 0, 1);
    const ids = await page.evaluate(() => [...DS.selection]);

    const before = await page.evaluate((ids) => ids.map((id) => { const el = DS.getElementById(id); return { id, x: el.x, y: el.y }; }), ids);
    await dragSelectedElement(page, 18, 9);
    const after = await page.evaluate((ids) => ids.map((id) => { const el = DS.getElementById(id); return { id, x: el.x, y: el.y }; }), ids);

    for (let i = 0; i < ids.length; i++) {
      assert.ok(Math.abs(after[i].x - before[i].x - 18) < 1, `id=${ids[i]}: x must move by 18`);
      assert.ok(Math.abs(after[i].y - before[i].y - 9) < 1, `id=${ids[i]}: y must move by 9`);
    }

    // Critical occlusion check (the exact bug this audit found and fixed):
    // every selected, dragged element must win hit-testing at its own
    // center — a later-DOM-order unselected sibling must not paint over it.
    const occlusion = await page.evaluate((ids) => ids.map((id) => {
      const el = document.querySelector(`.cr-element[data-id="${id}"]`);
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { id, hitMatchesSelf: hit && hit.dataset.id === id };
    }), ids);
    occlusion.forEach((o) => assert.ok(o.hitMatchesSelf, `id=${o.id}: must win hit-test at its own center after multiselect drag (no critical occlusion)`));

    await assertNoConsoleErrors(consoleErrors, 'design multiselect drag occlusion check');
  } finally {
    await browser.close();
    await server.stop();
  }
});

test('LIVE: multiselect in Preview (2 elements) is reflected identically in Design', { timeout: 60000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl);
  try {
    await page.waitForFunction(() => typeof DS !== 'undefined' && Array.isArray(DS.elements) && DS.elements.length > 0);
    await page.waitForTimeout(800);
    await setZoom(page, 1);

    await enterPreview(page);
    await page.waitForTimeout(300);
    await selectPreviewMulti(page, 0, 1);

    const previewSel = await page.evaluate(() => [...DS.selection].sort());
    assert.equal(previewSel.length, 2, 'preview multiselect must select exactly 2 ids');

    await exitPreview(page);
    const designSel = await page.evaluate(() => [...DS.selection].sort());
    assert.deepEqual(designSel, previewSel, 'Design must keep the exact same selection ids Preview had');

    await assertNoConsoleErrors(consoleErrors, 'preview multiselect -> design sync');
  } finally {
    await browser.close();
    await server.stop();
  }
});
