/**
 * RF-BARCODE-RESIZE-ALIGNMENT-PARITY-1 — Bug 2: the toolbar "Alinear
 * izquierda / Centrar / Alinear derecha" buttons (#btn-al/#btn-ac/#btn-ar,
 * FormatEngine.applyFormat('align', ...) — same buttons confirmed to work
 * for text/field) had no visible effect on a selected barcode element.
 *
 * Root cause (confirmed live, not hypothesized):
 *   - The buttons correctly set el.align on ANY selected element type —
 *     FormatEngine.applyFormat is fully generic and never branches on
 *     el.type. The bug was never in the command or in selection state.
 *   - The bug was entirely in the renderer:
 *     core/render/engines/element_renderers.py render_barcode() never read
 *     el.align at all, and barcode_renderer.py's SVG generators
 *     (_svg_code128b / _svg_qr_placeholder) hardcoded the human-readable
 *     label to `x="{w/2}" text-anchor="middle"` unconditionally — so
 *     clicking any of the three buttons updated DS state but the server-
 *     rendered barcode never moved.
 *
 * This test asserts the rendered <text> label's x/text-anchor actually
 * changes between left/center/right for a barcode, the same way a text
 * element's computed text-align actually changes (control case).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  startRuntimeServer,
  launchRuntimePage,
  enterPreview,
} from './runtime_harness.mjs';

async function clickAlign(page, btnId) {
  await page.click(`#${btnId}`);
  await page.waitForTimeout(80);
}

test('LIVE: align left/center/right buttons move the barcode label, not just el.align state', { timeout: 60000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page } = await launchRuntimePage(server.baseUrl);
  try {
    const id = await page.evaluate(() => {
      const el = mkEl('barcode', 's-ph', 40, 4, 200, 40, { barcodeType: 'code128', content: 'RF-TEST-1234', showText: true });
      DS.setElements([...DS.elements, el], 'test.insertBarcode');
      DS.clearSelectionState('test');
      DS.addSelection(el.id, 'test');
      return el.id;
    });

    const readLabel = () => page.evaluate(() => {
      const text = document.querySelector('#preview-content .preview-render-layer .cr-barcode svg text');
      return text ? { x: parseFloat(text.getAttribute('x')), anchor: text.getAttribute('text-anchor') } : null;
    });

    await enterPreview(page);
    await page.waitForTimeout(300);

    await clickAlign(page, 'btn-al');
    const left = await readLabel();
    assert.ok(left, 'barcode <text> label not found (align-left)');
    assert.equal(left.anchor, 'start', 'align-left must anchor the barcode label to the start (left)');

    await clickAlign(page, 'btn-ac');
    const center = await readLabel();
    assert.equal(center.anchor, 'middle', 'align-center must anchor the barcode label to the middle');

    await clickAlign(page, 'btn-ar');
    const right = await readLabel();
    assert.equal(right.anchor, 'end', 'align-right must anchor the barcode label to the end (right)');

    // The label must actually move across the three states, not just the
    // anchor keyword with an unchanged effective position.
    assert.ok(left.x < center.x, `align-left x (${left.x}) must be left of align-center x (${center.x})`);
    assert.ok(center.x < right.x, `align-center x (${center.x}) must be left of align-right x (${right.x})`);

    const elAlign = await page.evaluate((id) => DS.getElementById(id).align, id);
    assert.equal(elAlign, 'right', 'el.align must reflect the last clicked button');
  } finally {
    await browser.close();
    await server.stop();
  }
});

test('LIVE: align left/center/right still works for text and field elements (no regression)', { timeout: 60000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page } = await launchRuntimePage(server.baseUrl);
  try {
    const ids = await page.evaluate(() => {
      const t = mkEl('text', 's-ph', 40, 4, 200, 16, { content: 'hola mundo' });
      const f = mkEl('field', 's-ph', 40, 24, 200, 16, { fieldPath: '_special.report_name' });
      DS.setElements([...DS.elements, t, f], 'test.insertTextField');
      _canonicalCanvasWriter().renderElement(t);
      _canonicalCanvasWriter().renderElement(f);
      return { t: t.id, f: f.id };
    });

    for (const id of [ids.t, ids.f]) {
      await page.evaluate((id) => { DS.clearSelectionState('test'); DS.addSelection(id, 'test'); }, id);
      await clickAlign(page, 'btn-ar');
      const computed = await page.evaluate((id) => {
        const div = document.querySelector(`.cr-element[data-id="${id}"]`);
        return div ? getComputedStyle(div).textAlign : null;
      }, id);
      assert.equal(computed, 'right', `align-right must still set computed text-align on element ${id}`);
    }
  } finally {
    await browser.close();
    await server.stop();
  }
});
