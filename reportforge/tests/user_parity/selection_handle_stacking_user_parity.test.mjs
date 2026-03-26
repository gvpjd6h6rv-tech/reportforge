import test from 'node:test';
import {
  startRuntimeServer,
  launchRuntimePage,
  reloadRuntime,
  selectSingle,
  setZoom,
  assertNoConsoleErrors,
} from '../runtime_harness.mjs';
import {
  collectSelectorVisibility,
  assertSelectorHitTestable,
} from './helpers.mjs';

test('USER-PARITY single-selection resize handle stays visible and not occluded by unexpected stacking', { timeout: 120000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl);

  try {
    await reloadRuntime(page, server.baseUrl);
    await setZoom(page, 1.5);
    await selectSingle(page, 0);

    const handleInfo = await collectSelectorVisibility(page, {
      selector: '#handles-layer .sel-handle[data-pos="se"]',
      mode: 'design',
    });

    assertSelectorHitTestable(
      handleInfo,
      'selection handle stacking',
      (hit) => hit.className?.includes('sel-handle') && hit.datasetPos === 'se',
    );

    await assertNoConsoleErrors(consoleErrors, 'USER-PARITY selection handle stacking');
  } finally {
    await browser.close();
    await server.stop();
  }
});
