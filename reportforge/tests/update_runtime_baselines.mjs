import {
  startRuntimeServer,
  launchRuntimePage,
  selectSingle,
  setZoom,
  enterPreview,
  takeWorkspaceScreenshot,
  writeBaseline,
} from './runtime_harness.mjs';

const server = await startRuntimeServer();
const { browser, page } = await launchRuntimePage(server.baseUrl);

try {
  // Mirrors runtime_regression.test.mjs's 'selección simple' subtest exactly
  // (default zoom, single select, no reload) — a baseline captured via a
  // different setup path can differ by sub-pixel rounding even with
  // identical final state, and compareSnapshotBuffer is an exact byte hash.
  await selectSingle(page, 0);
  await writeBaseline('runtime-selected-100.png', await takeWorkspaceScreenshot(page));

  // Mirrors the 'zoom 45 100 200' subtest: fresh reload, select, then walk
  // through the same zoom sequence (0.45 -> 1 -> 2) before screenshotting.
  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof DS !== 'undefined' && Array.isArray(DS.elements) && DS.elements.length > 0);
  await page.waitForTimeout(800);
  await selectSingle(page, 0);
  for (const zoom of [0.45, 1, 2]) {
    await setZoom(page, zoom);
  }
  await writeBaseline('runtime-selected-200.png', await takeWorkspaceScreenshot(page));

  // Mirrors the 'preview enter exit' subtest: fresh reload, zoom reset to 1,
  // a design-mode selection made (but not a preview-specific one, so the
  // preview selection overlay must stay hidden — boxCount/handleCount 0).
  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof DS !== 'undefined' && Array.isArray(DS.elements) && DS.elements.length > 0);
  await page.waitForTimeout(800);
  await setZoom(page, 1);
  await selectSingle(page, 0);
  await enterPreview(page);
  await writeBaseline('runtime-preview.png', await takeWorkspaceScreenshot(page));

  console.log('runtime baselines updated');
} finally {
  await browser.close();
  await server.stop();
}
