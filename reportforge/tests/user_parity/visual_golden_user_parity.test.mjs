import test from 'node:test';
import {
  startRuntimeServer,
  launchRuntimePage,
  reloadRuntime,
  selectMulti,
  selectSingle,
  setZoom,
  assertNoConsoleErrors,
} from '../runtime_harness.mjs';
import {
  collectUserParityState,
  collectBoundingBoxMap,
  collectElementVisibility,
  assertDesignParity,
  assertBoundingBoxDriftWithin,
  collectHitMap,
  assertHitMapCoverage,
  assertNoUnexpectedOverlap,
} from './helpers.mjs';
import {
  captureWorkspaceGolden,
  captureRegionGolden,
  compareOrUpdateGolden,
} from './visual/helpers.mjs';

test('USER-PARITY visual goldens for critical visible flows', { timeout: 240000 }, async (t) => {
  const server = await startRuntimeServer();
  const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl);

  try {
    await t.test('multiselect overlay stable golden', async () => {
      await reloadRuntime(page, server.baseUrl);
      await setZoom(page, 1.5);
      await selectMulti(page, 0, 1);

      const state = await collectUserParityState(page);
      const hitMap = await collectHitMap(page, { id: state.selection[0], mode: 'design', grid: 3 });
      assertHitMapCoverage(hitMap, 'multiselect overlay golden hit map', { minCoverage: 0.2 });

      const shot = await captureWorkspaceGolden(page);
      await compareOrUpdateGolden('multiselect-overlay-stable.png', shot, { rmseThreshold: 0.03, fuzzPercent: 3 });
      const regionShot = await captureRegionGolden(page, { selector: '#handles-layer', padding: 20 });
      await compareOrUpdateGolden('multiselect-overlay-stable.region.png', regionShot, { rmseThreshold: 0.025, fuzzPercent: 2 });
    });

    await t.test('clipboard multiple clones golden', async () => {
      await reloadRuntime(page, server.baseUrl);
      await page.locator('.cr-element:not(.pv-el)').filter({ hasText: 'VALOR TOTAL' }).first().click();
      await page.waitForTimeout(120);
      await page.keyboard.press('Control+c');
      await page.waitForTimeout(80);
      for (let i = 0; i < 3; i += 1) {
        await page.keyboard.press('Control+v');
        await page.waitForTimeout(180);
      }

      const designState = await collectUserParityState(page, { textIncludes: 'VALOR TOTAL' });
      assertDesignParity(designState, 'clipboard golden design parity');

      const visEntries = await Promise.all(
        designState.modelIds.map((id) => collectElementVisibility(page, { id, mode: 'design' })),
      );
      assertNoUnexpectedOverlap(visEntries, 'clipboard golden overlap', { maxOverlapRatio: 0.9 });

      const shot = await captureWorkspaceGolden(page);
      await compareOrUpdateGolden('clipboard-three-clones.png', shot, { rmseThreshold: 0.03, fuzzPercent: 3 });
      const regionShot = await captureRegionGolden(page, {
        selectors: designState.modelIds.map((id) => `.cr-element:not(.pv-el)[data-id="${id}"]`),
        padding: 18,
      });
      await compareOrUpdateGolden('clipboard-three-clones.region.png', regionShot, { rmseThreshold: 0.025, fuzzPercent: 2 });
    });

    await t.test('undo redo visual consistent golden', async () => {
      await reloadRuntime(page, server.baseUrl);
      await selectSingle(page, 0);
      await page.keyboard.press('Control+c');
      await page.waitForTimeout(80);
      await page.keyboard.press('Control+v');
      await page.waitForTimeout(180);
      await page.keyboard.press('Control+v');
      await page.waitForTimeout(180);

      const afterPasteMap = await collectBoundingBoxMap(page, {
        ids: await page.evaluate(() => DS.elements.filter(el => (el.content || '').includes('empresa')).map(el => el.id).slice(0, 2)),
        mode: 'design',
      });

      await page.keyboard.press('Control+z');
      await page.waitForTimeout(220);
      await page.keyboard.press('Control+y');
      await page.waitForTimeout(220);

      const state = await collectUserParityState(page);
      const ids = Object.keys(afterPasteMap);
      const afterRedoMap = await collectBoundingBoxMap(page, { ids, mode: 'design' });
      for (const id of ids) {
        if (afterPasteMap[id] && afterRedoMap[id]) {
          assertBoundingBoxDriftWithin(afterRedoMap[id], afterPasteMap[id], `undo/redo bbox ${id}`, 2);
        }
      }

      const shot = await captureWorkspaceGolden(page);
      await compareOrUpdateGolden('undo-redo-consistent.png', shot, { rmseThreshold: 0.03, fuzzPercent: 3 });
      const regionShot = await captureRegionGolden(page, {
        selectors: ids.map((id) => `.cr-element:not(.pv-el)[data-id="${id}"]`),
        padding: 18,
      });
      await compareOrUpdateGolden('undo-redo-consistent.region.png', regionShot, { rmseThreshold: 0.025, fuzzPercent: 2 });
    });

    await assertNoConsoleErrors(consoleErrors, 'USER-PARITY visual golden');
  } finally {
    await browser.close();
    await server.stop();
  }
});
