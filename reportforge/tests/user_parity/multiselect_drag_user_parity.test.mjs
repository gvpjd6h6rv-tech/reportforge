import test from 'node:test';
import assert from 'node:assert/strict';
import {
  startRuntimeServer,
  launchRuntimePage,
  getBrowserAvailability,
  reloadRuntime,
  selectMulti,
  setZoom,
  enterPreview,
  assertNoConsoleErrors,
} from '../runtime_harness.mjs';
import {
  collectUserParityState,
  collectElementVisibility,
  collectHitMap,
  captureAsyncPhases,
  dragSelectedWithSnapshots,
  visibilitySignal,
  hitTestingSignal,
  clippingSignal,
  geometrySignalFromRectChecks,
  temporalStabilitySignal,
  interactionUsabilitySignal,
  captureDenseAsyncPhases,
  captureTemporalFrames,
  computeMicroJitterScore,
  legibilitySignal,
  subtleOcclusionSignal,
  compositorDivergenceSignal,
  crossBrowserStabilitySignal,
  computeVisualConfidenceScore,
  assertVisualConfidence,
  measureOcclusionDetail,
  cloneSeparationQuality,
  assertNoCriticalOcclusion,
  assertCloneSeparation,
} from './helpers.mjs';

test('USER-PARITY multiselect drag keeps visible overlay and selection stable', { timeout: 180000 }, async (t) => {
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
          await setZoom(page, 1.5);
          await selectMulti(page, 0, 1);

          const before = await collectUserParityState(page);
    assert.equal(before.selection.length, 2, `pre: expected 2 selected ids, got ${JSON.stringify(before.selection)}`);
    assert.equal(before.overlay.boxCount, 1, `pre: expected visible multiselect overlay, got ${before.overlay.boxCount}`);

    const dragSnapshots = await dragSelectedWithSnapshots(page, {
      dx: 24,
      dy: 18,
      steps: 6,
      collect: () => collectUserParityState(page),
    });

    assert.ok(dragSnapshots.length > 0, 'drag snapshots missing');
    dragSnapshots.forEach(({ step, state }) => {
      assert.equal(state.selection.length, 2, `drag step ${step}: selection must remain 2, got ${JSON.stringify(state.selection)}`);
      assert.equal(state.overlay.boxCount, 1, `drag step ${step}: multiselect overlay must remain visible, got ${state.overlay.boxCount}`);
      assert.ok(state.overlay.boxRect && state.overlay.boxRect.width > 0 && state.overlay.boxRect.height > 0,
        `drag step ${step}: overlay box must stay non-degenerate, got ${JSON.stringify(state.overlay.boxRect)}`);
    });

    const afterPhases = await captureDenseAsyncPhases(page, () => collectUserParityState(page), {
      phasePrefix: 'after-drag',
      microtasks: 2,
      timeouts: [0, 4, 8, 16],
      rafs: 6,
      fuzzMs: 4,
    });
    afterPhases.forEach(({ phase, state }) => {
      assert.equal(state.selection.length, 2, `${phase}: selection must remain 2`);
      assert.equal(state.overlay.boxCount, 1, `${phase}: overlay must remain visible`);
    });

    const designEntries = await Promise.all(
      before.selection.map((id) => collectElementVisibility(page, { id, mode: 'design' })),
    );
    const designHitMaps = await Promise.all(
      before.selection.map((id) => collectHitMap(page, { id, mode: 'design', grid: 3 })),
    );

    assertNoCriticalOcclusion(designEntries, `multiselect drag occlusion browser=${browserName}`);
    assertCloneSeparation(designEntries, `multiselect drag separation browser=${browserName}`, { minGapPx: 4 });
    const sepQuality = cloneSeparationQuality(designEntries);
    t.diagnostic(`browser=${browserName} flow=multiselect-drag minGapPx=${sepQuality.minGapPx} maxOverlapRatio=${sepQuality.maxOverlapRatio} collapseRisk=${sepQuality.collapseRisk}`);
    for (const entry of designEntries) {
      const occ = measureOcclusionDetail(entry);
      t.diagnostic(`browser=${browserName} id=${entry.id}: occludedRatio=${Math.round(occ.occludedRatio * 100)}% level=${occ.occlusionLevel} topOccluding=${JSON.stringify(occ.topOccludingNodes)}`);
    }

    const overlayFrames = await captureTemporalFrames(page, '#handles-layer .sel-box', {
      phasePrefix: 'overlay',
      microtasks: 2,
      timeouts: [0, 4, 8, 16],
      frames: 6,
    });
    const microJitter = computeMicroJitterScore(overlayFrames, { driftThresholdPx: 1 });
    t.diagnostic(`browser=${browserName} flow=multiselect-drag jitterScore=${microJitter.jitterScore} frameDropDetected=${microJitter.frameDropDetected}`);
    assert.equal(
      microJitter.frameDropDetected,
      false,
      `multiselect drag: overlay frame drop detected ${JSON.stringify(microJitter)}`,
    );
    assert.ok(
      microJitter.jitterScore < 0.02,
      `multiselect drag: jitterScore ${microJitter.jitterScore} >= 0.02 diagnostics=${JSON.stringify(microJitter.diagnostics)}`,
    );

          await enterPreview(page);
          await page.waitForTimeout(220);
          const previewState = await collectUserParityState(page);
    assert.equal(previewState.selection.length, 2, `preview after drag: selection must remain 2, got ${JSON.stringify(previewState.selection)}`);
    const fullTimeline = [
      ...dragSnapshots.map(({ step, state }) => ({ phase: `drag:${step}`, state })),
      ...afterPhases,
    ];
          const confidence = computeVisualConfidenceScore({
      modelParity: { value: previewState.selection.length === 2 ? 1 : 0, diagnostic: previewState.selection.length === 2 ? null : `preview selection=${JSON.stringify(previewState.selection)}` },
      designPreviewParity: { value: before.selection.length === previewState.selection.length ? 1 : 0, diagnostic: before.selection.length === previewState.selection.length ? null : `design selection=${before.selection.length} preview selection=${previewState.selection.length}` },
      geometry: geometrySignalFromRectChecks(
        fullTimeline.map(({ phase, state }) => ({
          id: phase,
          ok: !!(state.overlay.boxRect && state.overlay.boxRect.width > 0 && state.overlay.boxRect.height > 0),
          rect: state.overlay.boxRect || null,
        })),
        'multiselect drag geometry',
      ),
      visibility: visibilitySignal(designEntries, 'multiselect drag visibility'),
      hitTesting: hitTestingSignal(designEntries, 'multiselect drag hit-testing'),
      overlapCollision: stableSignal('not a primary overlap-risk flow'),
      clipping: clippingSignal(designEntries, 'multiselect drag clipping', { minVisibleRatio: 0.35 }),
      stacking: hitTestingSignal(designEntries, 'multiselect drag stacking proxy'),
      temporalStability: temporalStabilitySignal(
        fullTimeline,
        (state) => state.selection.length === 2
          && state.overlay.boxCount === 1
          && !!(state.overlay.boxRect && state.overlay.boxRect.width > 0 && state.overlay.boxRect.height > 0),
        'multiselect drag temporal stability',
      ),
      interactionUsability: interactionUsabilitySignal(designHitMaps, 'multiselect drag usability', { minCoverage: 0.3 }),
            legibility: legibilitySignal(designEntries, 'multiselect drag legibility', { minContrast: 2.5 }),
            subtleOcclusion: subtleOcclusionSignal(designEntries, 'multiselect drag subtle occlusion', { minVisibleRatio: 0.8, minSelfHitRatio: 0.55 }),
            compositorDivergence: neutralBrowserSignal(browserName, availability, 'multiselect compositor divergence'),
            crossBrowserStability: neutralBrowserSignal(browserName, availability, 'multiselect cross-browser stability'),
          });
          assertVisualConfidence(confidence, { min: 90 });
          summaries.push({ browserName, ids: before.selection, score: confidence.score });

          await assertNoConsoleErrors(consoleErrors, `USER-PARITY multiselect drag ${browserName}`);
        } finally {
          await browser.close();
        }
      });
    }
  } finally {
    await server.stop();
  }

  const matrix = crossBrowserStabilitySignal(summaries, availability, 'multiselect matrix');
  const divergence = compositorDivergenceSignal(summaries, 'multiselect compositor');
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
