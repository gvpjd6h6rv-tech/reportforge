/**
 * LIVE SMOKE — Bug 1 closure: preview drag keeps the VISIBLE render-layer
 * text in sync with the selection box during the drag itself, not only on
 * mouseup.
 *
 * Original bug (manual repro, 20+ iterations before root cause): in preview
 * mode, dragging an element moved the (invisible) hit-layer proxy and the
 * selection box in real time, but the actual visible text — server-rendered
 * into #preview-content .preview-render-layer, with zero per-element
 * addressing attributes — never moved until mouseup forced a full
 * server-refresh re-render. Box and text visually separated mid-drag,
 * reuniting only on release.
 *
 * Root cause + fix (two cooperating halves, confirmed live, not by reading
 * code alone):
 *
 *  1. Server-rendered HTML had no way to address an individual element:
 *     - reportforge/core/render/engines/advanced_engine.py:321  adds
 *       data-section-id to .cr-detail-row (repeating/iterating sections).
 *     - reportforge/core/render/engines/advanced_engine.py:337  adds
 *       data-section-id to .cr-section (static sections).
 *     - reportforge/core/render/engines/advanced_engine_shared.py:52
 *       (_with_element_index) injects data-el-index="<position within its
 *       section>" onto each rendered element's root tag.
 *     - reportforge/core/render/engines/element_renderers.py:32-52 wraps
 *       every render_element() branch with _with_element_index(...).
 *
 *  2. JS now finds and repositions that exact node during the drag:
 *     - engines/SelectionDragPreviewSync.js:13 (findPreviewRenderNodes) —
 *       queries .preview-render-layer .cr-section/.cr-detail-row
 *       [data-section-id] [data-el-index] to locate the visible node(s).
 *     - engines/SelectionDragPreviewSync.js:25 (dragTransformStyle) —
 *       applies the same snapped-position + sub-pixel-drift transform used
 *       for the design .cr-element and the hit-layer .pv-el.
 *     - engines/SelectionInteractionMotion.js:66-67 (_doMove) and :123
 *       (_doResize) call these on every drag step while DS.previewMode.
 *
 * This file is the first live, end-to-end proof that the two halves
 * actually cooperate correctly — neither half was sufficient alone, and
 * nothing previously exercised them together against a real running app.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  startRuntimeServer,
  launchRuntimePage,
  setZoom,
  enterPreview,
  exitPreview,
  selectPreviewSingle,
  assertNoConsoleErrors,
} from './runtime_harness.mjs';

const TARGET_ID = 'e127'; // s-d1 "Detalle a" detail-row field, data-el-index=1
const SECTION_ID = 's-d1';
const MAX_DRIFT_PX = 1.5; // box vs. visible-text drift tolerance during drag

async function selectAndShowOverlay(page, id) {
  // A real preview click is what unfreezes PreviewEngineMode's selection
  // overlay (see PreviewEngineMode.show -> freezeSelectionOverlay); a bare
  // DS.selectOnly() without first having clicked something in preview
  // leaves the overlay hidden and there is no .sel-box to drag.
  await selectPreviewSingle(page, 0);
  await page.evaluate((elId) => {
    DS.selectOnly(elId, 'test');
    SelectionEngine.renderHandles();
  }, id);
  await page.waitForFunction(() => !!document.querySelector('.preview-selection-layer .sel-box'));
}

function sampleBoxVsText(page, sectionId) {
  return page.evaluate((sectionId) => {
    const box = document.querySelector('.preview-selection-layer .sel-box');
    const text = document.querySelector(
      `.preview-render-layer .cr-detail-row[data-section-id="${sectionId}"] [data-el-index="1"]`
    );
    if (!box || !text) return { boxFound: !!box, textFound: !!text, dx: null, dy: null };
    const b = box.getBoundingClientRect();
    const t = text.getBoundingClientRect();
    return { boxFound: true, textFound: true, dx: Math.abs(b.left - t.left), dy: Math.abs(b.top - t.top) };
  }, sectionId);
}

test('LIVE: preview drag — visible render-layer text tracks the selection box in real time (not only on mouseup)', { timeout: 60000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl);

  try {
    await page.waitForFunction(() => typeof DS !== 'undefined' && Array.isArray(DS.elements) && DS.elements.length > 0);
    await page.waitForTimeout(800);
    await setZoom(page, 1);
    await enterPreview(page);
    await selectAndShowOverlay(page, TARGET_ID);

    // ── 1. text and box move together DURING mousemove, bounded drift ──
    const startBox = await page.locator('.preview-selection-layer .sel-box').boundingBox();
    await page.mouse.move(startBox.x + 10, startBox.y + 5);
    await page.mouse.down();

    let maxDrift = 0;
    const steps = [
      [20, 5], [40, 10], [60, 30], [60, -10], [-30, 20],
    ];
    let cx = startBox.x + 10, cy = startBox.y + 5;
    for (const [dx, dy] of steps) {
      cx += dx; cy += dy;
      await page.mouse.move(cx, cy, { steps: 6 });
      const sample = await sampleBoxVsText(page, SECTION_ID);
      assert.ok(sample.boxFound, 'sel-box must exist during the drag');
      assert.ok(sample.textFound, 'visible render-layer text node must still exist during the drag (not waiting for mouseup)');
      maxDrift = Math.max(maxDrift, sample.dx, sample.dy);
    }
    assert.ok(
      maxDrift <= MAX_DRIFT_PX,
      `box-vs-visible-text drift during drag must stay <= ${MAX_DRIFT_PX}px, got ${maxDrift.toFixed(3)}px`
    );

    // ── 2. repeated detail rows: only the correct column moves, in every
    //      row, and nothing else (sibling column, other section) moves ──
    const duringMulti = await page.evaluate((sectionId) => {
      const rows = [...document.querySelectorAll(`.preview-render-layer .cr-detail-row[data-section-id="${sectionId}"]`)];
      return {
        rowCount: rows.length,
        idx1Lefts: rows.map((r) => r.querySelector('[data-el-index="1"]')?.style.left),
        idx0Lefts: rows.map((r) => r.querySelector('[data-el-index="0"]')?.style.left),
        otherSectionLeft: document.querySelector('.preview-render-layer .cr-section[data-section-id="s-rh"] [data-el-index="1"]')?.style.left,
      };
    }, SECTION_ID);
    assert.ok(duringMulti.rowCount >= 2, `fixture must have >=2 repeated detail rows, got ${duringMulti.rowCount}`);
    const uniqueIdx1 = new Set(duringMulti.idx1Lefts);
    assert.equal(uniqueIdx1.size, 1, `every repeated row's dragged column must move identically, got distinct lefts: ${[...uniqueIdx1]}`);
    const uniqueIdx0 = new Set(duringMulti.idx0Lefts);
    assert.equal(uniqueIdx0.size, 1, 'the sibling (non-dragged) column must not move during the drag');
    assert.equal(duringMulti.otherSectionLeft, '4px', 'an unrelated section must never be touched by a drag in a different section');

    // ── 3. mouseup settles to a clean, non-dragging state ──
    await page.mouse.up();
    await page.waitForFunction((sectionId) => {
      const node = document.querySelector(
        `.preview-render-layer .cr-detail-row[data-section-id="${sectionId}"] [data-el-index="1"]`
      );
      return !!node && node.style.transform === '';
    }, SECTION_ID, { timeout: 5000 });
    const settled = await page.evaluate((sectionId) => {
      const node = document.querySelector(
        `.preview-render-layer .cr-detail-row[data-section-id="${sectionId}"] [data-el-index="1"]`
      );
      return { transform: node.style.transform, left: node.style.left, className: node.className };
    }, SECTION_ID);
    assert.equal(settled.transform, '', 'transform must be clean (no residual drag offset) after mouseup settles');
    assert.doesNotMatch(settled.className, /dragging/, 'no stray "dragging" class after release');
    assert.notEqual(settled.left, '60px', 'left must reflect the moved position, not the pre-drag original');

    // ── 4. exiting and re-entering preview (a real refresh cycle) must not
    //      break — same row count, same settled position, no console errors ──
    await exitPreview(page);
    await enterPreview(page);
    const afterRefresh = await page.evaluate((sectionId) => {
      const rows = [...document.querySelectorAll(`.preview-render-layer .cr-detail-row[data-section-id="${sectionId}"]`)];
      const node = rows[0] ? rows[0].querySelector('[data-el-index="1"]') : null;
      return { rowCount: rows.length, left: node ? node.style.left : null, transform: node ? node.style.transform : null };
    }, SECTION_ID);
    assert.equal(afterRefresh.rowCount, duringMulti.rowCount, 'preview refresh after a drag must not lose or duplicate repeated rows');
    assert.equal(afterRefresh.left, settled.left, 'preview refresh must re-render at the same (moved) model position');
    assert.equal(afterRefresh.transform, '', 'a freshly server-rendered node must never carry a leftover drag transform');

    await assertNoConsoleErrors(consoleErrors, 'preview drag render-layer sync live smoke');
  } finally {
    await browser.close();
    await server.stop();
  }
});
