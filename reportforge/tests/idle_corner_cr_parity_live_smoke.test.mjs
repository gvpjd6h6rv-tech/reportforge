/**
 * LIVE SMOKE — CR-PARITY-1, Objective 2: idle (unselected) field corner marks.
 *
 * Crystal Reports draws a tiny corner mark on every unselected field
 * placeholder: 3px horizontal leg, 3px vertical leg, 1px thickness, pure
 * black — and it is CONSTANT at 100/200/400% document zoom (measured
 * directly off real Crystal Reports screenshots at all three zoom levels;
 * see conversation record — not a computed-style assumption).
 *
 * This test measures REAL RASTER PIXELS (screenshot -> canvas -> getImageData),
 * not computed CSS custom properties, because two earlier "fixes" to
 * .el-corner (designer/styles/components.css) both passed a computed-style
 * test while being visibly wrong on screen:
 *   1. border-top/border-left sized via calc(1px/var(--geo-zoom)) — any
 *      non-zero border-width below 1px floors to exactly 1 used CSS px in
 *      this engine (proven with a static, var-free repro), so it grew with
 *      zoom once amplified by #viewport's transform:scale(zoom): 2px -> 4px
 *      raster thickness at zoom 1 -> 4 instead of staying constant.
 *   2. background-gradient sized via calc(len/var(--geo-zoom)) avoided the
 *      border floor, but sub-CSS-pixel gradient sizes anti-alias away:
 *      raster luminance dropped from black to ~98/246 (barely visible) at
 *      zoom>=4, and the SSOT length token (5px) never matched CR's real 3px
 *      to begin with.
 *
 * Fix: designer/styles/components.css:116-173 — fixed INTEGER geometry
 * (3px box, 1px border, both literal — no calc() on any length) combined
 * with `transform: scale(calc(1 / var(--geo-zoom, 1)))` and a
 * transform-origin pinned to each corner's own anchor. The ancestor
 * #viewport's transform:scale(zoom) and this counter-transform compose to
 * net scale(1), so there is no fractional CSS length anywhere in the
 * pipeline — confirmed by isolated repro to stay exactly 3x3px/1px-thick/
 * fully-opaque (raster luminance 0) at zoom 1, 2 and 4.
 *
 * Also: opacity:.6 (pre-existing on .el-corner only, not shared with
 * .sel-box or .rf-guide) diluted the mark to luminance ~90-98 against the
 * cream/white field background instead of CR's pure black. Removed.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  startRuntimeServer,
  launchRuntimePage,
  setZoom,
  assertNoConsoleErrors,
} from './runtime_harness.mjs';

// Measured directly off real Crystal Reports raster screenshots at
// 100/200/400% zoom (two corner instances per level, identical in all
// three) — kept here only as the expected CONSTANT, not as CSS SSOT.
const EXPECTED_LEG_PX = 3;
const EXPECTED_THICK_PX = 1;
const EXPECTED_LUMINANCE = 0; // pure black

async function measureIdleCornerRaster(page) {
  const rect = await page.evaluate(() => {
    const corner = document.querySelector('.cr-element:not(.selected) > .el-corner.tl');
    if (!corner) return null;
    const r = corner.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  });
  if (!rect) return null;

  const pad = 4;
  const clip = {
    x: Math.max(0, Math.round(rect.left - pad)),
    y: Math.max(0, Math.round(rect.top - pad)),
    width: Math.round(rect.width + pad * 2),
    height: Math.round(rect.height + pad * 2),
  };
  const buf = await page.screenshot({ clip });
  const b64 = buf.toString('base64');

  // The corner's own rect top-left always lands at (pad, pad) in the crop —
  // flood-fill the connected dark region starting there, instead of a naive
  // global bbox, so a neighboring field's own corner mark (caught by the
  // padding margin, since fields sit close together) can't inflate the
  // measurement.
  return page.evaluate(async ({ b64, seedX, seedY }) => {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = 'data:image/png;base64,' + b64; });
    const canvas = document.createElement('canvas');
    canvas.width = img.width; canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, img.width, img.height).data;
    function lum(x, y) { const i = (y * img.width + x) * 4; return (data[i] + data[i + 1] + data[i + 2]) / 3; }
    const bg = lum(0, 0);
    let darkest = 255;
    for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) darkest = Math.min(darkest, lum(x, y));

    const isDark = (x, y) => x >= 0 && y >= 0 && x < img.width && y < img.height && (bg - lum(x, y)) > 100;
    const visited = new Set();
    const stack = [[seedX, seedY]];
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    while (stack.length) {
      const [x, y] = stack.pop();
      const key = x + ',' + y;
      if (visited.has(key)) continue;
      visited.add(key);
      if (!isDark(x, y)) continue;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    const found = isFinite(minX);
    return {
      bg, darkest,
      bboxWidth: found ? maxX - minX + 1 : 0,
      bboxHeight: found ? maxY - minY + 1 : 0,
    };
  }, { b64, seedX: pad, seedY: pad });
}

test('LIVE: idle field corner mark matches CR raster (3x3px, 1px thick, pure black) at 100/200/400% zoom', { timeout: 60000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl);

  try {
    await page.waitForFunction(() => typeof DS !== 'undefined' && Array.isArray(DS.elements) && DS.elements.length > 0);
    await page.waitForTimeout(800);

    for (const zoom of [1, 2, 4]) {
      await setZoom(page, zoom);
      await page.waitForTimeout(150);
      const m = await measureIdleCornerRaster(page);
      assert.ok(m, `zoom=${zoom}: an idle (unselected) .el-corner.tl must exist on the canvas`);

      assert.ok(
        Math.abs(m.bboxWidth - EXPECTED_LEG_PX) <= 1,
        `zoom=${zoom}: corner mark raster width must be ${EXPECTED_LEG_PX}px (CR-measured), got ${m.bboxWidth}px`
      );
      assert.ok(
        Math.abs(m.bboxHeight - EXPECTED_LEG_PX) <= 1,
        `zoom=${zoom}: corner mark raster height must be ${EXPECTED_LEG_PX}px (CR-measured), got ${m.bboxHeight}px`
      );
      assert.ok(
        m.darkest <= EXPECTED_LUMINANCE + 10,
        `zoom=${zoom}: corner mark must be pure black (CR luminance 0), got darkest pixel luminance ${m.darkest.toFixed(1)}`
      );
    }

    await assertNoConsoleErrors(consoleErrors, 'idle corner CR parity live smoke');
  } finally {
    await browser.close();
    await server.stop();
  }
});

test('LIVE: idle corner fix does not affect selection box or red alignment guides', { timeout: 60000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl);

  try {
    await page.waitForFunction(() => typeof DS !== 'undefined' && Array.isArray(DS.elements) && DS.elements.length > 0);
    await page.waitForTimeout(800);
    await setZoom(page, 1);

    const counts = await page.evaluate(() => ({
      selBox: document.querySelectorAll('#handles-layer .sel-box').length,
      guides: document.querySelectorAll('.rf-guide').length,
    }));
    assert.equal(counts.selBox, 0, 'no element selected yet, so no .sel-box should render');
    assert.equal(counts.guides, 0, 'no drag in progress, so no .rf-guide should render');

    await assertNoConsoleErrors(consoleErrors, 'idle corner fix regression check');
  } finally {
    await browser.close();
    await server.stop();
  }
});
