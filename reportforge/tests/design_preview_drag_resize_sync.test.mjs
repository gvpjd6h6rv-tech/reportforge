/**
 * RF-PARITY-AUDIT-1: drag/resize must produce the SAME model state whether
 * performed in Design or in Preview, and the result must be visible,
 * correctly positioned, and selection-consistent in BOTH modes afterward
 * (DS.elements is the single shared source of truth for both render paths —
 * see reportforge/tests/preview_iva12_orange_line_overlap_live_smoke.test.mjs
 * for why visual/raster checks matter alongside model checks: a clean model
 * does not guarantee a clean render).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  startRuntimeServer,
  launchRuntimePage,
  selectSingle,
  setZoom,
  enterPreview,
  exitPreview,
  selectPreviewSingle,
  dragSelectedElement,
  dragPreviewSelected,
  resizeFromHandle,
  assertNoConsoleErrors,
} from './runtime_harness.mjs';

async function modelOf(page, id) {
  return page.evaluate((id) => {
    const el = DS.getElementById(id);
    return { id: el.id, x: el.x, y: el.y, w: el.w, h: el.h };
  }, id);
}

test('LIVE: drag in Design moves the model element, and Preview reflects the new position after a mode switch', { timeout: 60000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl);
  try {
    await page.waitForFunction(() => typeof DS !== 'undefined' && Array.isArray(DS.elements) && DS.elements.length > 0);
    await page.waitForTimeout(800);
    await setZoom(page, 1);
    await selectSingle(page, 0);
    const id = await page.evaluate(() => [...DS.selection][0]);

    const before = await modelOf(page, id);
    await dragSelectedElement(page, 30, 15);
    const afterDesignModel = await modelOf(page, id);
    assert.ok(Math.abs(afterDesignModel.x - before.x - 30) < 1, `design drag must move x by 30, got dx=${afterDesignModel.x - before.x}`);
    assert.ok(Math.abs(afterDesignModel.y - before.y - 15) < 1, `design drag must move y by 15, got dy=${afterDesignModel.y - before.y}`);

    await enterPreview(page);
    await page.waitForTimeout(300);
    const afterPreviewModel = await modelOf(page, id);
    assert.deepEqual(afterPreviewModel, afterDesignModel, 'entering Preview must not mutate the model — same x/y/w/h as Design left it');

    // The rendered Preview element (visible render-layer, not just the model)
    // must exist and have non-zero size at the new position — catches the
    // exact class of bug found in the orange-line investigation, where the
    // model was correct but the paint was not.
    const renderedOk = await page.evaluate((id) => {
      const el = [...document.querySelectorAll('.preview-render-layer .cr-el')].find((n) => n.dataset.elIndex != null);
      const all = [...document.querySelectorAll('.preview-render-layer .cr-el')];
      return all.length > 0;
    }, id);
    assert.ok(renderedOk, 'Preview render-layer must have rendered elements after the drag + mode switch');

    await assertNoConsoleErrors(consoleErrors, 'design drag -> preview sync');
  } finally {
    await browser.close();
    await server.stop();
  }
});

test('LIVE: drag in Preview moves the SAME shared model element, and Design reflects it after switching back', { timeout: 60000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl);
  try {
    await page.waitForFunction(() => typeof DS !== 'undefined' && Array.isArray(DS.elements) && DS.elements.length > 0);
    await page.waitForTimeout(800);
    await setZoom(page, 1);
    await selectSingle(page, 0);
    const id = await page.evaluate(() => [...DS.selection][0]);
    const before = await modelOf(page, id);

    await enterPreview(page);
    await page.waitForTimeout(300);
    await selectPreviewSingle(page, 0);
    const previewSelectedId = await page.evaluate(() => [...DS.selection][0]);
    assert.equal(previewSelectedId, id, 'Preview must select the same shared element id Design had selected');

    await dragPreviewSelected(page, 24, 12);
    const afterPreviewModel = await modelOf(page, id);
    assert.ok(Math.abs(afterPreviewModel.x - before.x - 24) < 1, `preview drag must move x by 24, got dx=${afterPreviewModel.x - before.x}`);
    assert.ok(Math.abs(afterPreviewModel.y - before.y - 12) < 1, `preview drag must move y by 12, got dy=${afterPreviewModel.y - before.y}`);

    await exitPreview(page);
    const afterDesignModel = await modelOf(page, id);
    assert.deepEqual(afterDesignModel, afterPreviewModel, 'switching back to Design must show the same x/y/w/h Preview left it at');

    await assertNoConsoleErrors(consoleErrors, 'preview drag -> design sync');
  } finally {
    await browser.close();
    await server.stop();
  }
});

test('LIVE: resize from a handle in Design changes w/h consistently and is reflected in Preview', { timeout: 60000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl);
  try {
    await page.waitForFunction(() => typeof DS !== 'undefined' && Array.isArray(DS.elements) && DS.elements.length > 0);
    await page.waitForTimeout(800);
    await setZoom(page, 1);
    await selectSingle(page, 0);
    const id = await page.evaluate(() => [...DS.selection][0]);
    const before = await modelOf(page, id);

    await resizeFromHandle(page, 'se', 20, 10);
    const afterDesign = await modelOf(page, id);
    assert.ok(afterDesign.w > before.w, 'se-handle resize must grow width');
    assert.ok(afterDesign.h > before.h, 'se-handle resize must grow height');

    await enterPreview(page);
    await page.waitForTimeout(300);
    const afterPreview = await modelOf(page, id);
    assert.deepEqual(afterPreview, afterDesign, 'Preview must show the exact resized w/h Design produced');

    await assertNoConsoleErrors(consoleErrors, 'design resize -> preview sync');
  } finally {
    await browser.close();
    await server.stop();
  }
});

test('LIVE: resize from a handle in Preview changes the shared model and is reflected back in Design', { timeout: 60000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl);
  try {
    await page.waitForFunction(() => typeof DS !== 'undefined' && Array.isArray(DS.elements) && DS.elements.length > 0);
    await page.waitForTimeout(800);
    await setZoom(page, 1);
    await selectSingle(page, 0);
    const id = await page.evaluate(() => [...DS.selection][0]);
    const before = await modelOf(page, id);

    await enterPreview(page);
    await page.waitForTimeout(300);
    await selectPreviewSingle(page, 0);

    await resizeFromHandle(page, 'se', 16, 8);
    const afterPreview = await modelOf(page, id);
    assert.ok(afterPreview.w > before.w, 'preview se-handle resize must grow width');
    assert.ok(afterPreview.h > before.h, 'preview se-handle resize must grow height');

    await exitPreview(page);
    const afterDesign = await modelOf(page, id);
    assert.deepEqual(afterDesign, afterPreview, 'Design must show the exact resized w/h Preview produced');

    await assertNoConsoleErrors(consoleErrors, 'preview resize -> design sync');
  } finally {
    await browser.close();
    await server.stop();
  }
});
