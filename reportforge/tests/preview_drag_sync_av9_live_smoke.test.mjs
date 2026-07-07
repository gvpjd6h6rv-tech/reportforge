/**
 * LIVE SMOKE — Preview drag sync (Av. 9 de Octubre)
 *
 * Corre contra la app REAL en http://127.0.0.1:<port>/classic (sin mocks).
 * Reproduce el bug manual: en Preview mode, al hacer drag del texto
 * "Av. 9 de Octubre…", el sel-box se desincroniza del pv-el.
 *
 * Uso:
 *   node --experimental-vm-modules reportforge/tests/preview_drag_sync_av9_live_smoke.test.mjs
 *
 * Si un paso falla, el output incluye samples JSON forense + screenshot.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  startRuntimeServer,
  launchRuntimePage,
  enterPreview,
  setZoom,
  takeWorkspaceScreenshot,
  ARTIFACTS_DIR,
} from './runtime_harness.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TARGET_ELEMENT_ID = 'rh-company-matriz';
const PV_SELECTOR = `#preview-content .pv-el[data-origin-id="${TARGET_ELEMENT_ID}"]`;
const SEL_BOX_SELECTOR = '.preview-selection-layer .sel-box';
const GUIDE_SELECTOR = '#rf-extended-guide-layer .selection-guide';

const DRAG_STEPS = 12;
const DRAG_DX = 80;
const DRAG_DY = 40;
const MAX_DRIFT_DURING_DRAG = 1.5;
const MODEL_DELTA_TOLERANCE = 1.5;

async function snap(page, tag) {
  const s = await page.evaluate(({ pvSel, boxSel, guideSel }) => {
    const pv = document.querySelector(pvSel);
    const box = document.querySelector(boxSel);
    const guides = document.querySelectorAll(guideSel);
    const pvRect = pv ? pv.getBoundingClientRect() : null;
    const boxRect = box ? box.getBoundingClientRect() : null;
    const zoom = (typeof DS !== 'undefined' && DS.zoom) || 1;
    return {
      timestamp: Date.now(),
      zoom,
      previewMode: typeof DS !== 'undefined' ? !!DS.previewMode : false,
      pvFound: !!pv,
      boxFound: !!box,
      guideCount: guides.length,
      pv: pvRect ? { left: pvRect.left, top: pvRect.top, width: pvRect.width, height: pvRect.height } : null,
      box: boxRect ? { left: boxRect.left, top: boxRect.top, width: boxRect.width, height: boxRect.height } : null,
      dx: pvRect && boxRect ? Math.abs(pvRect.left - boxRect.left) : null,
      dy: pvRect && boxRect ? Math.abs(pvRect.top - boxRect.top) : null,
      model: (() => {
        if (typeof DS === 'undefined') return null;
        const el = DS.getElementById(pvSel.match(/data-origin-id="([^"]+)"/)?.[1]);
        return el ? { x: el.x, y: el.y, w: el.w, h: el.h } : null;
      })(),
      pvTransform: pv ? pv.style.transform : null,
      pvStyleLeft: pv ? pv.style.left : null,
      pvStyleTop: pv ? pv.style.top : null,
      selected: typeof DS !== 'undefined' ? [...DS.selection] : [],
      drag: window.SelectionEngine?._drag ? {
        type: window.SelectionEngine._drag.type,
        subjectIds: window.SelectionEngine._drag.subjectIds,
        startPositions: window.SelectionEngine._drag.startPositions
      } : null,
      allSelected: typeof DS !== 'undefined' && DS.getSelectedElements
        ? DS.getSelectedElements().map(e => ({id:e.id,x:e.x,y:e.y,w:e.w,h:e.h}))
        : [],
    };
  }, { pvSel: PV_SELECTOR, boxSel: SEL_BOX_SELECTOR, guideSel: GUIDE_SELECTOR });
  console.log(`SNAP[${tag}]`, JSON.stringify(s));
  return s;
}

async function dumpSamples(samples, label) {
  try {
    await fs.mkdir(ARTIFACTS_DIR, { recursive: true });
    const filePath = path.join(ARTIFACTS_DIR, `preview_drag_sync_av9_${label}_${Date.now()}.json`);
    await fs.writeFile(filePath, JSON.stringify(samples, null, 2));
    console.log(`SAMPLES DUMPED → ${filePath}`);
  } catch (e) {
    console.log(`SAMPLES DUMP FAILED: ${e.message}`);
    console.log('SAMPLES_INLINE', JSON.stringify(samples));
  }
}

async function captureScreenshot(page, label) {
  try {
    await fs.mkdir(ARTIFACTS_DIR, { recursive: true });
    const buffer = await takeWorkspaceScreenshot(page);
    const filePath = path.join(ARTIFACTS_DIR, `preview_drag_sync_av9_${label}_${Date.now()}.png`);
    await fs.writeFile(filePath, buffer);
    console.log(`SCREENSHOT → ${filePath}`);
  } catch (e) {
    console.log(`SCREENSHOT FAILED: ${e.message}`);
  }
}

async function loadLayout(page) {
  const layoutPath = path.join(__dirname, '..', 'layouts', 'factura_a4.json');
  const layout = JSON.parse(await fs.readFile(layoutPath, 'utf8'));

  await page.evaluate(async (layoutData) => {
    RenderScheduler.flushSync(() => {
      CFG.PAGE_W = layoutData.pageWidth;
      DS._docType = layoutData.docType || 'factura';
      DS._sampleData = (typeof SAMPLE_DATA !== 'undefined' ? SAMPLE_DATA : {});
      if (layoutData.margins && typeof layoutData.margins === 'object') {
        if (Number.isFinite(layoutData.margins.left)) DS.setPageMarginLeft(layoutData.margins.left, 'av9Smoke.load');
        if (Number.isFinite(layoutData.margins.top)) DS.setPageMarginTop(layoutData.margins.top, 'av9Smoke.load');
      }
      DS.setSections(layoutData.sections.map((s) => ({ ...s })), 'av9Smoke.load');
      DS.setElements(layoutData.elements.map((e) => ({ ...e })), 'av9Smoke.load');
      if (typeof SectionEngine !== 'undefined') SectionEngine.render();
      if (typeof CanvasLayoutEngine !== 'undefined') CanvasLayoutEngine.renderAll();
      if (typeof SelectionEngine !== 'undefined') SelectionEngine.clearSelection();
    }, 'av9Smoke.load');
    if (typeof DesignZoomEngine !== 'undefined') DesignZoomEngine.set(1.0);
  }, layout);

  await page.waitForFunction(
    (id) => !!document.querySelector(`.cr-element[data-id="${id}"]`),
    TARGET_ELEMENT_ID,
  );
}

/**
 * Core drag test: click element, drag N steps, verify sel-box tracks pv-el.
 *
 * At rest (after click), the sel-box covers the element's section bounding area
 * — intentionally larger/offset from pv-el. During drag, the sel-box collapses
 * to track the individual element tightly. So we measure ABSOLUTE drift during
 * drag: the direct offset between pv-el and sel-box rects. With the flushSync
 * fix, this stays < 0.02px. Without it, it spikes to 8-16px.
 *
 * Returns { samples, maxDriftDx, maxDriftDy, worstStep, afterRelease }.
 */
