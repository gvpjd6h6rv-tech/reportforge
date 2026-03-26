import test from 'node:test';
import assert from 'node:assert/strict';
import {
  startRuntimeServer,
  launchRuntimePage,
  reloadRuntime,
  selectMulti,
  enterPreview,
  exitPreview,
  dragSelectedElement,
  assertNoConsoleErrors,
} from '../runtime_harness.mjs';
import {
  collectUserParityState,
  collectElementVisibility,
  assertDesignParity,
  assertPreviewParity,
  assertBoundingBoxDriftWithin,
  captureTemporalFrames,
  computeMicroJitterScore,
  measureOcclusionDetail,
  cloneSeparationQuality,
  assertNoCriticalOcclusion,
  assertCloneSeparation,
} from './helpers.mjs';

// Harder undo/redo flows — chromium only.
// Cross-browser coverage for basic undo/redo is in undo_redo_user_parity.test.mjs.
// Each subtest exercises a distinct mixed history that the basic test does not reach:
//   A) paste → drag → undo drag → undo paste → redo paste → redo drag (rect restore)
//   B) paste×2 → preview round-trip → undo → redo (parity survives mode switch)
//   C) multiselect → paste → undo → redo (overlay stability, both clones removed/restored)

test('USER-PARITY undo/redo mixed histories: drag, mode switch, multiselect', { timeout: 240000 }, async (t) => {
  const server = await startRuntimeServer();

  try {
    // -----------------------------------------------------------------------
    // Subtest A: paste → drag → undo drag → redo drag
    // Key assertion: rect of dragged element restores on undo and re-applies on redo.
    // Does NOT test undo of paste (different undo-depth, already covered by basic test).
    // -----------------------------------------------------------------------
    await t.test('paste drag undo redo rect restore', async (t) => {
      const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl);
      try {
        await reloadRuntime(page, server.baseUrl);
        await page.locator('.cr-element:not(.pv-el)').filter({ hasText: 'VALOR TOTAL' }).first().click();
        await page.waitForTimeout(120);
        const before = await collectUserParityState(page, { textIncludes: 'VALOR TOTAL' });

        await page.keyboard.press('Control+c');
        await page.waitForTimeout(80);
        await page.keyboard.press('Control+v');
        await page.waitForTimeout(200);

        const afterPaste = await collectUserParityState(page, { textIncludes: 'VALOR TOTAL' });
        assert.equal(afterPaste.modelIds.length, before.modelIds.length + 1, 'paste must add 1 id');
        assertDesignParity(afterPaste, 'after paste design parity');

        // Get whatever is currently selected after paste (likely the new clone)
        const selectedId = await page.evaluate(() => [...DS.selection][0] || null);
        assert.ok(selectedId, 'an element must be selected after paste');

        const rectBeforeDrag = (await collectElementVisibility(page, { id: selectedId, mode: 'design' })).rect;
        assert.ok(rectBeforeDrag, 'selected element must have a rect before drag');

        await dragSelectedElement(page, 24, 18);
        await page.waitForTimeout(180);

        const rectAfterDrag = (await collectElementVisibility(page, { id: selectedId, mode: 'design' })).rect;
        assert.ok(rectAfterDrag, 'selected element must have a rect after drag');
        const moved = Math.abs((rectAfterDrag.left || 0) - (rectBeforeDrag.left || 0)) > 1
          || Math.abs((rectAfterDrag.top || 0) - (rectBeforeDrag.top || 0)) > 1;
        assert.ok(moved, `drag did not move element: before=${JSON.stringify(rectBeforeDrag)} after=${JSON.stringify(rectAfterDrag)}`);

        // Undo drag — element must return to pre-drag position
        await page.keyboard.press('Control+z');
        await page.waitForTimeout(220);

        const rectAfterUndoDrag = (await collectElementVisibility(page, { id: selectedId, mode: 'design' })).rect;
        assertBoundingBoxDriftWithin(rectAfterUndoDrag, rectBeforeDrag, 'undo drag rect restore', 2);
        const stateAfterUndoDrag = await collectUserParityState(page, { textIncludes: 'VALOR TOTAL' });
        assertDesignParity(stateAfterUndoDrag, 'after undo drag design parity');
        t.diagnostic(`undo-drag: rect left=${rectAfterUndoDrag?.left?.toFixed(1)} top=${rectAfterUndoDrag?.top?.toFixed(1)}`);

        // Redo drag — rect must return to post-drag position
        await page.keyboard.press('Control+y');
        await page.waitForTimeout(220);

        const rectAfterRedoDrag = (await collectElementVisibility(page, { id: selectedId, mode: 'design' })).rect;
        assertBoundingBoxDriftWithin(rectAfterRedoDrag, rectAfterDrag, 'redo drag rect match', 2);
        assertDesignParity(await collectUserParityState(page, { textIncludes: 'VALOR TOTAL' }), 'after redo drag design parity');
        t.diagnostic(`redo-drag: rect left=${rectAfterRedoDrag?.left?.toFixed(1)} top=${rectAfterRedoDrag?.top?.toFixed(1)}`);

        // Jitter check after undo+redo cycle
        const overlayFrames = await captureTemporalFrames(page, '.cr-element:not(.pv-el)', {
          phasePrefix: 'final-state',
          microtasks: 1,
          timeouts: [0, 4],
          frames: 4,
        });
        const jitter = computeMicroJitterScore(overlayFrames, { driftThresholdPx: 1 });
        t.diagnostic(`final jitterScore=${jitter.jitterScore} frameDropDetected=${jitter.frameDropDetected}`);
        assert.equal(jitter.frameDropDetected, false, `paste drag undo redo: frame drop ${JSON.stringify(jitter.diagnostics)}`);

        // Composition check scoped to VALOR TOTAL elements (not all 46+ template elements)
        const finalState = await collectUserParityState(page, { textIncludes: 'VALOR TOTAL' });
        const finalEntries = await Promise.all(
          finalState.modelIds.map((id) => collectElementVisibility(page, { id, mode: 'design' })),
        );
        assertNoCriticalOcclusion(finalEntries, 'paste drag undo redo final occlusion');
        assertCloneSeparation(finalEntries, 'paste drag undo redo final separation');
        const sep = cloneSeparationQuality(finalEntries);
        t.diagnostic(`final: minGapPx=${sep.minGapPx} maxOverlapRatio=${sep.maxOverlapRatio} collapseRisk=${sep.collapseRisk}`);
        for (const entry of finalEntries) {
          const occ = measureOcclusionDetail(entry);
          t.diagnostic(`id=${entry.id}: occludedRatio=${Math.round(occ.occludedRatio * 100)}% level=${occ.occlusionLevel}`);
        }

        await assertNoConsoleErrors(consoleErrors, 'USER-PARITY paste drag undo redo');
      } finally {
        await browser.close();
      }
    });

    // -----------------------------------------------------------------------
    // Subtest B: paste×2 → preview → design → undo → redo
    // Key assertion: design parity intact at every checkpoint including post-mode-switch.
    // -----------------------------------------------------------------------
    await t.test('paste preview round-trip undo redo parity', async (t) => {
      const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl);
      try {
        await reloadRuntime(page, server.baseUrl);
        await page.locator('.cr-element:not(.pv-el)').filter({ hasText: 'VALOR TOTAL' }).first().click();
        await page.waitForTimeout(120);
        const before = await collectUserParityState(page, { textIncludes: 'VALOR TOTAL' });

        await page.keyboard.press('Control+c');
        await page.waitForTimeout(80);
        await page.keyboard.press('Control+v');
        await page.waitForTimeout(200);
        await page.keyboard.press('Control+v');
        await page.waitForTimeout(200);

        const afterPaste = await collectUserParityState(page, { textIncludes: 'VALOR TOTAL' });
        assert.equal(afterPaste.modelIds.length, before.modelIds.length + 2, 'paste×2 must add 2 ids');
        assertDesignParity(afterPaste, 'after paste×2 design parity');

        // Mode switch: design → preview
        await enterPreview(page);
        await page.waitForTimeout(220);
        const inPreview = await collectUserParityState(page, { textIncludes: 'VALOR TOTAL' });
        assertPreviewParity(inPreview, 'after mode→preview parity');
        t.diagnostic(`in-preview: modelIds=${inPreview.modelIds.length} previewIds=${inPreview.previewIds.length}`);

        // Mode switch: preview → design
        await exitPreview(page);
        await page.waitForTimeout(220);
        const backInDesign = await collectUserParityState(page, { textIncludes: 'VALOR TOTAL' });
        assertDesignParity(backInDesign, 'after mode→design parity');
        assert.equal(backInDesign.modelIds.length, afterPaste.modelIds.length, 'mode switch must not alter model count');

        // Overlay must still be renderable after mode round-trip
        const overlayInfo = await page.evaluate(() => ({
          boxCount: document.querySelectorAll('#handles-layer .sel-box').length,
          handleCount: document.querySelectorAll('#handles-layer .sel-handle').length,
        }));
        t.diagnostic(`after mode round-trip: boxCount=${overlayInfo.boxCount} handleCount=${overlayInfo.handleCount}`);

        // Undo last paste
        await page.keyboard.press('Control+z');
        await page.waitForTimeout(220);
        const afterUndo = await collectUserParityState(page, { textIncludes: 'VALOR TOTAL' });
        assert.equal(afterUndo.modelIds.length, before.modelIds.length + 1, 'undo must remove last paste');
        assertDesignParity(afterUndo, 'after undo design parity');

        // Redo paste
        await page.keyboard.press('Control+y');
        await page.waitForTimeout(220);
        const afterRedo = await collectUserParityState(page, { textIncludes: 'VALOR TOTAL' });
        assert.equal(afterRedo.modelIds.length, afterPaste.modelIds.length, 'redo must restore paste');
        assertDesignParity(afterRedo, 'after redo design parity');

        // Final composition check
        const finalEntries = await Promise.all(
          afterRedo.modelIds.map((id) => collectElementVisibility(page, { id, mode: 'design' })),
        );
        assertNoCriticalOcclusion(finalEntries, 'paste preview undo redo final occlusion');
        assertCloneSeparation(finalEntries, 'paste preview undo redo final separation');
        const sep = cloneSeparationQuality(finalEntries);
        t.diagnostic(`final: minGapPx=${sep.minGapPx} maxOverlapRatio=${sep.maxOverlapRatio} collapseRisk=${sep.collapseRisk}`);
        for (const entry of finalEntries) {
          const occ = measureOcclusionDetail(entry);
          t.diagnostic(`id=${entry.id}: occludedRatio=${Math.round(occ.occludedRatio * 100)}% level=${occ.occlusionLevel}`);
        }

        await assertNoConsoleErrors(consoleErrors, 'USER-PARITY paste preview undo redo');
      } finally {
        await browser.close();
      }
    });

    // -----------------------------------------------------------------------
    // Subtest C: multiselect → paste → undo → redo
    // Key assertion: both clones are removed by undo and restored by redo;
    // overlay is stable (no frame drop) through the undo sequence.
    // -----------------------------------------------------------------------
    await t.test('multiselect paste undo redo overlay stable', async (t) => {
      const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl);
      try {
        await reloadRuntime(page, server.baseUrl);
        await selectMulti(page, 0, 1);

        const beforeSelect = await collectUserParityState(page);
        assert.equal(beforeSelect.selection.length, 2, 'pre: must have 2 selected elements');
        assert.equal(beforeSelect.overlay.boxCount, 1, 'pre: sel-box must be present for multiselect');

        await page.keyboard.press('Control+c');
        await page.waitForTimeout(80);
        await page.keyboard.press('Control+v');
        await page.waitForTimeout(220);

        const afterPaste = await collectUserParityState(page);
        assert.equal(
          afterPaste.modelIds.length,
          beforeSelect.modelIds.length + 2,
          'paste of 2 selected elements must add 2 ids',
        );
        assertDesignParity(afterPaste, 'multiselect paste design parity');

        // Capture overlay temporal frames during the undo operation
        const undoFrames = await captureTemporalFrames(page, '#handles-layer .sel-box', {
          phasePrefix: 'multiselect-undo',
          microtasks: 1,
          timeouts: [0, 4, 8],
          frames: 4,
        });

        await page.keyboard.press('Control+z');
        await page.waitForTimeout(220);

        const afterUndo = await collectUserParityState(page);
        assert.equal(
          afterUndo.modelIds.length,
          beforeSelect.modelIds.length,
          'undo must remove both pasted clones',
        );
        assertDesignParity(afterUndo, 'multiselect undo design parity');

        const jitter = computeMicroJitterScore(undoFrames, { driftThresholdPx: 1 });
        t.diagnostic(`multiselect undo jitterScore=${jitter.jitterScore} frameDropDetected=${jitter.frameDropDetected}`);
        assert.equal(jitter.frameDropDetected, false, `multiselect undo: frame drop ${JSON.stringify(jitter.diagnostics)}`);

        await page.keyboard.press('Control+y');
        await page.waitForTimeout(220);

        const afterRedo = await collectUserParityState(page);
        assert.equal(
          afterRedo.modelIds.length,
          beforeSelect.modelIds.length + 2,
          'redo must restore both clones',
        );
        assertDesignParity(afterRedo, 'multiselect redo design parity');

        // Composition check scoped to the 4 relevant elements only:
        // the 2 originally selected + the 2 pasted clones.
        // Checking all 48 template elements would find natural overlaps in the template layout.
        const newCloneIds = afterRedo.modelIds.filter((id) => !beforeSelect.modelIds.includes(id));
        const relevantIds = [...new Set([...beforeSelect.selection, ...newCloneIds])];
        const finalEntries = await Promise.all(
          relevantIds.map((id) => collectElementVisibility(page, { id, mode: 'design' })),
        );
        assertNoCriticalOcclusion(finalEntries, 'multiselect paste undo redo final occlusion');
        assertCloneSeparation(finalEntries, 'multiselect paste undo redo final separation');
        const sep = cloneSeparationQuality(finalEntries);
        t.diagnostic(`final (relevant ${relevantIds.length} elements): minGapPx=${sep.minGapPx} maxOverlapRatio=${sep.maxOverlapRatio} collapseRisk=${sep.collapseRisk}`);

        await assertNoConsoleErrors(consoleErrors, 'USER-PARITY multiselect paste undo redo');
      } finally {
        await browser.close();
      }
    });
  } finally {
    await server.stop();
  }
});
