import test from 'node:test';
import assert from 'node:assert/strict';
import {
  startRuntimeServer,
  launchRuntimePage,
  reloadRuntime,
  enterPreview,
  exitPreview,
  assertNoConsoleErrors,
} from '../runtime_harness.mjs';
import {
  collectUserParityState,
  assertDesignParity,
  assertPreviewParity,
  cloneSeparationQuality,
  assertNoCriticalOcclusion,
  collectElementVisibility,
} from './helpers.mjs';
import { buildSmokeLayerCoverage, formatSmokeCoverageSummary } from './reporting.mjs';

// Fast-interaction smoke: exercises common flows with reduced inter-action wait times (40ms).
// Goal: surface timing bugs that only appear at speed — race conditions, partial renders,
// missing state updates — that standard tests miss due to generous 120–220ms waits.
//
// Sequences tested:
//   A) Rapid paste×3 (40ms between pastes) → parity + separation at final state
//   B) Rapid mode switch (design→preview×3) → parity survives every round-trip
//   C) Rapid undo×3 after paste×3 (40ms between undos) → model count returns to baseline
//
// Chromium only — timing sensitivity varies across browser rendering engines;
// cross-browser fast-interaction coverage is out of scope for this suite.
//
// NOT covered: rapid drag, rapid resize, rapid zoom changes at speed.

const FAST_WAIT = 40; // ms — reduced from standard 120–220ms

