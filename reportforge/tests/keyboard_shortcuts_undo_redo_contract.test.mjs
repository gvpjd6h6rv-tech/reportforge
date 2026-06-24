/**
 * RF-PARITY-AUDIT-1: Ctrl+Z / Ctrl+Shift+Z must produce the EXACT same
 * result as the #btn-undo / #btn-redo menu buttons.
 *
 * Root cause this guards against (proven live, not hypothesis):
 * engines/HistoryEngine.js (bound to Ctrl+Z/Ctrl+Y/Ctrl+Shift+Z in
 * KeyboardEngine.js) used to keep its OWN independent undo/redo stack,
 * completely disconnected from DS.saveHistory/DS.undo/DS.redo (the stack
 * DocumentHistory.js maintains and the menu buttons use —
 * CommandRuntimeHandlersSelectionDispatch.js:8-9). Only drag, nudge, and
 * paste ever called HistoryEngine.push(), so Ctrl+Z silently did nothing
 * after resize, align, format, properties, or section edits — while the
 * menu buttons worked for all of them. Fixed by making HistoryEngine a
 * thin delegate to DS.saveHistory/undo/redo, so both input paths share one
 * stack and always agree.
 *
 * Cmd+Z / Cmd+Shift+Z: KeyboardEngine.js's `_encode` treats `e.metaKey` the
 * same as `e.ctrlKey` (`if (e.ctrlKey || e.metaKey) parts.push('ctrl')`),
 * so no separate test is needed — same code path, same combo string.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  startRuntimeServer,
  launchRuntimePage,
  selectSingle,
  setZoom,
  resizeFromHandle,
  assertNoConsoleErrors,
} from './runtime_harness.mjs';

async function modelOf(page, id) {
  return page.evaluate((id) => {
    const el = DS.getElementById(id);
    return { id: el.id, x: el.x, y: el.y, w: el.w, h: el.h };
  }, id);
}

test('LIVE: Ctrl+Z after resize == #btn-undo after resize (model-identical)', { timeout: 60000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl);
  try {
    await page.waitForFunction(() => typeof DS !== 'undefined' && Array.isArray(DS.elements) && DS.elements.length > 0);
    await page.waitForTimeout(800);
    await setZoom(page, 1);
    await selectSingle(page, 0);
    const id = await page.evaluate(() => [...DS.selection][0]);
    const before = await modelOf(page, id);

    await resizeFromHandle(page, 'se', 22, 11);
    const afterResize = await modelOf(page, id);
    assert.notDeepEqual(afterResize, before, 'resize must change the model (sanity check)');

    await page.keyboard.press('Control+z');
    await page.waitForTimeout(200);
    const afterCtrlZ = await modelOf(page, id);
    assert.deepEqual(afterCtrlZ, before, 'Ctrl+Z must undo the resize — this is the exact bug RF-PARITY-AUDIT-1 found and fixed');

    // Redo via Ctrl+Shift+Z, then undo AGAIN via the menu button — both
    // input paths must agree on the model at every step.
    await page.keyboard.press('Control+Shift+Z');
    await page.waitForTimeout(200);
    const afterCtrlShiftZ = await modelOf(page, id);
    assert.deepEqual(afterCtrlShiftZ, afterResize, 'Ctrl+Shift+Z must redo the resize');

    await page.click('#btn-undo');
    await page.waitForTimeout(200);
    const afterMenuUndo = await modelOf(page, id);
    assert.deepEqual(afterMenuUndo, before, '#btn-undo must produce the exact same result Ctrl+Z did');

    await page.click('#btn-redo');
    await page.waitForTimeout(200);
    const afterMenuRedo = await modelOf(page, id);
    assert.deepEqual(afterMenuRedo, afterResize, '#btn-redo must produce the exact same result Ctrl+Shift+Z did');

    await assertNoConsoleErrors(consoleErrors, 'keyboard vs menu undo/redo contract (resize)');
  } finally {
    await browser.close();
    await server.stop();
  }
});

test('LIVE: keyboard undo/redo is not blocked by focus on a non-text canvas control', { timeout: 60000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl);
  try {
    await page.waitForFunction(() => typeof DS !== 'undefined' && Array.isArray(DS.elements) && DS.elements.length > 0);
    await page.waitForTimeout(800);
    await setZoom(page, 1);
    await selectSingle(page, 0);
    const id = await page.evaluate(() => [...DS.selection][0]);
    const before = await modelOf(page, id);

    await resizeFromHandle(page, 'se', 14, 7);
    const afterResize = await modelOf(page, id);

    // Focus the zoom button (a real, non-text, clickable canvas-adjacent
    // control) before pressing Ctrl+Z — must NOT be blocked. KeyboardEngine
    // only skips INPUT/TEXTAREA/SELECT/contentEditable, by design (so a
    // user actively typing keeps native browser undo for that field).
    await page.evaluate(() => document.getElementById('zw-in')?.focus());
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(200);
    const afterCtrlZ = await modelOf(page, id);
    assert.deepEqual(afterCtrlZ, before, 'Ctrl+Z must work while focus is on a non-text control (e.g. the zoom button)');

    await assertNoConsoleErrors(consoleErrors, 'keyboard undo not blocked by non-text focus');
  } finally {
    await browser.close();
    await server.stop();
  }
});

test('LIVE: keyboard undo IS correctly skipped while actively typing in a real text input (does not eat native input undo)', { timeout: 60000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl);
  try {
    await page.waitForFunction(() => typeof DS !== 'undefined' && Array.isArray(DS.elements) && DS.elements.length > 0);
    await page.waitForTimeout(800);
    await setZoom(page, 1);
    await selectSingle(page, 0);
    const id = await page.evaluate(() => [...DS.selection][0]);

    await resizeFromHandle(page, 'se', 10, 5);
    const afterResize = await modelOf(page, id);

    const hasTextInput = await page.evaluate(() => {
      const input = document.querySelector('input[type="text"], input:not([type]), textarea');
      if (!input) return false;
      input.focus();
      return document.activeElement === input;
    });
    if (hasTextInput) {
      await page.keyboard.press('Control+z');
      await page.waitForTimeout(200);
      const afterCtrlZWhileTyping = await modelOf(page, id);
      assert.deepEqual(afterCtrlZWhileTyping, afterResize, 'Ctrl+Z while a real text input has focus must NOT touch the canvas model (KeyboardEngine._onKeyDown intentionally bails for INPUT/TEXTAREA/contentEditable)');
    }

    await assertNoConsoleErrors(consoleErrors, 'keyboard undo correctly scoped away from text inputs');
  } finally {
    await browser.close();
    await server.stop();
  }
});
