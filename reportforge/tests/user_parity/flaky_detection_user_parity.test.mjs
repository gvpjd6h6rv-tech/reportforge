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
  captureTemporalFrames,
  computeMicroJitterScore,
  collectElementVisibility,
  measureOcclusionDetail,
} from './helpers.mjs';
import {
  computeFlakinessBand,
  formatFlowSummary,
} from './reporting.mjs';

// This test runs the overlay stability capture twice in the same browser session.
// It does NOT fail on flakiness — it marks findings as UNSTABLE in diagnostics only.
// Purpose: surface timing-sensitive regressions before they become random CI failures.
//
// What it replaces manually: "sometimes the multiselect overlay flickers/disappears
// when dragging — hard to reproduce, only noticed during QA review sessions".

test('USER-PARITY flaky detection: overlay jitter stability across repeated runs', { timeout: 180000 }, async (t) => {
  const ITERATIONS = 2;
  const server = await startRuntimeServer();
  const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl);

  const jitterScores = [];
  const frameDropResults = [];
  const occludedRatios = [];

  try {
    for (let iter = 1; iter <= ITERATIONS; iter += 1) {
      await reloadRuntime(page, server.baseUrl);
      await setZoom(page, 1.5);
      await selectMulti(page, 0, 1);

      const target = page.locator('.cr-element.selected').first();
      const box = await target.boundingBox();
      assert.ok(box, `iter=${iter}: selected element bounding box missing`);

      // Short drag to trigger overlay movement
      await page.mouse.move(box.x + 20, box.y + Math.min(8, box.height / 2));
      await page.mouse.down();
      for (let step = 1; step <= 4; step += 1) {
        await page.mouse.move(
          box.x + 20 + (20 * step / 4),
          box.y + Math.min(8, box.height / 2) + (14 * step / 4),
        );
      }
      await page.mouse.up();
      await page.waitForTimeout(80);

      // Capture overlay temporal frames
      const frames = await captureTemporalFrames(page, '#handles-layer .sel-box', {
        phasePrefix: `iter${iter}-overlay`,
        microtasks: 1,
        timeouts: [0, 4, 8],
        frames: 4,
      });
      const jitter = computeMicroJitterScore(frames, { driftThresholdPx: 1 });
      jitterScores.push(jitter.jitterScore);
      frameDropResults.push(jitter.frameDropDetected);

      // Collect occlusion for first selected element
      const firstId = await page.evaluate(() => [...DS.selection][0] || null);
      if (firstId) {
        const entry = await collectElementVisibility(page, { id: firstId, mode: 'design' });
        const occ = measureOcclusionDetail(entry);
        occludedRatios.push(occ.occludedRatio);
        t.diagnostic(`iter=${iter} id=${firstId} occludedRatio=${Math.round(occ.occludedRatio * 100)}% level=${occ.occlusionLevel}`);
      }

      t.diagnostic(`iter=${iter} jitterScore=${jitter.jitterScore} frameDropDetected=${jitter.frameDropDetected}`);

      // Hard assertion: each iteration must individually pass threshold
      assert.equal(jitter.frameDropDetected, false, `iter=${iter}: frame drop detected diagnostics=${JSON.stringify(jitter.diagnostics)}`);
      assert.ok(jitter.jitterScore < 0.02, `iter=${iter}: jitterScore ${jitter.jitterScore} >= 0.02 diagnostics=${JSON.stringify(jitter.diagnostics)}`);
    }

    // Flakiness band analysis — warns but never fails
    const jitterBand = computeFlakinessBand(jitterScores, { warnThreshold: 0.05 });
    const occlusionBand = occludedRatios.length >= 2
      ? computeFlakinessBand(occludedRatios, { warnThreshold: 0.1 })
      : null;

    t.diagnostic(formatFlowSummary({
      flow: 'multiselect-drag-overlay',
      browser: 'chromium',
      jitterScore: jitterBand.mean,
      occludedRatio: occlusionBand ? occlusionBand.mean : null,
      labels: ['temporal-glitch', 'fine-composition'],
      replacesManualCheck: 'overlay disappears or flickers during drag (intermittent QA observation)',
    }));

    t.diagnostic(`flakiness jitter: spread=${jitterBand.spread} warnLevel=${jitterBand.warnLevel} stable=${jitterBand.stable} values=${JSON.stringify(jitterBand.values)}`);
    if (occlusionBand) {
      t.diagnostic(`flakiness occlusion: spread=${occlusionBand.spread} warnLevel=${occlusionBand.warnLevel} stable=${occlusionBand.stable}`);
    }

    // Emit UNSTABLE marker in diagnostics if variation detected — does not fail the test
    if (!jitterBand.stable) {
      t.diagnostic(`UNSTABLE: jitter varies across iterations — this test may be timing-sensitive. spread=${jitterBand.spread} values=${JSON.stringify(jitterBand.values)}`);
    }
    if (occlusionBand && !occlusionBand.stable) {
      t.diagnostic(`UNSTABLE: occlusion varies across iterations. spread=${occlusionBand.spread} values=${JSON.stringify(occlusionBand.values)}`);
    }

    await assertNoConsoleErrors(consoleErrors, 'USER-PARITY flaky detection overlay');
  } finally {
    await browser.close();
    await server.stop();
  }
});