test('USER-PARITY fast-interaction smoke: rapid paste, mode switch, undo', { timeout: 180000 }, async (t) => {
  const server = await startRuntimeServer();

  try {
    // -----------------------------------------------------------------------
    // Sequence A: rapid paste×3
    // -----------------------------------------------------------------------
    await t.test('rapid paste x3', async (t) => {
      const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl);
      try {
        await reloadRuntime(page, server.baseUrl);
        await page.locator('.cr-element:not(.pv-el)').filter({ hasText: 'VALOR TOTAL' }).first().click();
        await page.waitForTimeout(FAST_WAIT);

        const before = await collectUserParityState(page, { textIncludes: 'VALOR TOTAL' });
        await page.keyboard.press('Control+c');
        await page.waitForTimeout(FAST_WAIT);

        for (let i = 0; i < 3; i++) {
          await page.keyboard.press('Control+v');
          await page.waitForTimeout(FAST_WAIT);
        }

        const after = await collectUserParityState(page, { textIncludes: 'VALOR TOTAL' });
        assert.equal(after.modelIds.length, before.modelIds.length + 3, 'rapid paste×3 must add 3 ids');
        assertDesignParity(after, 'rapid paste×3 design parity');
        t.diagnostic(`rapid paste×3: modelIds=${after.modelIds.length} designIds=${after.designIds.length}`);

        // Separation check scoped to VALOR TOTAL elements only
        const entries = await Promise.all(
          after.modelIds.map((id) => collectElementVisibility(page, { id, mode: 'design' })),
        );
        assertNoCriticalOcclusion(entries, 'rapid paste×3 occlusion');
        const sep = cloneSeparationQuality(entries);
        t.diagnostic(`rapid paste×3: minGapPx=${sep.minGapPx} maxOverlapRatio=${sep.maxOverlapRatio} collapseRisk=${sep.collapseRisk}`);

        await assertNoConsoleErrors(consoleErrors, 'rapid paste×3');
      } finally {
        await browser.close();
      }
    });

    // -----------------------------------------------------------------------
    // Sequence B: rapid mode switch ×3 round-trips
    // -----------------------------------------------------------------------
    await t.test('rapid mode switch x3', async (t) => {
      const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl);
      try {
        await reloadRuntime(page, server.baseUrl);
        await page.locator('.cr-element:not(.pv-el)').filter({ hasText: 'VALOR TOTAL' }).first().click();
        await page.waitForTimeout(FAST_WAIT);
        await page.keyboard.press('Control+c');
        await page.waitForTimeout(FAST_WAIT);
        await page.keyboard.press('Control+v');
        await page.waitForTimeout(FAST_WAIT);

        const afterPaste = await collectUserParityState(page, { textIncludes: 'VALOR TOTAL' });
        assertDesignParity(afterPaste, 'before mode-switch: design parity');

        for (let i = 0; i < 3; i++) {
          await enterPreview(page);
          const inPreview = await collectUserParityState(page, { textIncludes: 'VALOR TOTAL' });
          assertPreviewParity(inPreview, `mode-switch round-trip ${i + 1}: preview parity`);
          t.diagnostic(`round-trip ${i + 1}: previewIds=${inPreview.previewIds.length}`);

          await exitPreview(page);
          const backInDesign = await collectUserParityState(page, { textIncludes: 'VALOR TOTAL' });
          assertDesignParity(backInDesign, `mode-switch round-trip ${i + 1}: design parity`);
          assert.equal(
            backInDesign.modelIds.length,
            afterPaste.modelIds.length,
            `mode-switch round-trip ${i + 1}: model count must not change`,
          );
        }

        t.diagnostic('rapid mode-switch: 3 round-trips completed, parity intact');
        await assertNoConsoleErrors(consoleErrors, 'rapid mode switch×3');
      } finally {
        await browser.close();
      }
    });

    // -----------------------------------------------------------------------
    // Sequence C: rapid undo×3 after paste×3
    // -----------------------------------------------------------------------
    await t.test('rapid undo x3 after paste x3', async (t) => {
      const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl);
      try {
        await reloadRuntime(page, server.baseUrl);
        await page.locator('.cr-element:not(.pv-el)').filter({ hasText: 'VALOR TOTAL' }).first().click();
        await page.waitForTimeout(FAST_WAIT);

        const baseline = await collectUserParityState(page, { textIncludes: 'VALOR TOTAL' });
        await page.keyboard.press('Control+c');
        await page.waitForTimeout(FAST_WAIT);

        // Record historyIndex before pastes so we can undo exactly the right number of
        // entries. Each paste may push >1 history entry (element + selection update),
        // so undo×3 is not guaranteed to equal undo-3-pastes.
        const histBeforePastes = await page.evaluate(() => DS.historyIndex);

        for (let i = 0; i < 3; i++) {
          await page.keyboard.press('Control+v');
          await page.waitForTimeout(FAST_WAIT);
        }

        const afterPaste = await collectUserParityState(page, { textIncludes: 'VALOR TOTAL' });
        assert.equal(afterPaste.modelIds.length, baseline.modelIds.length + 3, 'paste×3 must add 3 ids before undo');

        const histAfterPastes = await page.evaluate(() => DS.historyIndex);
        const undoCount = histAfterPastes - histBeforePastes;
        t.diagnostic(`rapid undo: histBefore=${histBeforePastes} histAfter=${histAfterPastes} undoCount=${undoCount}`);

        // Programmatic undo: bypasses keyboard throttling while keeping FAST_WAIT cadence.
        for (let i = 0; i < undoCount; i++) {
          await page.evaluate(() => DS.undo());
          await page.waitForTimeout(FAST_WAIT);
        }
        await page.waitForTimeout(200);

        const afterUndo = await collectUserParityState(page, { textIncludes: 'VALOR TOTAL' });
        assert.equal(
          afterUndo.modelIds.length,
          baseline.modelIds.length,
          `rapid undo×3: model count must return to baseline ${baseline.modelIds.length} got ${afterUndo.modelIds.length}`,
        );
        assertDesignParity(afterUndo, 'rapid undo×3 design parity');
        t.diagnostic(`rapid undo×3: baseline=${baseline.modelIds.length} afterUndo=${afterUndo.modelIds.length}`);

        await assertNoConsoleErrors(consoleErrors, 'rapid undo×3');
      } finally {
        await browser.close();
      }
    });

    // Coverage accounting
    t.diagnostic(formatSmokeCoverageSummary(buildSmokeLayerCoverage([
      { category: 'fast_paste_x3', exercised: 1, total: 1 },
      { category: 'fast_mode_switch_x3', exercised: 1, total: 1 },
      { category: 'fast_undo_x3', exercised: 1, total: 1 },
      { category: 'fast_drag', exercised: 0, total: 1, notCoveredNotes: ['rapid drag not exercised'] },
      { category: 'fast_resize', exercised: 0, total: 1, notCoveredNotes: ['rapid resize not exercised'] },
    ])));
  } finally {
    await server.stop();
  }
});
