import test from 'node:test';
import assert from 'node:assert/strict';
import {
  startRuntimeServer,
  launchRuntimePage,
  getBrowserAvailability,
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
  computeGoldenSpreadDiagnostic,
} from './visual/helpers.mjs';

test('USER-PARITY visual goldens for critical visible flows', { timeout: 240000 }, async (t) => {
  const server = await startRuntimeServer();
  const availability = await getBrowserAvailability();
  const browserNames = Object.entries(availability).filter(([, info]) => info.available).map(([browserName]) => browserName);

  try {
    for (const browserName of browserNames) {
      await t.test(`browser:${browserName}`, async (t) => {
        const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl, { browserName });
        try {
          await t.test('multiselect overlay stable golden', async () => {
            await reloadRuntime(page, server.baseUrl);
            await setZoom(page, 1.5);
            await selectMulti(page, 0, 1);

            const state = await collectUserParityState(page);
            const hitMap = await collectHitMap(page, { id: state.selection[0], mode: 'design', grid: 3 });
            assertHitMapCoverage(hitMap, 'multiselect overlay golden hit map', { minCoverage: 0.2 });

            const shot = await captureWorkspaceGolden(page);
            await compareOrUpdateGolden(`multiselect-overlay-stable.${browserName}.png`, shot, { rmseThreshold: 0.03, fuzzPercent: 3 });
            const regionShot = await captureRegionGolden(page, {
              selector: '#handles-layer',
              padding: 20,
              browserName,
              regionName: 'region',
            });
            await compareOrUpdateGolden(`multiselect-overlay-stable.region.${browserName}.png`, regionShot.buffer, {
              rmseThreshold: 0.025,
              fuzzPercent: 2,
              metadata: regionShot.metadata,
            });
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
            await compareOrUpdateGolden(`clipboard-three-clones.${browserName}.png`, shot, { rmseThreshold: 0.03, fuzzPercent: 3 });
            const regionShot = await captureRegionGolden(page, {
              selectors: designState.modelIds.map((id) => `.cr-element:not(.pv-el)[data-id="${id}"]`),
              padding: 18,
              browserName,
              regionName: 'region',
            });
            await compareOrUpdateGolden(`clipboard-three-clones.region.${browserName}.png`, regionShot.buffer, {
              rmseThreshold: 0.025,
              fuzzPercent: 2,
              metadata: regionShot.metadata,
            });
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
            await compareOrUpdateGolden(`undo-redo-consistent.${browserName}.png`, shot, { rmseThreshold: 0.03, fuzzPercent: 3 });
            const regionShot = await captureRegionGolden(page, {
              selectors: ids.map((id) => `.cr-element:not(.pv-el)[data-id="${id}"]`),
              padding: 18,
              browserName,
              regionName: 'region',
            });
            await compareOrUpdateGolden(`undo-redo-consistent.region.${browserName}.png`, regionShot.buffer, {
              rmseThreshold: 0.025,
              fuzzPercent: 2,
              metadata: regionShot.metadata,
            });
          });

          await t.test('handle se corner micro-crop golden', async () => {
            await reloadRuntime(page, server.baseUrl);
            await setZoom(page, 1.5);
            await selectSingle(page, 0);

            const handleInfo = await page.evaluate(() => {
              const handle = document.querySelector('#handles-layer .sel-handle[data-pos="se"]');
              if (!handle) return null;
              const r = handle.getBoundingClientRect();
              return { left: r.left, top: r.top, width: r.width, height: r.height };
            });
            assert.ok(handleInfo, 'se handle must be present after multiselect');
            assert.ok(handleInfo.width > 0 && handleInfo.height > 0, `se handle must have non-zero size: ${JSON.stringify(handleInfo)}`);

            // Tight crop: the handle itself + small margin to catch border rendering
            const handleShot = await captureRegionGolden(page, {
              selector: '#handles-layer .sel-handle[data-pos="se"]',
              padding: 6,
              browserName,
              regionName: 'se-handle',
            });
            await compareOrUpdateGolden(`handle-se-corner.region.${browserName}.png`, handleShot.buffer, {
              rmseThreshold: 0.02,
              fuzzPercent: 2,
              metadata: handleShot.metadata,
            });
          });

          await t.test('clone intersection micro-crop golden', async () => {
            await reloadRuntime(page, server.baseUrl);
            await page.locator('.cr-element:not(.pv-el)').filter({ hasText: 'VALOR TOTAL' }).first().click();
            await page.waitForTimeout(120);
            await page.keyboard.press('Control+c');
            await page.waitForTimeout(80);
            await page.keyboard.press('Control+v');
            await page.waitForTimeout(180);
            await page.keyboard.press('Control+v');
            await page.waitForTimeout(180);

            const designState = await collectUserParityState(page, { textIncludes: 'VALOR TOTAL' });
            assertDesignParity(designState, 'clone intersection golden design parity');
            assert.ok(designState.modelIds.length >= 2, 'need at least 2 elements for intersection crop');

            // Compute intersection rect of first two clone bboxes
            const intersectionRect = await page.evaluate((ids) => {
              const rects = ids.slice(0, 2).map((id) => {
                const el = document.querySelector(`.cr-element:not(.pv-el)[data-id="${id}"]`);
                if (!el) return null;
                const r = el.getBoundingClientRect();
                return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
              }).filter(Boolean);
              if (rects.length < 2) return null;
              const left = Math.max(rects[0].left, rects[1].left);
              const top = Math.max(rects[0].top, rects[1].top);
              const right = Math.min(rects[0].right, rects[1].right);
              const bottom = Math.min(rects[0].bottom, rects[1].bottom);
              if (right <= left || bottom <= top) return null;
              return { left, top, width: right - left, height: bottom - top };
            }, designState.modelIds);

            // If no actual pixel intersection fall back to the tight bounding box of both elements
            const cropRect = intersectionRect || await page.evaluate((ids) => {
              const rects = ids.slice(0, 2).map((id) => {
                const el = document.querySelector(`.cr-element:not(.pv-el)[data-id="${id}"]`);
                if (!el) return null;
                const r = el.getBoundingClientRect();
                return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
              }).filter(Boolean);
              if (!rects.length) return null;
              return {
                left: Math.min(...rects.map((r) => r.left)),
                top: Math.min(...rects.map((r) => r.top)),
                width: Math.max(...rects.map((r) => r.right)) - Math.min(...rects.map((r) => r.left)),
                height: Math.max(...rects.map((r) => r.bottom)) - Math.min(...rects.map((r) => r.top)),
              };
            }, designState.modelIds);

            assert.ok(cropRect, 'could not compute crop rect for clone intersection');
            t.diagnostic(`clone-intersection crop: ${JSON.stringify(cropRect)} intersects=${!!intersectionRect}`);

            const intersectionShot = await captureRegionGolden(page, {
              rect: cropRect,
              padding: 10,
              browserName,
              regionName: 'clone-intersection',
            });
            await compareOrUpdateGolden(`clone-intersection.region.${browserName}.png`, intersectionShot.buffer, {
              rmseThreshold: 0.03,
              fuzzPercent: 3,
              metadata: intersectionShot.metadata,
            });
          });

          await assertNoConsoleErrors(consoleErrors, `USER-PARITY visual golden ${browserName}`);
        } finally {
          await browser.close();
        }
      });
    }

    // Cross-browser spread diagnostics — emitted after all browsers complete
    // These are informational only: they surface how much golden regions vary across browsers.
    for (const goldenBase of ['handle-se-corner.region', 'clone-intersection.region']) {
      const spread = await computeGoldenSpreadDiagnostic(goldenBase, browserNames);
      t.diagnostic(`cross-browser spread ${goldenBase}: maxSpread=${spread.maxSpread} pairs=${JSON.stringify(spread.pairs)}`);
    }
  } finally {
    await server.stop();
  }
});
