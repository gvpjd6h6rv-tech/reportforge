/**
 * RF-PREVIEW-FOOTER-OVERLAY-OFFSET-1
 *
 * Reported bug: opening factura_fv1.json (via the real Archivo -> Abrir
 * flow, not a synthetic layout) and entering Preview, the blue selection
 * box and the orange hover box for the "Forma de Pago" field (report
 * footer / last section, element id "rf-pay-desc") render ABOVE the real
 * element instead of around it.
 *
 * Root cause (confirmed live, not hypothesized):
 *   - engines/PreviewEngineData.js renderWithData() computes the correct,
 *     grown row height for each detail row via _rowHeight() (which mirrors
 *     core/render/engines/enterprise_engine_layout.py's build_row_h() —
 *     canGrow fields can make a row taller than its nominal sec.height).
 *     That grown height (r.height) is passed to addBand() ONLY for the
 *     page-height bookkeeping accumulator.
 *   - renderBand() (the function that actually builds each band's DOM,
 *     including the .preview-hit-layer's invisible .pv-el hit-test
 *     proxies) ignores that grown height entirely and always emits
 *     `height:${sec.height}px` (engines/PreviewEngineData.js:44) — the
 *     flat, nominal height.
 *   - The REAL server-rendered preview (core/render/engines/
 *     enterprise_engine_layout.py build_row(), build_row_h()) DOES grow
 *     each detail row's actual rendered height. So every detail row that
 *     grows makes the hit-layer (and therefore every selection/hover box,
 *     which is positioned from the hit-layer's .pv-el via
 *     SelectionOverlayPreview.domRectRelativeToLayer) drift upward by the
 *     growth amount, relative to the real visible content — and this
 *     accumulates across every grown row before a given section. With
 *     factura_fv1.json's sample data, 9 detail rows each grow by 3px
 *     (17px real vs 14px nominal) = 27px of accumulated drift by the time
 *     the report footer ("Forma de Pago") is reached — confirmed via
 *     getBoundingClientRect() on both layers before any fix.
 *   - rh/ph sections (no canGrow elements) show zero drift, which is why
 *     this looked like a "footer-only" bug — it is really a "every grown
 *     detail row pushes everything after it up" bug; the footer just
 *     accumulates the most of it, being last.
 *   - The EXISTING preview selection tests (runtime_regression.test.mjs,
 *     "preview drag", etc., via getSingleAlignment() in runtime_harness.mjs)
 *     compare the sel-box to `.pv-el.selected` — the hit-layer proxy
 *     itself — never to the real `.preview-render-layer` content. Since
 *     the hit-layer and the overlay boxes are both wrong by the same
 *     amount, those tests stayed green throughout. This test compares
 *     against the REAL rendered node instead, the only ground truth that
 *     matches what the user actually sees.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startRuntimeServer, launchRuntimePage, enterPreview, setZoom } from './runtime_harness.mjs';

const LAYOUT_PATH = '/home/mimi/Escritorio/sap_b1_linux/reportforge_layouts/factura_fv1.json';
const DRIFT_TOLERANCE_PX = 1;

async function openFactura(page) {
  await page.evaluate(() => { delete window.showOpenFilePicker; });
  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.locator('button.tb-icon[data-action="open"]').click();
  const chooser = await fileChooserPromise;
  await chooser.setFiles(LAYOUT_PATH);
  await page.waitForTimeout(500);
}

async function getRectsForElement(page, { id, sectionId, viaHover }) {
  return page.evaluate(({ id, sectionId, viaHover }) => {
    const idx = DS.elements.filter((e) => e.sectionId === sectionId).findIndex((e) => e.id === id);
    const section = document.querySelector(`#preview-content .preview-render-layer .cr-section[data-section="${sectionId}"]`);
    const renderNode = section ? section.querySelector(`[data-el-index="${idx}"]`) : null;
    const layerSel = viaHover ? '.preview-hover-layer' : '.preview-selection-layer';
    const boxSel = viaHover ? '.preview-hover-box' : '.sel-box';
    const box = document.querySelector(`#preview-content ${layerSel} ${boxSel}`);
    const r1 = renderNode ? renderNode.getBoundingClientRect() : null;
    const r2 = box ? box.getBoundingClientRect() : null;
    return {
      renderRect: r1 ? { left: r1.left, top: r1.top, width: r1.width, height: r1.height } : null,
      boxRect: r2 ? { left: r2.left, top: r2.top, width: r2.width, height: r2.height } : null,
    };
  }, { id, sectionId, viaHover });
}

function assertNoDrift(rects, label) {
  assert.ok(rects.renderRect, `${label}: real render node not found`);
  assert.ok(rects.boxRect, `${label}: overlay box not found`);
  const dx = Math.abs(rects.boxRect.left - rects.renderRect.left);
  const dy = Math.abs(rects.boxRect.top - rects.renderRect.top);
  assert.ok(dx <= DRIFT_TOLERANCE_PX, `${label}: X drift ${dx.toFixed(2)}px exceeds ${DRIFT_TOLERANCE_PX}px (box=${JSON.stringify(rects.boxRect)} render=${JSON.stringify(rects.renderRect)})`);
  assert.ok(dy <= DRIFT_TOLERANCE_PX, `${label}: Y drift ${dy.toFixed(2)}px exceeds ${DRIFT_TOLERANCE_PX}px (box=${JSON.stringify(rects.boxRect)} render=${JSON.stringify(rects.renderRect)})`);
}

async function selectByOriginId(page, id) {
  await page.locator(`#preview-content .pv-el[data-origin-id="${id}"]`).click({ position: { x: 5, y: 5 } });
  await page.waitForTimeout(150);
}

async function hoverByOriginId(page, id) {
  // Selection handles drawn over a currently-selected element intercept
  // pointer events, so hover must be checked from a clean (deselected)
  // state — otherwise Playwright's hover blocks on the handle overlay.
  await page.evaluate(() => SelectionEngine.clearSelection());
  await page.waitForTimeout(50);
  await page.locator(`#preview-content .pv-el[data-origin-id="${id}"]`).hover({ position: { x: 5, y: 5 } });
  await page.waitForTimeout(150);
}

test('LIVE: Preview selection/hover boxes track the REAL rendered element across all sections (factura_fv1.json)', { timeout: 60000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page } = await launchRuntimePage(server.baseUrl);
  try {
    await openFactura(page);
    const loaded = await page.evaluate(() => DS.elements.some((e) => e.id === 'rf-pay-desc'));
    assert.ok(loaded, 'factura_fv1.json did not load via the real Abrir flow');

    await enterPreview(page);
    await page.waitForTimeout(400);

    // Header section: pick the first element actually in s-rh.
    const headerId = await page.evaluate(() => DS.elements.find((e) => e.sectionId === 's-rh')?.id);
    // Detail section: the canGrow description field, first row instance.
    const detailId = 'det-desc';
    // Footer section: the exact reported repro element.
    const footerId = 'rf-pay-desc';

    assert.ok(headerId, 'no element found in report header (s-rh)');

    // --- Header: selection + hover ---
    await selectByOriginId(page, headerId);
    assertNoDrift(await getRectsForElement(page, { id: headerId, sectionId: 's-rh', viaHover: false }), 'header selection');
    await page.mouse.move(0, 0);
    await hoverByOriginId(page, headerId);
    assertNoDrift(await getRectsForElement(page, { id: headerId, sectionId: 's-rh', viaHover: true }), 'header hover');

    // --- Detail row 0 ---
    const detailRect = await page.evaluate(({ id }) => {
      const hit = document.querySelector(`#preview-content .preview-hit-layer .pv-el[data-origin-id="${id}"][data-row-index="0"]`);
      return hit ? hit.getBoundingClientRect() : null;
    }, { id: detailId });
    assert.ok(detailRect, 'detail row 0 hit-layer node not found');
    await page.locator(`#preview-content .preview-hit-layer .pv-el[data-origin-id="${detailId}"][data-row-index="0"]`).click({ position: { x: 5, y: 5 } });
    await page.waitForTimeout(150);
    const detailBox = await page.evaluate(() => {
      const box = document.querySelector('#preview-content .preview-selection-layer .sel-box');
      return box ? box.getBoundingClientRect() : null;
    });
    const detailRender = await page.evaluate(({ id }) => {
      const row = document.querySelector('#preview-content .preview-render-layer .cr-detail-row[data-row="0"]');
      const detIdx = DS.elements.filter((e) => e.sectionId === 's-det').findIndex((e) => e.id === id);
      return row ? row.querySelector(`[data-el-index="${detIdx}"]`)?.getBoundingClientRect() : null;
    }, { id: detailId });
    assert.ok(detailRender, 'detail row 0 real render node not found');
    assert.ok(detailBox, 'detail row 0 selection box not found');
    assert.ok(Math.abs(detailBox.top - detailRender.top) <= DRIFT_TOLERANCE_PX, `detail row 0 selection: Y drift ${Math.abs(detailBox.top - detailRender.top).toFixed(2)}px`);

    // --- Footer: the exact reported repro, "Forma de Pago" (rf-pay-desc) ---
    await selectByOriginId(page, footerId);
    const footerSelection = await getRectsForElement(page, { id: footerId, sectionId: 's-rf', viaHover: false });
    assertNoDrift(footerSelection, 'footer selection (Forma de Pago)');

    await page.mouse.move(0, 0);
    await hoverByOriginId(page, footerId);
    const footerHover = await getRectsForElement(page, { id: footerId, sectionId: 's-rf', viaHover: true });
    assertNoDrift(footerHover, 'footer hover (Forma de Pago)');
  } finally {
    await browser.close();
    await server.stop();
  }
});

test('LIVE: footer selection box still tracks the real element at zoom 400%', { timeout: 60000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page } = await launchRuntimePage(server.baseUrl);
  try {
    await openFactura(page);
    await enterPreview(page);
    await page.waitForTimeout(400);
    await setZoom(page, 4.0);
    await page.waitForTimeout(300);

    await selectByOriginId(page, 'rf-pay-desc');
    const rects = await getRectsForElement(page, { id: 'rf-pay-desc', sectionId: 's-rf', viaHover: false });
    assertNoDrift(rects, 'footer selection at zoom 400%');
  } finally {
    await browser.close();
    await server.stop();
  }
});
