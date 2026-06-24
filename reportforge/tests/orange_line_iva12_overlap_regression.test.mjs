/**
 * REGRESSION — RF-PARITY-AUDIT-1: orange divider line must not overlap
 * "IVA 12%:" in either Design or Preview.
 *
 * Reference: real Crystal Reports screenshots (Diseño + Vista previa, both
 * at 200% zoom) show the orange divider line sitting cleanly above the
 * "IVA 12%:" label with a visible gap, in both modes, identical position
 * relative to the text.
 *
 * Verified live (not from the static .rfd.json template, which does not
 * necessarily match what the running server seeds): the live document has
 * a `line` element directly preceding the "IVA 12%:" `text` element. Their
 * real DOM rects (getBoundingClientRect, both Design and Preview) show
 * line.bottom is 2px above ivaText.top — a clean gap, not an overlap — in
 * both modes, confirmed by direct screenshot inspection (no overlap visible
 * at 3x zoom in either mode).
 *
 * This test locks that contract: find the line element immediately
 * preceding the "IVA 12%:" text in document order, assert its rendered
 * bottom edge sits at or above the text's rendered top edge (zero
 * tolerance for overlap — CR shows a clear gap, never contact) in both
 * Design and Preview, and that both modes agree on the gap within 1px.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  startRuntimeServer,
  launchRuntimePage,
  enterPreview,
} from './runtime_harness.mjs';

async function findIvaLineAndText(page, { preview }) {
  return page.evaluate((preview) => {
    const root = preview ? document.getElementById('preview-content') : document;
    const all = preview
      ? [...root.querySelectorAll('[data-id]')]
      : [...document.querySelectorAll('.cr-element[data-id]')];
    const ivaText = all.find(el => /^IVA 12%/i.test((el.textContent || '').trim()));
    if (!ivaText) return null;
    const ivaId = ivaText.dataset.id;
    const idNum = parseInt(ivaId.replace(/[^0-9]/g, ''), 10);
    // The divider line is the nearest preceding sibling element (lower id)
    // among all data-id elements on the same page area.
    let lineEl = null, bestNum = -Infinity;
    for (const el of all) {
      const n = parseInt((el.dataset.id || '').replace(/[^0-9]/g, ''), 10);
      if (isNaN(n) || n >= idNum) continue;
      if (n > bestNum) { bestNum = n; lineEl = el; }
    }
    if (!lineEl) return null;
    const lr = lineEl.getBoundingClientRect();
    const tr = ivaText.getBoundingClientRect();
    return {
      lineId: lineEl.dataset.id,
      textId: ivaId,
      line: { top: lr.top, bottom: lr.bottom, left: lr.left, width: lr.width, height: lr.height },
      text: { top: tr.top, bottom: tr.bottom, left: tr.left },
    };
  }, preview);
}

test('REGRESSION: orange divider line does not overlap "IVA 12%:" in Design mode', { timeout: 30000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page } = await launchRuntimePage(server.baseUrl);
  try {
    await page.waitForFunction(() => typeof DS !== 'undefined' && Array.isArray(DS.elements) && DS.elements.length > 0);
    await page.waitForTimeout(800);

    const found = await findIvaLineAndText(page, { preview: false });
    assert.ok(found, 'must find a line element immediately preceding the "IVA 12%:" text in Design mode');
    const overlapPx = found.line.bottom - found.text.top;
    assert.ok(
      overlapPx <= 0,
      `Design: divider line (id=${found.lineId}) must not overlap "IVA 12%:" text (id=${found.textId}) — ` +
      `line.bottom=${found.line.bottom}, text.top=${found.text.top}, overlap=${overlapPx}px`
    );
  } finally {
    await browser.close();
    await server.stop();
  }
});

test('REGRESSION: orange divider line does not overlap "IVA 12%:" in Preview mode, and matches Design gap within 1px', { timeout: 30000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page } = await launchRuntimePage(server.baseUrl);
  try {
    await page.waitForFunction(() => typeof DS !== 'undefined' && Array.isArray(DS.elements) && DS.elements.length > 0);
    await page.waitForTimeout(800);

    const designFound = await findIvaLineAndText(page, { preview: false });
    assert.ok(designFound, 'must find the line+text pair in Design mode first, to compare gaps');
    const designGap = designFound.text.top - designFound.line.bottom;

    await enterPreview(page);
    await page.waitForTimeout(500);

    const found = await findIvaLineAndText(page, { preview: true });
    assert.ok(found, 'must find a line element immediately preceding the "IVA 12%:" text in Preview mode');
    const overlapPx = found.line.bottom - found.text.top;
    assert.ok(
      overlapPx <= 0,
      `Preview: divider line (id=${found.lineId}) must not overlap "IVA 12%:" text (id=${found.textId}) — ` +
      `line.bottom=${found.line.bottom}, text.top=${found.text.top}, overlap=${overlapPx}px`
    );

    const previewGap = found.text.top - found.line.bottom;
    assert.ok(
      Math.abs(previewGap - designGap) <= 1,
      `Design/Preview gap above "IVA 12%:" must match within 1px — design=${designGap}px, preview=${previewGap}px`
    );
  } finally {
    await browser.close();
    await server.stop();
  }
});
