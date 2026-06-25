/**
 * RF-PRODUCTION-CERTIFICATION-DESIGN-PREVIEW-1
 *
 * Found auditing real SAP B1 layouts (guia_remision_fv1.json): 4 line
 * elements (g-ph-v1, g-ph-v2, g-dv1, g-dv2) are tall/narrow (w=1, h=14-16)
 * — clearly meant to be vertical dividers — but their JSON omits `lineDir`
 * entirely. Both Design (CanvasLayoutElements.js::_buildLine) and the real
 * Preview renderer (element_renderers.py::render_line) defaulted
 * unconditionally to horizontal when lineDir wasn't exactly "v", drawing a
 * 1px-wide horizontal stroke inside a 1px-wide box — visually
 * imperceptible in both modes, even though the element technically exists
 * in the DOM with correct bounding dimensions (so a naive
 * "is the element present" check would miss this).
 *
 * Fix: infer orientation from aspect ratio (h>w → vertical) when lineDir
 * is falsy, in both renderers.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startRuntimeServer, launchRuntimePage, enterPreview } from './runtime_harness.mjs';

const LAYOUT_PATH = '/home/mimi/Escritorio/sap_b1_linux/reportforge_layouts/guia_remision_fv1.json';
const AFFECTED_IDS = ['g-ph-v1', 'g-ph-v2', 'g-dv1', 'g-dv2'];

async function openLayout(page, layoutPath) {
  await page.evaluate(() => { delete window.showOpenFilePicker; });
  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.locator('button.tb-icon[data-action="open"]').click();
  const chooser = await fileChooserPromise;
  await chooser.setFiles(layoutPath);
  await page.waitForTimeout(500);
}

test('LIVE: vertical dividers with missing lineDir render vertically (not as an invisible sliver) in Design', { timeout: 60000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page } = await launchRuntimePage(server.baseUrl);
  try {
    await openLayout(page, LAYOUT_PATH);
    const jsonOk = await page.evaluate((ids) => ids.every((id) => {
      const el = DS.getElementById(id);
      return el && el.type === 'line' && !el.lineDir && el.h > el.w;
    }), AFFECTED_IDS);
    assert.ok(jsonOk, 'fixture assumption changed: expected these to be tall/narrow lines with no lineDir');

    for (const id of AFFECTED_IDS) {
      const svgAttrs = await page.evaluate((id) => {
        const div = document.querySelector(`.cr-element[data-id="${id}"]`);
        const l = div ? div.querySelector('line') : null;
        return l ? { x1: l.getAttribute('x1'), y1: l.getAttribute('y1'), x2: l.getAttribute('x2'), y2: l.getAttribute('y2') } : null;
      }, id);
      assert.ok(svgAttrs, `${id}: line SVG not found in Design`);
      assert.equal(svgAttrs.x1, svgAttrs.x2, `${id}: must render as a VERTICAL line (x1===x2), got ${JSON.stringify(svgAttrs)}`);
      assert.notEqual(svgAttrs.y1, svgAttrs.y2, `${id}: a vertical line must span real height (y1!==y2)`);
    }
  } finally {
    await browser.close();
    await server.stop();
  }
});

test('LIVE: vertical dividers with missing lineDir render vertically in the real Preview render layer', { timeout: 60000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page } = await launchRuntimePage(server.baseUrl);
  try {
    await openLayout(page, LAYOUT_PATH);
    await enterPreview(page);
    await page.waitForTimeout(400);

    for (const id of AFFECTED_IDS) {
      const dims = await page.evaluate((id) => {
        const el = DS.getElementById(id);
        const nodes = SelectionDragPreviewSync.findPreviewRenderNodes({ id, sectionId: el.sectionId });
        const div = nodes[0];
        if (!div) return null;
        const cs = getComputedStyle(div);
        return { width: cs.width, height: cs.height, borderLeft: cs.borderLeftWidth, borderTop: cs.borderTopWidth };
      }, id);
      assert.ok(dims, `${id}: real Preview render node not found`);
      assert.notEqual(dims.borderLeft, '0px', `${id}: real Preview node must draw a LEFT border (vertical stroke), got ${JSON.stringify(dims)}`);
      assert.equal(dims.borderTop, '0px', `${id}: must not also draw a horizontal border, got ${JSON.stringify(dims)}`);
    }
  } finally {
    await browser.close();
    await server.stop();
  }
});
