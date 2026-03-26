import test from 'node:test';
import {
  startRuntimeServer,
  launchRuntimePage,
  reloadRuntime,
  enterPreview,
  setZoom,
  assertNoConsoleErrors,
} from '../runtime_harness.mjs';
import {
  collectElementVisibility,
  assertElementActuallyVisible,
  assertElementNotSeverelyClipped,
} from './helpers.mjs';

test('USER-PARITY preview element remains sufficiently visible under zoom and clipping ancestors', { timeout: 120000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl);

  try {
    await reloadRuntime(page, server.baseUrl);
    await enterPreview(page);
    await setZoom(page, 2.0);
    await page.locator('#preview-content .pv-el').filter({ hasText: 'VALOR TOTAL' }).first().click();
    await page.waitForTimeout(180);

    const id = await page.evaluate(() => [...DS.selection][0] || null);
    const visibility = await collectElementVisibility(page, { id, mode: 'preview' });

    assertElementActuallyVisible(visibility, 'preview clipping visibility');
    assertElementNotSeverelyClipped(visibility, 'preview clipping ratio', { minVisibleRatio: 0.45 });

    await assertNoConsoleErrors(consoleErrors, 'USER-PARITY preview clipping');
  } finally {
    await browser.close();
    await server.stop();
  }
});
