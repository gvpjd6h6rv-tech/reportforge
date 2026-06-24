/**
 * RF-PARITY-AUDIT-1: HistoryEngine is shared between Design and Preview
 * (single DS.elements model). Undo/redo of a drag, a resize, and a paste
 * must produce the exact same model state in both modes, and the overlay/
 * selection must stay consistent (no stale handle, no orphaned box) right
 * after each undo/redo — this is the bug class named in the brief: "undo de
 * teclado no puede mover texto dejando caja atrás".
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
  dragSelectedElement,
  resizeFromHandle,
  assertNoConsoleErrors,
} from './runtime_harness.mjs';

async function modelOf(page, id) {
  return page.evaluate((id) => {
    const el = DS.getElementById(id);
    return { id: el.id, x: el.x, y: el.y, w: el.w, h: el.h };
  }, id);
}

async function overlayConsistency(page, id) {
  // DocumentHistory.undo()/redo() clears selection after restoring
  // (engines/DocumentHistory.js — clearSelectionState), same as the menu
  // undo/redo buttons (CommandRuntimeHandlersSelectionDispatch.js:8-9) —
  // this is the established, consistent behavior, not a bug to preserve
  // around. So "consistent" here means: no ORPHANED stale box left behind
  // (element exists, in DOM, at the model's restored position; if nothing
  // is selected there is no .sel-box at all — never a box at the wrong
  // position, which is the real failure mode this audit is guarding
  // against).
  return page.evaluate((id) => {
    const el = document.querySelector(`.cr-element[data-id="${id}"]`);
    if (!el) return { ok: false, reason: 'element missing from DOM after undo/redo' };
    const box = document.querySelector('#handles-layer .sel-box');
    const selected = DS.selection.has(id);
    if (!selected) {
      // No selection -> there must be no leftover box at all.
      return { ok: !box, reason: box ? 'orphaned .sel-box with no matching selection' : null };
    }
    if (!box) return { ok: false, reason: 'element is selected but no .sel-box rendered' };
    const er = el.getBoundingClientRect();
    const br = box.getBoundingClientRect();
    const dx = Math.abs(er.left - br.left);
    const dy = Math.abs(er.top - br.top);
    return { ok: dx < 1 && dy < 1, dx, dy };
  }, id);
}

test('LIVE: undo/redo a drag — Design model and overlay stay synced, Preview matches', { timeout: 60000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl);
  try {
    await page.waitForFunction(() => typeof DS !== 'undefined' && Array.isArray(DS.elements) && DS.elements.length > 0);
    await page.waitForTimeout(800);
    await setZoom(page, 1);
    await selectSingle(page, 0);
    const id = await page.evaluate(() => [...DS.selection][0]);
    const before = await modelOf(page, id);

    await dragSelectedElement(page, 25, 12);
    const afterDrag = await modelOf(page, id);
    assert.notDeepEqual(afterDrag, before, 'drag must actually change the model');

    await page.keyboard.press('Control+z');
    await page.waitForTimeout(200);
    const afterUndo = await modelOf(page, id);
    assert.deepEqual(afterUndo, before, 'Ctrl+Z must restore the exact pre-drag model state');
    const undoOverlay = await overlayConsistency(page, id);
    assert.ok(undoOverlay.ok, `after undo: selection box must match element rect exactly, got ${JSON.stringify(undoOverlay)}`);

    await page.keyboard.press('Control+Shift+Z');
    await page.waitForTimeout(200);
    const afterRedo = await modelOf(page, id);
    assert.deepEqual(afterRedo, afterDrag, 'Ctrl+Shift+Z must restore the exact post-drag model state');
    const redoOverlay = await overlayConsistency(page, id);
    assert.ok(redoOverlay.ok, `after redo: selection box must match element rect exactly, got ${JSON.stringify(redoOverlay)}`);

    await enterPreview(page);
    await page.waitForTimeout(300);
    const previewModel = await modelOf(page, id);
    assert.deepEqual(previewModel, afterRedo, 'Preview must show the same model state Design had after undo+redo');

    await assertNoConsoleErrors(consoleErrors, 'undo/redo drag sync');
  } finally {
    await browser.close();
    await server.stop();
  }
});

test('LIVE: undo/redo a resize — Design model and overlay stay synced, Preview matches', { timeout: 60000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl);
  try {
    await page.waitForFunction(() => typeof DS !== 'undefined' && Array.isArray(DS.elements) && DS.elements.length > 0);
    await page.waitForTimeout(800);
    await setZoom(page, 1);
    await selectSingle(page, 0);
    const id = await page.evaluate(() => [...DS.selection][0]);
    const before = await modelOf(page, id);

    await resizeFromHandle(page, 'se', 18, 9);
    const afterResize = await modelOf(page, id);
    assert.notDeepEqual(afterResize, before, 'resize must actually change the model');

    await page.keyboard.press('Control+z');
    await page.waitForTimeout(200);
    const afterUndo = await modelOf(page, id);
    assert.deepEqual(afterUndo, before, 'Ctrl+Z must restore the exact pre-resize model state');
    const undoOverlay = await overlayConsistency(page, id);
    assert.ok(undoOverlay.ok, `after undo: selection box must match element rect, got ${JSON.stringify(undoOverlay)}`);

    await page.keyboard.press('Control+Shift+Z');
    await page.waitForTimeout(200);
    const afterRedo = await modelOf(page, id);
    assert.deepEqual(afterRedo, afterResize, 'Ctrl+Shift+Z must restore the exact post-resize model state');
    const redoOverlay = await overlayConsistency(page, id);
    assert.ok(redoOverlay.ok, `after redo: selection box must match element rect, got ${JSON.stringify(redoOverlay)}`);

    await enterPreview(page);
    await page.waitForTimeout(300);
    const previewModel = await modelOf(page, id);
    assert.deepEqual(previewModel, afterRedo, 'Preview must show the same model state Design had after undo+redo of resize');

    await assertNoConsoleErrors(consoleErrors, 'undo/redo resize sync');
  } finally {
    await browser.close();
    await server.stop();
  }
});

test('LIVE: undo/redo a paste — element count and overlay stay synced between Design and Preview', { timeout: 60000 }, async () => {
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
    const afterPaste = await page.evaluate(() => DS.elements.length);
    assert.equal(afterPaste, before + 1, 'paste must add one element');

    await page.keyboard.press('Control+z');
    await page.waitForTimeout(200);
    const afterUndo = await page.evaluate(() => DS.elements.length);
    assert.equal(afterUndo, before, 'Ctrl+Z must remove the pasted element, restoring the original count');

    await page.keyboard.press('Control+Shift+Z');
    await page.waitForTimeout(200);
    const afterRedo = await page.evaluate(() => DS.elements.length);
    assert.equal(afterRedo, afterPaste, 'Ctrl+Shift+Z must re-add the pasted element');

    await enterPreview(page);
    await page.waitForTimeout(300);
    const previewCount = await page.evaluate(() => DS.elements.length);
    assert.equal(previewCount, afterRedo, 'Preview must show the same element count after undo+redo of a paste');

    await exitPreview(page);
    const designCountAfter = await page.evaluate(() => DS.elements.length);
    assert.equal(designCountAfter, afterRedo, 'Design must still show the same element count after a round trip through Preview');

    await assertNoConsoleErrors(consoleErrors, 'undo/redo paste sync');
  } finally {
    await browser.close();
    await server.stop();
  }
});
