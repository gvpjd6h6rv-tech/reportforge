/**
 * LIVE SMOKE — CR-PARITY-1, Objective 2: red alignment guide lines.
 *
 * Crystal Reports only shows the red full-canvas alignment guides WHILE a
 * move/resize gesture is actively in progress — never for a static
 * selection (click/select with no drag), and never after mouseup.
 *
 * Root cause (confirmed live before the fix): engines/SelectionOverlay.js
 * _shouldShowGuides() had `if (!DS.previewMode) return true;` — design mode
 * unconditionally showed guides for ANY selection, drag or not. Measured:
 * selectSingle() with zero mouse movement produced selectionGuideCount=4.
 * Preview mode's branch was already correct (drag.type==='move'||'resize'
 * only) — confirmed by the pre-existing, already-passing assertions in
 * preview_drag_sync_av9_live_smoke.test.mjs and
 * preview_interaction_factura_a4_smoke.test.mjs.
 *
 * A second, related gap found while fixing this: renderMultiSelection()
 * (engines/SelectionOverlayRender.js) never received/checked showGuides at
 * all — it unconditionally rendered guides for any multi-selection,
 * regardless of drag state. Both are fixed by the same single
 * _shouldShowGuides() owner, now applied uniformly.
 *
 * Fix: engines/SelectionOverlay.js _shouldShowGuides() now returns the same
 * drag-only condition regardless of DS.previewMode. The single/multi render
 * paths (engines/SelectionOverlayRender.js) both gate on the same
 * `showGuides` boolean computed once per renderHandles() call.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  startRuntimeServer,
  launchRuntimePage,
  selectSingle,
  selectMulti,
  getSelectionSnapshot,
  enterPreview,
  exitPreview,
  selectPreviewSingle,
  assertNoConsoleErrors,
} from './runtime_harness.mjs';

test('LIVE: design — click/select without dragging shows 0 red guides', { timeout: 30000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl);
  try {
    await page.waitForFunction(() => typeof DS !== 'undefined' && Array.isArray(DS.elements) && DS.elements.length > 0);
    await page.waitForTimeout(800);

    await selectSingle(page, 0);
    let snap = await getSelectionSnapshot(page);
    assert.equal(snap.selectionGuideCount, 0, 'single static selection must show 0 guides');

    await selectMulti(page, 0, 1);
    snap = await getSelectionSnapshot(page);
    assert.equal(snap.selectionGuideCount, 0, 'multi static selection must show 0 guides (renderMultiSelection must also respect showGuides)');

    await assertNoConsoleErrors(consoleErrors, 'design static selection no guides');
  } finally {
    await browser.close();
    await server.stop();
  }
});

test('LIVE: design — mousedown+drag shows 4 red guides, mouseup clears them', { timeout: 30000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl);
  try {
    await page.waitForFunction(() => typeof DS !== 'undefined' && Array.isArray(DS.elements) && DS.elements.length > 0);
    await page.waitForTimeout(800);
    await selectSingle(page, 0);

    let snap = await getSelectionSnapshot(page);
    assert.equal(snap.selectionGuideCount, 0, 'before mousedown: 0 guides');

    const box = await page.locator('.sel-box').boundingBox();
    await page.mouse.move(box.x + 20, box.y + Math.min(5, box.height / 2));
    await page.mouse.down();
    await page.mouse.move(box.x + 50, box.y + 25, { steps: 6 });

    snap = await getSelectionSnapshot(page);
    assert.equal(snap.selectionGuideCount, 4, 'during an active move drag: 4 guides must be visible');

    await page.mouse.up();
    await page.waitForFunction(
      () => document.querySelectorAll('#handles-layer .selection-guide').length === 0,
      null,
      { timeout: 3000 }
    );
    snap = await getSelectionSnapshot(page);
    assert.equal(snap.selectionGuideCount, 0, 'after mouseup: guides must be cleared');

    await assertNoConsoleErrors(consoleErrors, 'design drag guide lifecycle');
  } finally {
    await browser.close();
    await server.stop();
  }
});

test('LIVE: design — resize drag also shows guides during the gesture and clears on mouseup', { timeout: 30000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl);
  try {
    await page.waitForFunction(() => typeof DS !== 'undefined' && Array.isArray(DS.elements) && DS.elements.length > 0);
    await page.waitForTimeout(800);
    await selectSingle(page, 0);

    const handle = await page.locator('.sel-handle[data-pos="se"]').boundingBox();
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle.x + handle.width / 2 + 20, handle.y + handle.height / 2 + 10, { steps: 6 });

    const snap = await getSelectionSnapshot(page);
    assert.equal(snap.selectionGuideCount, 4, 'during an active resize drag: 4 guides must be visible');

    await page.mouse.up();
    await page.waitForFunction(
      () => document.querySelectorAll('#handles-layer .selection-guide').length === 0,
      null,
      { timeout: 3000 }
    );

    await assertNoConsoleErrors(consoleErrors, 'design resize guide lifecycle');
  } finally {
    await browser.close();
    await server.stop();
  }
});

test('LIVE: preview — current guide behavior is unchanged (0 static, 4 during drag, 0 after release)', { timeout: 30000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl);
  try {
    await page.waitForFunction(() => typeof DS !== 'undefined' && Array.isArray(DS.elements) && DS.elements.length > 0);
    await page.waitForTimeout(800);
    await enterPreview(page);
    await selectPreviewSingle(page, 0);

    let snap = await getSelectionSnapshot(page);
    assert.equal(snap.selectionGuideCount, 0, 'preview static selection: 0 guides (unchanged)');

    const box = await page.locator('.preview-selection-layer .sel-box').boundingBox();
    await page.mouse.move(box.x + 20, box.y + Math.min(5, box.height / 2));
    await page.mouse.down();
    await page.mouse.move(box.x + 50, box.y + 25, { steps: 6 });

    snap = await getSelectionSnapshot(page);
    assert.equal(snap.selectionGuideCount, 4, 'preview during drag: 4 guides (unchanged)');

    await page.mouse.up();
    await page.waitForFunction(
      () => document.querySelectorAll('.preview-selection-layer .selection-guide').length === 0,
      null,
      { timeout: 3000 }
    );
    snap = await getSelectionSnapshot(page);
    assert.equal(snap.selectionGuideCount, 0, 'preview after release: 0 guides (unchanged)');

    await exitPreview(page);
    await assertNoConsoleErrors(consoleErrors, 'preview guide lifecycle unchanged');
  } finally {
    await browser.close();
    await server.stop();
  }
});
