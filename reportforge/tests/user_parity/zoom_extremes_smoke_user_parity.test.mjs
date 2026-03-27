import test from 'node:test';
import assert from 'node:assert/strict';
import {
  startRuntimeServer,
  launchRuntimePage,
  getBrowserAvailability,
  reloadRuntime,
  setZoom,
  assertNoConsoleErrors,
} from '../runtime_harness.mjs';
import {
  collectElementVisibility,
  collectUserParityState,
  assertDesignParity,
} from './helpers.mjs';
import { buildSmokeLayerCoverage, formatSmokeCoverageSummary } from './reporting.mjs';

// Zoom extremes smoke: verifies selection, overlay, handles, and hit-test at zoom 0.25 and 3.0.
// Uses DS.zoom to verify actual zoom (DS.zoomDesign is always 1 and is unreliable).
// Runs chromium + firefox. Each zoom level is a fresh reload to avoid state leakage.
//
// NOT covered:
// - Zoom 4.0 (upper limit — exercised separately in preview_clipping_user_parity at zoom 2.0)
// - Temporal drift mid-zoom-transition (only final state is checked)
// - Elements outside the visible canvas area at extreme zoom

const ZOOM_LEVELS = [
  { value: 0.25, label: 'zoom-0.25' },
  { value: 3.0, label: 'zoom-3.0' },
];

test('USER-PARITY zoom extremes smoke: selection, overlay, hit-test at 0.25 and 3.0', { timeout: 300000 }, async (t) => {
  const server = await startRuntimeServer();
  const availability = await getBrowserAvailability();
  const targetBrowsers = ['chromium', 'firefox'].filter((b) => availability[b]?.available);

  try {
    for (const browserName of targetBrowsers) {
      await t.test(`browser:${browserName}`, async (t) => {
        const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl, { browserName });
        try {
          for (const { value: zoomValue, label } of ZOOM_LEVELS) {
            await t.test(label, async (t) => {
              await reloadRuntime(page, server.baseUrl);
              await setZoom(page, zoomValue);

              // Verify actual zoom reflects the set value
              const actualZoom = await page.evaluate(() => DS.zoom);
              assert.ok(
                Math.abs(actualZoom - zoomValue) < 0.05,
                `${label}: DS.zoom=${actualZoom} expected≈${zoomValue}`,
              );
              t.diagnostic(`${label} browser=${browserName}: DS.zoom=${actualZoom}`);

              // Get the first element available in the template
              const elInfo = await page.evaluate(() => {
                const el = DS.elements[0];
                return el ? { id: el.id, type: el.type } : null;
              });
              assert.ok(elInfo, `${label}: no elements found`);

              // Select it
              await page.locator(`.cr-element:not(.pv-el)[data-id="${elInfo.id}"]`).click({ timeout: 3000 }).catch(() => {});
              await page.waitForTimeout(100);

              // Design parity: model IDs == DOM IDs
              const state = await collectUserParityState(page);
              assertDesignParity(state, `${label} design parity`);

              // Overlay visible
              const overlay = await page.evaluate(() => ({
                boxCount: document.querySelectorAll('#handles-layer .sel-box').length,
                handleCount: document.querySelectorAll('#handles-layer .sel-handle').length,
              }));
              t.diagnostic(`${label}: overlay boxCount=${overlay.boxCount} handleCount=${overlay.handleCount}`);
              assert.ok(
                overlay.boxCount > 0 || overlay.handleCount > 0,
                `${label}: no sel-box or handle at ${zoomValue}x zoom`,
              );

              // Element visibility: bbox non-degenerate
              const vis = await collectElementVisibility(page, { id: elInfo.id, mode: 'design' });
              assert.ok(vis.exists, `${label}: selected element must exist in DOM at ${zoomValue}x`);
              assert.ok(
                vis.rect && (vis.rect.width > 0 || vis.rect.height > 0),
                `${label}: degenerate bbox at ${zoomValue}x: ${JSON.stringify(vis.rect)}`,
              );

              // Hit-test at zoom extreme (only if element has 2D area and is in viewport).
              // At zoom 0.25, handles are fixed-pixel and can cover the element center, so
              // centerHit may land on a .sel-handle; check centerStack as fallback.
              if (vis.inViewport && vis.rect.width > 0 && vis.rect.height > 0) {
                const hitOk = vis.centerHit?.datasetId === elInfo.id
                  || (vis.edgeHits || []).some((e) => e.hit?.datasetId === elInfo.id)
                  || (vis.centerStack || []).some((s) => s?.datasetId === elInfo.id);
                t.diagnostic(`${label}: hit-test=${hitOk} centerHit=${JSON.stringify(vis.centerHit)}`);
                assert.ok(hitOk, `${label}: element not hit-testable at ${zoomValue}x; centerHit=${JSON.stringify(vis.centerHit)}`);
              } else {
                t.diagnostic(`${label}: element outside viewport at ${zoomValue}x — hit-test skipped`);
              }

              t.diagnostic(`${label}: PASS zoom=${actualZoom} bbox=${JSON.stringify(vis.rect)}`);
            });
          }

          // Coverage accounting
          const zooms = ZOOM_LEVELS.map((z) => ({
            category: `zoom_${z.label}`,
            exercised: 1,
            total: 1,
          }));
          t.diagnostic(formatSmokeCoverageSummary(buildSmokeLayerCoverage([
            ...zooms,
            { category: 'zoom_4.0', exercised: 0, total: 1, notCoveredNotes: ['upper limit — preview_clipping covers zoom 2.0'] },
            { category: 'zoom_transition_drift', exercised: 0, total: 1, notCoveredNotes: ['only final state checked, not mid-transition'] },
          ])));

          await assertNoConsoleErrors(consoleErrors, `USER-PARITY zoom extremes ${browserName}`);
        } finally {
          await browser.close();
        }
      });
    }
  } finally {
    await server.stop();
  }
});
