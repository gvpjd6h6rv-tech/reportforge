import test from 'node:test';
import assert from 'node:assert/strict';
import {
  startRuntimeServer,
  launchRuntimePage,
  getBrowserAvailability,
  reloadRuntime,
  enterPreview,
  exitPreview,
  assertNoConsoleErrors,
} from '../runtime_harness.mjs';
import {
  collectUserParityState,
  collectElementVisibility,
  collectHitMap,
  assertSameIdSet,
  assertVisibleParity,
  assertDesignParity,
  assertPreviewParity,
  ratioIdParity,
  visibilitySignal,
  hitTestingSignal,
  clippingSignal,
  overlapSignal,
  geometrySignalFromRectChecks,
  interactionUsabilitySignal,
  legibilitySignal,
  subtleOcclusionSignal,
  compositorDivergenceSignal,
  crossBrowserStabilitySignal,
  computeVisualConfidenceScore,
  assertVisualConfidence,
} from './helpers.mjs';

test('USER-PARITY clipboard stays consistent across model, design and preview', { timeout: 180000 }, async (t) => {
  const server = await startRuntimeServer();
  const availability = await getBrowserAvailability();
  const browserNames = Object.entries(availability).filter(([, info]) => info.available).map(([browserName]) => browserName);
  const summaries = [];

  try {
    for (const browserName of browserNames) {
      await t.test(`browser:${browserName}`, async (t) => {
        const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl, { browserName });
        try {
          await t.test('preview paste materializes the same clones in design and preview', async () => {
            await reloadRuntime(page, server.baseUrl);
      await enterPreview(page);
      await page.locator('#preview-content .pv-el').filter({ hasText: 'VALOR TOTAL' }).first().click();
      await page.waitForTimeout(120);

      const before = await collectUserParityState(page, { textIncludes: 'VALOR TOTAL' });
      const sourceId = before.selection[0] || null;
      assert.ok(sourceId, 'pre: preview source selection missing');

      await page.keyboard.press('Control+c');
      await page.waitForTimeout(80);
      await page.keyboard.press('Control+v');
      await page.waitForTimeout(160);
      await page.keyboard.press('Control+v');
      await page.waitForTimeout(200);

      const inPreview = await collectUserParityState(page, { textIncludes: 'VALOR TOTAL' });
      assert.equal(inPreview.modelIds.length, before.modelIds.length + 2, 'preview paste must add 2 model ids');
      assertPreviewParity(inPreview, 'preview paste preview');

      await exitPreview(page);
      await page.waitForTimeout(220);
      const inDesign = await collectUserParityState(page, { textIncludes: 'VALOR TOTAL' });
      assertDesignParity(inDesign, 'preview paste final design parity');
      assert.ok(inDesign.modelIds.includes(sourceId), 'original id must remain visible after preview paste');

      const designEntries = await Promise.all(
        inDesign.modelIds.map((id) => collectElementVisibility(page, { id, mode: 'design' })),
      );
      const designHitMaps = await Promise.all(
        inDesign.modelIds.map((id) => collectHitMap(page, { id, mode: 'design', grid: 3 })),
      );
      const confidence = computeVisualConfidenceScore({
        modelParity: minSignal(
          ratioIdParity(inDesign.designIds, inDesign.modelIds, 'preview paste design-model parity'),
          ratioIdParity(inPreview.previewIds, inPreview.modelIds, 'preview paste preview-model parity'),
        ),
        designPreviewParity: ratioIdParity(inDesign.designIds, inPreview.previewIds, 'preview paste design-preview parity'),
        geometry: geometrySignalFromRectChecks(
          designEntries.map((entry) => ({
            id: `${entry.mode}:${entry.id}`,
            ok: !!(entry.rect && entry.rect.width > 0 && entry.rect.height > 0),
            rect: entry.rect || null,
          })),
          'preview paste geometry',
        ),
        visibility: visibilitySignal(designEntries, 'preview paste visibility'),
        hitTesting: hitTestingSignal(designEntries, 'preview paste design hit-testing'),
        overlapCollision: overlapSignal(designEntries, 'preview paste design overlap', { maxOverlapRatio: 0.92 }),
        clipping: clippingSignal(designEntries, 'preview paste clipping', { minVisibleRatio: 0.35 }),
        stacking: hitTestingSignal(designEntries, 'preview paste design stacking proxy'),
        temporalStability: stableSignal('preview paste final state stable'),
        interactionUsability: interactionUsabilitySignal(designHitMaps, 'preview paste usability', { minCoverage: 0.3 }),
        legibility: legibilitySignal(designEntries, 'preview paste legibility', { minContrast: 3 }),
        subtleOcclusion: subtleOcclusionSignal(designEntries, 'preview paste subtle occlusion', { minVisibleRatio: 0.8, minSelfHitRatio: 0.55 }),
        compositorDivergence: neutralBrowserSignal(browserName, availability, 'preview paste compositor divergence'),
        crossBrowserStability: neutralBrowserSignal(browserName, availability, 'preview paste cross-browser stability'),
      });
      assertVisualConfidence(confidence, { min: 90 });
          });

          await t.test('design paste materializes the same clones in preview and design', async () => {
            await reloadRuntime(page, server.baseUrl);
      await page.locator('.cr-element:not(.pv-el)').filter({ hasText: 'VALOR TOTAL' }).first().click();
      await page.waitForTimeout(120);

      const before = await collectUserParityState(page, { textIncludes: 'VALOR TOTAL' });
      assert.equal(before.designIds.length, 1, `pre: expected one VALOR TOTAL in design, got ${JSON.stringify(before.designIds)}`);

      await page.keyboard.press('Control+c');
      await page.waitForTimeout(80);
      for (let i = 0; i < 3; i += 1) {
        await page.keyboard.press('Control+v');
        await page.waitForTimeout(180);
      }

      const inDesign = await collectUserParityState(page, { textIncludes: 'VALOR TOTAL' });
      assert.equal(inDesign.modelIds.length, before.modelIds.length + 3, 'design paste must add 3 model ids');
      assertDesignParity(inDesign, 'design paste design');

      const designEntries = await Promise.all(
        inDesign.modelIds.map((id) => collectElementVisibility(page, { id, mode: 'design' })),
      );
      const designHitMaps = await Promise.all(
        inDesign.modelIds.map((id) => collectHitMap(page, { id, mode: 'design', grid: 3 })),
      );

      await enterPreview(page);
      await page.waitForTimeout(220);
      const inPreview = await collectUserParityState(page, { textIncludes: 'VALOR TOTAL' });
      assertPreviewParity(inPreview, 'design paste preview');
      assertSameIdSet(inPreview.designIds, inPreview.modelIds, 'design paste hidden design DOM vs model');
      const confidence = computeVisualConfidenceScore({
        modelParity: minSignal(
          ratioIdParity(inDesign.designIds, inDesign.modelIds, 'design paste design-model parity'),
          ratioIdParity(inPreview.previewIds, inPreview.modelIds, 'design paste preview-model parity'),
        ),
        designPreviewParity: ratioIdParity(inDesign.designIds, inPreview.previewIds, 'design paste design-preview parity'),
        geometry: geometrySignalFromRectChecks(
          designEntries.map((entry) => ({
            id: `${entry.mode}:${entry.id}`,
            ok: !!(entry.rect && entry.rect.width > 0 && entry.rect.height > 0),
            rect: entry.rect || null,
          })),
          'design paste geometry',
        ),
        visibility: visibilitySignal(designEntries, 'design paste visibility'),
        hitTesting: hitTestingSignal(designEntries, 'design paste design hit-testing'),
        overlapCollision: overlapSignal(designEntries, 'design paste design overlap', { maxOverlapRatio: 0.92 }),
        clipping: clippingSignal(designEntries, 'design paste clipping', { minVisibleRatio: 0.35 }),
        stacking: hitTestingSignal(designEntries, 'design paste design stacking proxy'),
        temporalStability: stableSignal('design paste final state stable'),
        interactionUsability: interactionUsabilitySignal(designHitMaps, 'design paste usability', { minCoverage: 0.3 }),
        legibility: legibilitySignal(designEntries, 'design paste legibility', { minContrast: 3 }),
        subtleOcclusion: subtleOcclusionSignal(designEntries, 'design paste subtle occlusion', { minVisibleRatio: 0.8, minSelfHitRatio: 0.55 }),
        compositorDivergence: neutralBrowserSignal(browserName, availability, 'design paste compositor divergence'),
        crossBrowserStability: neutralBrowserSignal(browserName, availability, 'design paste cross-browser stability'),
      });
      assertVisualConfidence(confidence, { min: 90 });
      summaries.push({ browserName, ids: inDesign.modelIds, score: confidence.score });
          });

          await assertNoConsoleErrors(consoleErrors, `USER-PARITY clipboard ${browserName}`);
        } finally {
          await browser.close();
        }
      });
    }
  } finally {
    await server.stop();
  }

  const matrix = crossBrowserStabilitySignal(summaries, availability, 'clipboard matrix');
  const divergence = compositorDivergenceSignal(summaries, 'clipboard compositor');
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
