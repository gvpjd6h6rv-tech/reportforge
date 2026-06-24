/**
 * RF-PARITY-AUDIT-1: Ctrl+Z / Ctrl+Shift+Z must work identically in both
 * Design and Preview (same shared DS.saveHistory/undo/redo stack — see
 * engines/HistoryEngine.js and keyboard_shortcuts_undo_redo_contract.test.mjs
 * for the root cause this depends on).
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
  resizeFromHandle,
  dragPreviewSelected,
  assertNoConsoleErrors,
} from './runtime_harness.mjs';

async function modelOf(page, id) {
  return page.evaluate((id) => {
    const el = DS.getElementById(id);
    return { id: el.id, x: el.x, y: el.y, w: el.w, h: el.h };
  }, id);
}

test('LIVE: Ctrl+Z works in Preview for a change made in Design, and the undone state survives a mode switch', { timeout: 60000 }, async () => {
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
    const afterResize = await modelOf(page, id);

    await enterPreview(page);
    await page.waitForTimeout(300);
    const previewBeforeUndo = await modelOf(page, id);
    assert.deepEqual(previewBeforeUndo, afterResize, 'Preview must show the resized state before any undo');

    await page.keyboard.press('Control+z');
    await page.waitForTimeout(250);
    const previewAfterUndo = await modelOf(page, id);
    assert.deepEqual(previewAfterUndo, before, 'Ctrl+Z in Preview must undo a resize that happened in Design');

    await exitPreview(page);
    const designAfterUndo = await modelOf(page, id);
    assert.deepEqual(designAfterUndo, before, 'Design must keep the undone state after switching back from Preview');

    await assertNoConsoleErrors(consoleErrors, 'preview ctrl+z undoes design resize');
  } finally {
    await browser.close();
    await server.stop();
  }
});

test('LIVE: Ctrl+Shift+Z works in Design for a change made (and undone) in Preview', { timeout: 60000 }, async () => {
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
    await dragPreviewSelected(page, 16, 8);
    const afterDrag = await modelOf(page, id);
    assert.notDeepEqual(afterDrag, before, 'preview drag must change the model');

    await page.keyboard.press('Control+z');
    await page.waitForTimeout(250);
    const afterPreviewUndo = await modelOf(page, id);
    assert.deepEqual(afterPreviewUndo, before, 'Ctrl+Z in Preview must undo its own drag');

    await exitPreview(page);
    await page.keyboard.press('Control+Shift+Z');
    await page.waitForTimeout(250);
    const afterDesignRedo = await modelOf(page, id);
    assert.deepEqual(afterDesignRedo, afterDrag, 'Ctrl+Shift+Z in Design must redo a change that was undone in Preview');

    await assertNoConsoleErrors(consoleErrors, 'design ctrl+shift+z redoes preview drag');
  } finally {
    await browser.close();
    await server.stop();
  }
});
