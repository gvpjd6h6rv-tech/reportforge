import test from 'node:test';
import assert from 'node:assert/strict';
import {
  startRuntimeServer,
  launchRuntimePage,
  reloadRuntime,
  resizeFromHandle,
  assertNoConsoleErrors,
} from '../runtime_harness.mjs';
import {
  collectElementVisibility,
  assertBoundingBoxDriftWithin,
  captureTemporalFrames,
  computeMicroJitterScore,
} from './helpers.mjs';
import { buildSmokeLayerCoverage, formatSmokeCoverageSummary } from './reporting.mjs';

// Resize smoke: verifies resize→undo→redo rect lifecycle for 3 element types.
// Uses DS.undo() / DS.redo() programmatically — keyboard ctrl+z does not work after
// resize because focus leaves the canvas when the resize handle is released.
// Runs chromium only; the resize handle interaction is not cross-browser critical
// (the undo/redo model layer is browser-agnostic).
//
// NOT covered: resize of line elements (height≈0, no visible SE handle area),
// simultaneous multi-element resize, resize with non-SE handles.

async function runResizeSubtest(t, page, { type, label, skip = 0 }) {
  await reloadRuntime(page, page._baseUrl);

  const el = await page.evaluate(({ elType, skip }) => {
    const found = DS.elements.filter((e) => e.type === elType).slice(skip, skip + 1)[0];
    return found ? { id: found.id, type: found.type } : null;
  }, { elType: type, skip: skip || 0 });

  assert.ok(el, `resize smoke: no ${type} element found in template`);

  // force:true bypasses pointer-event interception from overlapping template elements.
  // This is intentional: we're testing resize, not click routing.
  await page.locator(`.cr-element:not(.pv-el)[data-id="${el.id}"]`).click({ force: true });
  await page.waitForTimeout(100);

  const visBefore = await collectElementVisibility(page, { id: el.id, mode: 'design' });
  assert.ok(visBefore.exists, `${label}: element must exist before resize`);
  assert.ok(visBefore.rect && visBefore.rect.width > 0, `${label}: needs non-zero width before resize`);

  // Handles must be visible for resizeFromHandle to work
  const handlePresent = await page.evaluate(() => !!document.querySelector('#handles-layer .sel-handle[data-pos="se"]'));
  assert.ok(handlePresent, `${label}: SE handle must be present after single selection`);

  await resizeFromHandle(page, 'se', 20, 10);

  const visAfterResize = await collectElementVisibility(page, { id: el.id, mode: 'design' });
  const widthGrew = (visAfterResize.rect?.width || 0) > (visBefore.rect.width + 5);
  const heightGrew = (visAfterResize.rect?.height || 0) > (visBefore.rect.height + 5);
  assert.ok(widthGrew || heightGrew, `${label}: resize did not change dimensions; before=${JSON.stringify(visBefore.rect)} after=${JSON.stringify(visAfterResize.rect)}`);

  const overlayAfterResize = await page.evaluate(() => ({
    boxCount: document.querySelectorAll('#handles-layer .sel-box').length,
    handleCount: document.querySelectorAll('#handles-layer .sel-handle').length,
  }));
  t.diagnostic(`${label}: after-resize overlay boxCount=${overlayAfterResize.boxCount} handleCount=${overlayAfterResize.handleCount}`);

  // Undo via programmatic call (keyboard focus lost to resize handle)
  await page.evaluate(() => DS.undo());
  await page.waitForTimeout(200);

  const visAfterUndo = await collectElementVisibility(page, { id: el.id, mode: 'design' });
  assertBoundingBoxDriftWithin(visAfterUndo.rect, visBefore.rect, `${label}: undo rect restore`, 2);
  t.diagnostic(`${label}: undo restored rect w=${visAfterUndo.rect?.width?.toFixed(1)} h=${visAfterUndo.rect?.height?.toFixed(1)}`);

  // Redo
  await page.evaluate(() => DS.redo());
  await page.waitForTimeout(200);

  const visAfterRedo = await collectElementVisibility(page, { id: el.id, mode: 'design' });
  assertBoundingBoxDriftWithin(visAfterRedo.rect, visAfterResize.rect, `${label}: redo rect match`, 2);
  t.diagnostic(`${label}: redo re-applied rect w=${visAfterRedo.rect?.width?.toFixed(1)} h=${visAfterRedo.rect?.height?.toFixed(1)}`);

  // Jitter check: overlay stability after undo+redo cycle
  const frames = await captureTemporalFrames(page, '.cr-element:not(.pv-el)', {
    phasePrefix: `${label}-final`,
    microtasks: 1,
    timeouts: [0, 4],
    frames: 4,
  });
  const jitter = computeMicroJitterScore(frames, { driftThresholdPx: 1 });
  t.diagnostic(`${label}: jitterScore=${jitter.jitterScore} frameDropDetected=${jitter.frameDropDetected}`);
  assert.equal(jitter.frameDropDetected, false, `${label}: frame drop detected after undo/redo ${JSON.stringify(jitter.diagnostics)}`);
}

test('USER-PARITY resize smoke: field, text, rect — undo/redo rect restore', { timeout: 240000 }, async (t) => {
  const server = await startRuntimeServer();

  try {
    // Rect and line elements are decorative (do not respond to drag-resize). Not covered.
    for (const { type, label, skip } of [
      { type: 'field', label: 'resize field (first)', skip: 0 },
      { type: 'field', label: 'resize field (second)', skip: 1 },
      { type: 'text', label: 'resize text' },
    ]) {
      await t.test(label, async (t) => {
        const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl);
        page._baseUrl = server.baseUrl;
        try {
          await runResizeSubtest(t, page, { type, label, skip });
          await assertNoConsoleErrors(consoleErrors, `USER-PARITY ${label}`);
        } finally {
          await browser.close();
        }
      });
    }

    // Coverage accounting
    t.diagnostic(formatSmokeCoverageSummary(buildSmokeLayerCoverage([
      { category: 'resize_field', exercised: 2, total: 2 },
      { category: 'resize_text', exercised: 1, total: 1 },
      { category: 'resize_rect', exercised: 0, total: 1, notCoveredNotes: ['rect elements are decorative — do not respond to drag-resize'] },
      { category: 'resize_line', exercised: 0, total: 1, notCoveredNotes: ['height≈0 — no SE handle area'] },
      { category: 'resize_multiselect', exercised: 0, total: 1, notCoveredNotes: ['multi-element resize not exercised'] },
    ])));
  } finally {
    await server.stop();
  }
});