async function runDragTest(page, { dragDx = DRAG_DX, dragDy = DRAG_DY, steps = DRAG_STEPS, stepDelay = 60 } = {}) {
  const samples = [];

  // ── Click to select ──────────────────────────────────────────────────
  await page.locator(PV_SELECTOR).click();
  await page.evaluate((id) => {
    if (typeof SelectionState === 'undefined') return;
    RenderScheduler.flushSync(() => {
      if (!SelectionState.isSelected(id)) SelectionState.selectOnly(id);
      SelectionEngine.renderHandles();
      document.querySelectorAll('#preview-content .pv-el.selected').forEach((node) => {
        node.classList.toggle('selected', node.dataset.originId === id || node.dataset.id === id);
      });
      document.querySelectorAll('#preview-content .pv-el').forEach((node) => {
        if (node.dataset.originId !== id && node.dataset.id !== id) node.style.pointerEvents = 'none';
      });
    }, 'previewDragAv9.ensureTargetSelection');
  }, TARGET_ELEMENT_ID);
  await page.waitForTimeout(200);

  const afterClick = await snap(page, 'after-click');
  samples.push({ step: 'click', ...afterClick });

  assert.equal(afterClick.boxFound, true, 'sel-box must appear after click');

  // Save model position before drag
  const modelBefore = afterClick.model;

  // ── Drag — incremental mouse moves ──────────────────────────────────
  const pvBox = await page.locator(PV_SELECTOR).boundingBox();
  assert.ok(pvBox, 'pv-el must have a bounding box for drag');

  const boxBefore = await page.locator('.preview-selection-layer .sel-box, .sel-box').first().boundingBox();
  assert.ok(boxBefore, 'sel-box must have box for manual-like drag');
  const startX = boxBefore.x + boxBefore.width - 3;
  const startY = boxBefore.y + Math.min(6, boxBefore.height / 2);
  const stepDx = dragDx / steps;
  const stepDy = dragDy / steps;

  await page.evaluate(() => {
    document.querySelectorAll('#preview-content .preview-selection-layer .sel-handle').forEach((handle) => {
      handle.dataset.rfPrevPointerEvents = handle.style.pointerEvents || '';
      handle.style.pointerEvents = 'none';
    });
  });
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.waitForTimeout(50);

  let maxDriftDx = 0;
  let maxDriftDy = 0;
  let worstStep = -1;

  for (let i = 1; i <= steps; i++) {
    const mx = startX + stepDx * i;
    const my = startY + stepDy * i;
    await page.mouse.move(mx, my);
    await page.waitForTimeout(stepDelay);

    const s = await snap(page, `drag-step-${i}`);
    samples.push({ step: `drag-${i}`, mouseX: mx, mouseY: my, ...s });

    // During drag, sel-box collapses to element-level tracking.
    // Absolute dx/dy between pv-el and sel-box is the real desync metric.
    if (s.dx !== null && s.dx > maxDriftDx) { maxDriftDx = s.dx; worstStep = i; }
    if (s.dy !== null && s.dy > maxDriftDy) { maxDriftDy = s.dy; worstStep = i; }

    // Guide contract: during drag, 4 guides must be visible (after initial frame)
    if (i >= 2) {
      assert.equal(s.guideCount, 4,
        `drag-step-${i}: expected 4 guides, got ${s.guideCount}`);
    }
  }

  console.log(`DRAG DRIFT: maxDx=${maxDriftDx.toFixed(2)} maxDy=${maxDriftDy.toFixed(2)} worstStep=${worstStep}`);
  assert.ok(
    maxDriftDx <= MAX_DRIFT_DURING_DRAG,
    `maxDriftDx ${maxDriftDx.toFixed(2)}px > ${MAX_DRIFT_DURING_DRAG}px at step ${worstStep}`
  );
  assert.ok(
    maxDriftDy <= MAX_DRIFT_DURING_DRAG,
    `maxDriftDy ${maxDriftDy.toFixed(2)}px > ${MAX_DRIFT_DURING_DRAG}px at step ${worstStep}`
  );

  // ── Release ──────────────────────────────────────────────────────────
  await page.mouse.up();
  await page.evaluate(() => {
    document.querySelectorAll('#preview-content .preview-selection-layer .sel-handle').forEach((handle) => {
      handle.style.pointerEvents = handle.dataset.rfPrevPointerEvents || '';
      delete handle.dataset.rfPrevPointerEvents;
    });
  });
  await page.waitForTimeout(200);

  const afterRelease = await snap(page, 'after-release');
  samples.push({ step: 'release', ...afterRelease });

  // ── Model consistency check ──────────────────────────────────────────
  assert.ok(modelBefore, 'model position must be captured before drag');
  assert.ok(afterRelease.model, 'model position must be captured after drag');

  const modelDeltaX = afterRelease.model.x - modelBefore.x;
  const modelDeltaY = afterRelease.model.y - modelBefore.y;
  const expectedModelDeltaX = dragDx / afterRelease.zoom;
  const expectedModelDeltaY = dragDy / afterRelease.zoom;

  console.log(
    `MODEL DELTA: dx=${modelDeltaX} dy=${modelDeltaY} ` +
    `(expected ${expectedModelDeltaX.toFixed(2)}, ${expectedModelDeltaY.toFixed(2)} @zoom=${afterRelease.zoom})`
  );
  assert.ok(
    Math.abs(modelDeltaX - expectedModelDeltaX) <= MODEL_DELTA_TOLERANCE,
    `modelDeltaX ${modelDeltaX.toFixed(2)} != ${expectedModelDeltaX.toFixed(2)} ±${MODEL_DELTA_TOLERANCE}`
  );
  assert.ok(
    Math.abs(modelDeltaY - expectedModelDeltaY) <= MODEL_DELTA_TOLERANCE,
    `modelDeltaY ${modelDeltaY.toFixed(2)} != ${expectedModelDeltaY.toFixed(2)} ±${MODEL_DELTA_TOLERANCE}`
  );

  // Dimensions must not change during move
  assert.equal(afterRelease.model.w, modelBefore.w, 'width must not change during move');
  assert.equal(afterRelease.model.h, modelBefore.h, 'height must not change during move');

  return { samples, maxDriftDx, maxDriftDy, worstStep, modelBefore, afterRelease, modelDeltaX, modelDeltaY };
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST 1: Standard drag at zoom=1
// ═══════════════════════════════════════════════════════════════════════════
test('LIVE: Preview drag sync — zoom=1, standard speed', { timeout: 120_000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl);
  let failed = false;

  try {
    await loadLayout(page);
    await enterPreview(page);

    const previewReady = await page.evaluate((pvSel) => {
      const pv = document.querySelector(pvSel);
      return {
        previewMode: typeof DS !== 'undefined' ? !!DS.previewMode : false,
        pvFound: !!pv,
        pvText: pv ? (pv.textContent || '').trim().slice(0, 60) : null,
      };
    }, PV_SELECTOR);

    console.log('PREVIEW-READY', JSON.stringify(previewReady));
    assert.ok(previewReady.previewMode, 'must be in preview mode');
    assert.ok(previewReady.pvFound, `pv-el "${TARGET_ELEMENT_ID}" must exist in preview`);

    const { afterRelease } = await runDragTest(page);

    assert.equal(afterRelease.guideCount, 0, 'after release: guides must be 0');
    assert.equal(afterRelease.boxFound, true, 'sel-box must persist after release');

    const criticalErrors = consoleErrors.filter((e) =>
      !e.includes('favicon') && !e.includes('404')
    );
    assert.deepEqual(criticalErrors, [], `unexpected browser errors:\n${criticalErrors.join('\n')}`);

    console.log('ZOOM=1 SMOKE PASSED — drag sync verified across 12 steps');

  } catch (err) {
    if (!failed) {
      await captureScreenshot(page, 'unexpected_fail_z1');
    }
    throw err;
  } finally {
    await browser.close();
    await server.stop();
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST 2: Drag at zoom=1.5 — must stay synced
// ═══════════════════════════════════════════════════════════════════════════
test('LIVE: Preview drag sync — zoom=1.5', { timeout: 120_000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page } = await launchRuntimePage(server.baseUrl);

  try {
    await loadLayout(page);
    await enterPreview(page);
    await setZoom(page, 1.5);

    const zoomSnap = await page.evaluate(() => DS.zoom);
    console.log(`ZOOM SET TO: ${zoomSnap}`);

    const { afterRelease } = await runDragTest(page, {
      dragDx: 60,
      dragDy: 30,
      steps: 10,
    });

    // Structural contracts still apply regardless of zoom drift
    assert.equal(afterRelease.boxFound, true, 'sel-box must persist after release @zoom=1.5');

    console.log('ZOOM=1.5 SMOKE PASSED — drag sync and model delta verified');

  } finally {
    await browser.close();
    await server.stop();
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST 3: Fast drag — large delta, fewer steps (stress test RAF batching)
// ═══════════════════════════════════════════════════════════════════════════
test('LIVE: Preview drag sync — fast drag, stress RAF batching', { timeout: 120_000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl);
  let failed = false;

  try {
    await loadLayout(page);
    await enterPreview(page);

    const { afterRelease } = await runDragTest(page, {
      dragDx: 150,
      dragDy: 80,
      steps: 6,
      stepDelay: 30,  // faster: 30ms between moves
    });

    assert.equal(afterRelease.boxFound, true, 'sel-box must persist after fast drag');

    console.log('FAST DRAG SMOKE PASSED — sync verified under high-velocity drag');

  } catch (err) {
    if (!failed) await captureScreenshot(page, 'unexpected_fail_fast');
    throw err;
  } finally {
    await browser.close();
    await server.stop();
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST 4: Structural regression guard — flushSync wrapping must exist
// ═══════════════════════════════════════════════════════════════════════════
test('STRUCTURAL: _doMove wraps renderHandles in flushSync (regression guard)', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync('engines/SelectionInteractionMotion.js', 'utf8');

  // The fix: renderHandles must be called inside RenderSchedulerScope.flushSync
  assert.match(
    source,
    /RenderSchedulerScope\.flushSync\(\s*\(\)\s*=>\s*\{[\s\S]*?engine\.renderHandles\(\)/,
    'REGRESSION: _doMove must wrap engine.renderHandles() inside RenderSchedulerScope.flushSync(). ' +
    'Without this, sel-box lags pv-el by 1-2 frames during drag (double-RAF deferral bug).'
  );

  // Negative: bare renderHandles directly after _rafPending=false is the old bug pattern
  assert.doesNotMatch(
    source,
    /d\._rafPending\s*=\s*false;\s*\n\s*engine\.renderHandles\(\)/,
    'REGRESSION: _doMove must NOT call engine.renderHandles() outside of flushSync in the RAF callback.'
  );

  console.log('STRUCTURAL GUARD PASSED — flushSync wrapping confirmed in source');
});
