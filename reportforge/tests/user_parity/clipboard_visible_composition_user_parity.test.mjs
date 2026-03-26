import test from 'node:test';
import assert from 'node:assert/strict';
import {
  startRuntimeServer,
  launchRuntimePage,
  reloadRuntime,
  enterPreview,
  assertNoConsoleErrors,
} from '../runtime_harness.mjs';
import {
  collectUserParityState,
  collectElementVisibility,
  assertDesignParity,
  assertPreviewParity,
  assertVisibleCompositionParity,
  assertElementActuallyVisible,
} from './helpers.mjs';

test('USER-PARITY clipboard clones are not just present, but actually visible and hit-testable', { timeout: 180000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl);

  try {
    await reloadRuntime(page, server.baseUrl);
    await page.locator('.cr-element:not(.pv-el)').filter({ hasText: 'VALOR TOTAL' }).first().click();
    await page.waitForTimeout(120);

    const before = await collectUserParityState(page, { textIncludes: 'VALOR TOTAL' });
    const sourceId = before.selection[0] || before.designIds[0] || null;
    assert.ok(sourceId, 'pre: source id missing');

    await page.keyboard.press('Control+c');
    await page.waitForTimeout(80);
    for (let i = 0; i < 3; i += 1) {
      await page.keyboard.press('Control+v');
      await page.waitForTimeout(180);
    }

    const designState = await collectUserParityState(page, { textIncludes: 'VALOR TOTAL' });
    assert.equal(designState.modelIds.length, before.modelIds.length + 3, 'design: expected 3 new clones in model');
    assertDesignParity(designState, 'clipboard visible composition design parity');

    const designVisibility = await Promise.all(
      designState.modelIds.map((id) => collectElementVisibility(page, { id, mode: 'design' })),
    );
    assertVisibleCompositionParity(designVisibility, 'clipboard clones design composition');

    await enterPreview(page);
    await page.waitForTimeout(220);

    const previewState = await collectUserParityState(page, { textIncludes: 'VALOR TOTAL' });
    assertPreviewParity(previewState, 'clipboard visible composition preview parity');

    const previewVisibility = await Promise.all(
      previewState.modelIds.map((id) => collectElementVisibility(page, { id, mode: 'preview' })),
    );
    previewVisibility.forEach((entry) => {
      assertElementActuallyVisible(entry, `clipboard clones preview visibility:preview:${entry.id}`);
    });
    assert.ok(previewState.previewIds.includes(sourceId), 'preview: source id must remain visible');

    await assertNoConsoleErrors(consoleErrors, 'USER-PARITY clipboard visible composition');
  } finally {
    await browser.close();
    await server.stop();
  }
});
