/**
 * CR-HOVER-OUTLINE-PARITY-1 — raster visibility smoke (no computedStyle-only
 * false green).
 *
 * Reported manual smoke: Design shows the orange hover outline; Preview
 * does NOT, even though hover_outline_parity.test.mjs's Preview assertion
 * (`getComputedStyle(pvEl).outlineStyle === 'solid'`) passes. That test was
 * a false green: it only proved the CSS *declares* an outline on the
 * hit-layer node, never that the outline is actually painted on screen.
 *
 * This file proves visibility with real rasterized pixels (screenshot ->
 * canvas -> getImageData), not computed style, and independently dumps the
 * full diagnostic surface the audit asked for: elementFromPoint /
 * elementsFromPoint stack at the hover coordinate, and computedStyle of
 * .pv-el, .cr-element, .preview-hit-layer, .preview-render-layer and
 * #rf-debug-center-root, plus the ancestor effective-opacity chain (the
 * actual root cause candidate: an ancestor with opacity:0 composites its
 * entire subtree — including a "solid" outline — to fully transparent,
 * regardless of what computedStyle reports on the descendant itself).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  startRuntimeServer,
  launchRuntimePage,
  setZoom,
  enterPreview,
  exitPreview,
} from './runtime_harness.mjs';

const ORANGE_MARGIN = 4;

function isOrangeish(r, g, b) {
  return r > 180 && g > 70 && g < 180 && b < 90;
}

// Scans only the outer `margin`-px frame ring of the clip (where an
// outline-offset:0 hairline outline would paint), ignoring the interior —
// so interior text/background pixels never produce a false positive.
async function perimeterOrangeCount(page, rect, margin = ORANGE_MARGIN) {
  const clip = {
    x: Math.max(0, rect.x - margin),
    y: Math.max(0, rect.y - margin),
    width: rect.width + margin * 2,
    height: rect.height + margin * 2,
  };
  const buf = await page.screenshot({ clip });
  const b64 = buf.toString('base64');
  return page.evaluate(async ({ b64, margin }) => {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = 'data:image/png;base64,' + b64; });
    const canvas = document.createElement('canvas');
    canvas.width = img.width; canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, img.width, img.height).data;
    function isOrangeish(r, g, b) { return r > 180 && g > 70 && g < 180 && b < 90; }
    let count = 0;
    for (let y = 0; y < img.height; y++) {
      for (let x = 0; x < img.width; x++) {
        const inRing = x < margin || y < margin || x >= img.width - margin || y >= img.height - margin;
        if (!inRing) continue;
        const i = (y * img.width + x) * 4;
        if (isOrangeish(data[i], data[i + 1], data[i + 2])) count++;
      }
    }
    return count;
  }, { b64, margin });
}

async function effectiveOpacityChain(page, selector) {
  return page.evaluate((sel) => {
    const start = document.querySelector(sel);
    if (!start) return null;
    const chain = [];
    let node = start;
    let product = 1;
    while (node && node !== document.documentElement.parentNode) {
      const cs = getComputedStyle(node);
      const op = parseFloat(cs.opacity);
      product *= Number.isFinite(op) ? op : 1;
      chain.push({
        tag: node.tagName,
        id: node.id || null,
        className: typeof node.className === 'string' ? node.className : null,
        opacity: cs.opacity,
        overflow: cs.overflow,
        visibility: cs.visibility,
        display: cs.display,
      });
      node = node.parentElement;
    }
    return { product, chain };
  }, selector);
}

async function layerComputedStyles(page) {
  return page.evaluate(() => {
    function cs(sel) {
      const n = document.querySelector(sel);
      if (!n) return { sel, found: false };
      const c = getComputedStyle(n);
      return {
        sel, found: true,
        outlineStyle: c.outlineStyle, outlineColor: c.outlineColor, outlineWidth: c.outlineWidth,
        opacity: c.opacity, visibility: c.visibility, display: c.display,
        overflow: c.overflow, pointerEvents: c.pointerEvents, zIndex: c.zIndex,
      };
    }
    return {
      pv_el: cs('#preview-content .preview-hit-layer .pv-el'),
      cr_element: cs('#preview-content .cr-element'),
      preview_hit_layer: cs('.preview-hit-layer'),
      preview_render_layer: cs('.preview-render-layer'),
      rf_debug_center_root: cs('#rf-debug-center-root'),
    };
  });
}

test('LIVE RASTER: Design — hovering an element paints a visible orange ring (not just computedStyle)', { timeout: 60000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page } = await launchRuntimePage(server.baseUrl);
  try {
    await page.waitForFunction(() => typeof DS !== 'undefined' && Array.isArray(DS.elements) && DS.elements.length > 0);
    await page.waitForTimeout(500);
    await setZoom(page, 1);

    const rect = await page.evaluate(() => {
      const el = document.querySelector('.cr-element');
      const r = el.getBoundingClientRect();
      return { x: r.left, y: r.top, width: r.width, height: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
    });

    await page.mouse.move(5, 5);
    await page.waitForTimeout(50);
    const before = await perimeterOrangeCount(page, rect);

    await page.mouse.move(rect.cx, rect.cy);
    await page.waitForTimeout(80);
    const after = await perimeterOrangeCount(page, rect);

    assert.equal(before, 0, 'sanity: no orange pixels in the ring before hovering');
    assert.ok(after > 0, `Design must paint visible orange ring pixels on hover (raster), got ${after}`);
  } finally {
    await browser.close();
    await server.stop();
  }
});

test('LIVE RASTER: Preview — hovering a field must paint a visible orange ring on screen, not just set CSS outline on an invisible layer', { timeout: 60000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page } = await launchRuntimePage(server.baseUrl);
  try {
    await page.waitForFunction(() => typeof DS !== 'undefined' && Array.isArray(DS.elements) && DS.elements.length > 0);
    await page.waitForTimeout(500);
    await setZoom(page, 1);
    await enterPreview(page);
    await page.waitForTimeout(300);

    const target = await page.evaluate(() => {
      const el = document.querySelector('#preview-content .preview-hit-layer .pv-el');
      const r = el.getBoundingClientRect();
      return { id: el.dataset.id, rect: { x: r.left, y: r.top, width: r.width, height: r.height }, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
    });

    await page.mouse.move(5, 5);
    await page.waitForTimeout(50);
    const before = await perimeterOrangeCount(page, target.rect);

    await page.mouse.move(target.cx, target.cy);
    await page.waitForTimeout(80);
    const after = await perimeterOrangeCount(page, target.rect);

    // Diagnostic surface — always collected, printed on failure for triage.
    const elementFromPointStack = await page.evaluate(({ x, y }) => {
      return document.elementsFromPoint(x, y).map((n) => ({ tag: n.tagName, id: n.id || null, className: typeof n.className === 'string' ? n.className : null }));
    }, { x: target.rect.x + 2, y: target.rect.y + 2 });
    const opacityChain = await effectiveOpacityChain(page, `#preview-content .preview-hit-layer .pv-el[data-id="${target.id}"]`);
    const layerStyles = await layerComputedStyles(page);

    const diagnosis = [];
    if (layerStyles.pv_el.outlineStyle !== 'solid') diagnosis.push('outline not applied on .pv-el (computedStyle.outlineStyle != solid)');
    if (layerStyles.pv_el.outlineStyle === 'solid' && after === 0) diagnosis.push('outline applied per computedStyle but NOT visible in raster (covered or composited away)');
    if (opacityChain && opacityChain.product === 0) {
      const zeroAncestor = opacityChain.chain.find((n) => n.opacity === '0');
      diagnosis.push(`ancestor with opacity:0 swallows the outline: <${zeroAncestor?.tag} class="${zeroAncestor?.className}">`);
    }
    if (layerStyles.preview_hit_layer.pointerEvents === 'none') diagnosis.push('.preview-hit-layer has pointer-events:none (hover would never trigger at all)');
    if (layerStyles.preview_render_layer.overflow !== 'visible' && layerStyles.preview_render_layer.overflow !== 'hidden') diagnosis.push(`unexpected .preview-render-layer overflow: ${layerStyles.preview_render_layer.overflow}`);

    assert.equal(before, 0, 'sanity: no orange pixels in the ring before hovering');
    assert.ok(
      after > 0,
      [
        `Preview must paint a visible orange ring on hover (raster), got ${after} orange pixels.`,
        `Diagnosis: ${diagnosis.length ? diagnosis.join('; ') : '(none matched — inspect dump below)'}`,
        `elementsFromPoint stack: ${JSON.stringify(elementFromPointStack)}`,
        `opacity chain: ${JSON.stringify(opacityChain)}`,
        `layer computed styles: ${JSON.stringify(layerStyles)}`,
      ].join('\n'),
    );

    await exitPreview(page);
  } finally {
    await browser.close();
    await server.stop();
  }
});
