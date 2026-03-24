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
  await selectSingle(page, 0);
  await writeBaseline('runtime-selected-100.png', await takeWorkspaceScreenshot(page));

  await setZoom(page, 2);
  await writeBaseline('runtime-selected-200.png', await takeWorkspaceScreenshot(page));

  await enterPreview(page);
  await writeBaseline('runtime-preview.png', await takeWorkspaceScreenshot(page));

  console.log('runtime baselines updated');
} finally {
  await browser.close();
  await server.stop();
}
