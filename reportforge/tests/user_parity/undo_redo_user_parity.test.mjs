import test from 'node:test';
import assert from 'node:assert/strict';
import {
  startRuntimeServer,
  launchRuntimePage,
  getBrowserAvailability,
  reloadRuntime,
  enterPreview,
  assertNoConsoleErrors,
} from '../runtime_harness.mjs';
import {
  collectUserParityState,
  collectElementVisibility,
  collectHitMap,
  assertVisibleParity,
  assertDesignParity,
  assertPreviewParity,
  ratioIdParity,
  visibilitySignal,
  hitTestingSignal,
  clippingSignal,
  overlapSignal,
  geometrySignalFromRectChecks,
  temporalStabilitySignal,
  interactionUsabilitySignal,
  computeVisualConfidenceScore,
  assertVisualConfidence,
  captureAsyncPhases,
  captureDenseAsyncPhases,
  captureTemporalFrames,
  computeMicroJitterScore,
  legibilitySignal,
  subtleOcclusionSignal,
  compositorDivergenceSignal,
  crossBrowserStabilitySignal,
  measureOcclusionDetail,
  cloneSeparationQuality,
  assertNoCriticalOcclusion,
  assertCloneSeparation,
} from './helpers.mjs';

test('USER-PARITY undo redo preserves visible parity after user-visible clipboard changes', { timeout: 180000 }, async (t) => {
  const server = await startRuntimeServer();
  const availability = await getBrowserAvailability();
  const browserNames = Object.entries(availability).filter(([, info]) => info.available).map(([browserName]) => browserName);
  const summaries = [];

  try {
    for (const browserName of browserNames) {
      await t.test(`browser:${browserName}`, async () => {
        const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl, { browserName });
        try {
          await reloadRuntime(page, server.baseUrl);
          await page.locator('.cr-element:not(.pv-el)').filter({ hasText: 'VALOR TOTAL' }).first().click();
          await page.waitForTimeout(120);

    const before = await collectUserParityState(page, { textIncludes: 'VALOR TOTAL' });
    await page.keyboard.press('Control+c');
    await page.waitForTimeout(80);
    await page.keyboard.press('Control+v');
    await page.waitForTimeout(180);
    await page.keyboard.press('Control+v');
    await page.waitForTimeout(200);

    const afterPaste = await collectUserParityState(page, { textIncludes: 'VALOR TOTAL' });
    assert.equal(afterPaste.modelIds.length, before.modelIds.length + 2, 'paste must add 2 visible ids');
    assertSameUndoableGrowth(before, afterPaste);

    await page.keyboard.press('Control+z');
    await page.waitForTimeout(220);
    const afterUndo = await collectUserParityState(page, { textIncludes: 'VALOR TOTAL' });
    assertDesignParity(afterUndo, 'undo design parity');
    assert.equal(afterUndo.modelIds.length, before.modelIds.length + 1, 'undo must remove the last pasted clone');
    const undoPhases = await captureDenseAsyncPhases(page, () => collectUserParityState(page, { textIncludes: 'VALOR TOTAL' }), {
      phasePrefix: 'undo',
      microtasks: 2,
      timeouts: [0, 4, 8, 16],
      rafs: 6,
      fuzzMs: 4,
    });
    const undoFrames = await captureTemporalFrames(page, '.cr-element:not(.pv-el)[data-id]', {
      phasePrefix: 'undo-frames',
      microtasks: 2,
      timeouts: [0, 4, 8, 16],
      frames: 6,
    });
    const undoJitter = computeMicroJitterScore(undoFrames, { driftThresholdPx: 1 });
    t.diagnostic(`browser=${browserName} flow=undo jitterScore=${undoJitter.jitterScore} frameDropDetected=${undoJitter.frameDropDetected}`);
    assert.equal(undoJitter.frameDropDetected, false, `undo: frame drop detected ${JSON.stringify(undoJitter)}`);
    assert.ok(undoJitter.jitterScore < 0.02, `undo: jitterScore ${undoJitter.jitterScore} >= 0.02 diagnostics=${JSON.stringify(undoJitter.diagnostics)}`);

    await page.keyboard.press('Control+y');
    await page.waitForTimeout(220);
    const afterRedo = await collectUserParityState(page, { textIncludes: 'VALOR TOTAL' });
    assertDesignParity(afterRedo, 'redo design parity');
    assert.equal(afterRedo.modelIds.length, afterPaste.modelIds.length, 'redo must restore pasted clone');
    const redoPhases = await captureDenseAsyncPhases(page, () => collectUserParityState(page, { textIncludes: 'VALOR TOTAL' }), {
      phasePrefix: 'redo',
      microtasks: 2,
      timeouts: [0, 4, 8, 16],
      rafs: 6,
      fuzzMs: 4,
    });
    const redoFrames = await captureTemporalFrames(page, '.cr-element:not(.pv-el)[data-id]', {
      phasePrefix: 'redo-frames',
      microtasks: 2,
      timeouts: [0, 4, 8, 16],
      frames: 6,
    });
    const redoJitter = computeMicroJitterScore(redoFrames, { driftThresholdPx: 1 });
    t.diagnostic(`browser=${browserName} flow=redo jitterScore=${redoJitter.jitterScore} frameDropDetected=${redoJitter.frameDropDetected}`);
    assert.equal(redoJitter.frameDropDetected, false, `redo: frame drop detected ${JSON.stringify(redoJitter)}`);
    assert.ok(redoJitter.jitterScore < 0.02, `redo: jitterScore ${redoJitter.jitterScore} >= 0.02 diagnostics=${JSON.stringify(redoJitter.diagnostics)}`);

    const designEntries = await Promise.all(
      afterRedo.modelIds.map((id) => collectElementVisibility(page, { id, mode: 'design' })),
    );
    const designHitMaps = await Promise.all(
      afterRedo.modelIds.map((id) => collectHitMap(page, { id, mode: 'design', grid: 3 })),
    );

    assertNoCriticalOcclusion(designEntries, `undo/redo occlusion browser=${browserName}`);
    assertCloneSeparation(designEntries, `undo/redo separation browser=${browserName}`);
    const sepQuality = cloneSeparationQuality(designEntries);
    t.diagnostic(`browser=${browserName} flow=undo-redo minGapPx=${sepQuality.minGapPx} maxOverlapRatio=${sepQuality.maxOverlapRatio} collapseRisk=${sepQuality.collapseRisk}`);
    for (const entry of designEntries) {
      const occ = measureOcclusionDetail(entry);
      t.diagnostic(`browser=${browserName} id=${entry.id}: occludedRatio=${Math.round(occ.occludedRatio * 100)}% level=${occ.occlusionLevel} topOccluding=${JSON.stringify(occ.topOccludingNodes)}`);
    }

    await enterPreview(page);
    await page.waitForTimeout(220);
    const previewState = await collectUserParityState(page, { textIncludes: 'VALOR TOTAL' });
    assertPreviewParity(previewState, 'redo preview parity');
    const temporalTimeline = [...undoPhases, ...redoPhases];
    const confidence = computeVisualConfidenceScore({
      modelParity: minSignal(
        ratioIdParity(afterRedo.designIds, afterRedo.modelIds, 'undo/redo design-model parity'),
        ratioIdParity(previewState.previewIds, previewState.modelIds, 'undo/redo preview-model parity'),
      ),
      designPreviewParity: ratioIdParity(afterRedo.designIds, previewState.previewIds, 'undo/redo design-preview parity'),
      geometry: geometrySignalFromRectChecks(
        designEntries.map((entry) => ({
          id: `${entry.mode}:${entry.id}`,
          ok: !!(entry.rect && entry.rect.width > 0 && entry.rect.height > 0),
          rect: entry.rect || null,
        })),
        'undo/redo geometry',
      ),
      visibility: visibilitySignal(designEntries, 'undo/redo visibility'),
      hitTesting: hitTestingSignal(designEntries, 'undo/redo design hit-testing'),
      overlapCollision: overlapSignal(designEntries, 'undo/redo design overlap', { maxOverlapRatio: 0.92 }),
      clipping: clippingSignal(designEntries, 'undo/redo clipping', { minVisibleRatio: 0.35 }),
      stacking: hitTestingSignal(designEntries, 'undo/redo design stacking proxy'),
      temporalStability: temporalStabilitySignal(
        temporalTimeline,
        (state) => state.modelIds.length === state.designIds.length,
        'undo/redo temporal stability',
      ),
      interactionUsability: interactionUsabilitySignal(designHitMaps, 'undo/redo usability', { minCoverage: 0.3 }),
      legibility: legibilitySignal(designEntries, 'undo/redo legibility', { minContrast: 3 }),
      subtleOcclusion: subtleOcclusionSignal(designEntries, 'undo/redo subtle occlusion', { minVisibleRatio: 0.8, minSelfHitRatio: 0.55 }),
      compositorDivergence: neutralBrowserSignal(browserName, availability, 'undo/redo compositor divergence'),
      crossBrowserStability: neutralBrowserSignal(browserName, availability, 'undo/redo cross-browser stability'),
    });
    assertVisualConfidence(confidence, { min: 90 });
    summaries.push({ browserName, ids: afterRedo.modelIds, score: confidence.score });

    await assertNoConsoleErrors(consoleErrors, `USER-PARITY undo redo ${browserName}`);
        } finally {
          await browser.close();
        }
      });
    }
  } finally {
    await server.stop();
  }

  const matrix = crossBrowserStabilitySignal(summaries, availability, 'undo/redo matrix');
  const divergence = compositorDivergenceSignal(summaries, 'undo/redo compositor');
  assertVisualConfidence(computeVisualConfidenceScore({
    modelParity: stableSignal('covered in per-browser runs'),
    designPreviewParity: stableSignal('covered in per-browser runs'),
    geometry: stableSignal('covered in per-browser runs'),
    visibility: stableSignal('covered in per-browser runs'),
    hitTesting: stableSignal('covered in per-browser runs'),
    overlapCollision: stableSignal('covered in per-browser runs'),
    clipping: stableSignal('covered in per-browser runs'),
    stacking: stableSignal('covered in per-browser runs'),
    temporalStability: stableSignal('covered in per-browser runs'),
    interactionUsability: stableSignal('covered in per-browser runs'),
    legibility: stableSignal('covered in per-browser runs'),
    subtleOcclusion: stableSignal('covered in per-browser runs'),
    compositorDivergence: divergence,
    crossBrowserStability: matrix,
  }), { min: 90 });
});

function assertSameUndoableGrowth(before, afterPaste) {
  assert.ok(afterPaste.modelIds.length > before.modelIds.length, 'paste must grow visible id set');
}

function minSignal(...signals) {
  const entries = signals.filter(Boolean);
  const values = entries.map((entry) => (typeof entry?.value === 'number' ? entry.value : 0));
  const value = values.length ? Math.min(...values) : 1;
  const degraded = entries.filter((entry) => (typeof entry?.value === 'number' ? entry.value : 0) < 1);
  return {
    value,
    diagnostic: degraded.length ? degraded.map((entry) => entry.diagnostic).filter(Boolean).join(' | ') : null,
    evidence: degraded.length ? degraded.map((entry) => entry.evidence || null) : null,
  };
}

function stableSignal(reason) {
  return { value: 1, diagnostic: null, evidence: { reason } };
}

function neutralBrowserSignal(browserName, availability, label) {
  const missing = Object.entries(availability).filter(([, info]) => !info.available).map(([name, info]) => ({ name, reason: info.reason }));
  return {
    value: 1,
    diagnostic: missing.length ? `${label}: missing browsers=${JSON.stringify(missing)}` : null,
    evidence: { browserName, missing },
  };
}
