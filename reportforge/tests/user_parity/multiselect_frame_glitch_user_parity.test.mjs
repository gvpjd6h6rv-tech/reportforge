import test from 'node:test';
import assert from 'node:assert/strict';
import {
  startRuntimeServer,
  launchRuntimePage,
  reloadRuntime,
  selectMulti,
  setZoom,
  assertNoConsoleErrors,
} from '../runtime_harness.mjs';
import {
  collectUserParityState,
  captureFrameTimeline,
} from './helpers.mjs';

test('USER-PARITY multiselect overlay does not glitch off for a frame during drag', { timeout: 180000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl);

  try {
    await reloadRuntime(page, server.baseUrl);
    await setZoom(page, 1.5);
    await selectMulti(page, 0, 1);

    const target = page.locator('.cr-element.selected').first();
    const box = await target.boundingBox();
    assert.ok(box, 'selected element bounding box missing');

    const timeline = [];
    await page.mouse.move(box.x + 20, box.y + Math.min(8, box.height / 2));
    await page.mouse.down();
    for (let step = 1; step <= 5; step += 1) {
      await page.mouse.move(
        box.x + 20 + (22 * step / 5),
        box.y + Math.min(8, box.height / 2) + (16 * step / 5),
      );
      const stepFrames = await captureFrameTimeline(page, () => collectUserParityState(page), {
        frames: 2,
        phasePrefix: `drag-step-${step}`,
      });
      timeline.push(...stepFrames);
    }
    await page.mouse.up();
    await page.waitForTimeout(150);

    timeline.forEach(({ phase, state }) => {
      assert.equal(state.selection.length, 2, `${phase}: selection must remain 2`);
      assert.equal(state.overlay.boxCount, 1, `${phase}: multiselect overlay disappeared`);
      assert.ok(
        state.overlay.boxRect && state.overlay.boxRect.width > 0 && state.overlay.boxRect.height > 0,
        `${phase}: overlay box became degenerate ${JSON.stringify(state.overlay.boxRect)}`,
      );
    });

    await assertNoConsoleErrors(consoleErrors, 'USER-PARITY multiselect frame glitch');
  } finally {
    await browser.close();
    await server.stop();
  }
});
