/**
 * LIVE SMOKE — CR-PARITY-1, Objective 1: selection corner ticks.
 *
 * Crystal Reports' selected-element corner mark is a tiny "L": short length,
 * hairline thickness, visually CONSTANT regardless of document zoom.
 *
 * Root cause (confirmed live, not by reading code alone): the corner ticks
 * are drawn via stacked CSS background gradients directly on .sel-box
 * (designer/styles/elements-selection.css:285-296) — NOT on .sel-handle
 * (which is fully invisible: background/border transparent, ::before/::after
 * display:none) and NOT on .el-corner (a separate, unrelated idle field
 * marker that hides on selection). .sel-box lives inside #handles-layer,
 * a descendant of #canvas-layer, which is inside #viewport's
 * transform:scale(z) — so any fixed-px CSS length on .sel-box scales
 * visually by z. Measured before the fix: a 5px/2px tick rendered as
 * 5/2px @ z=1, 10/4px @ z=2, 20/8px @ z=4 — exactly the "thick brackets
 * instead of tiny L" the user compared against the real Crystal Reports app.
 *
 * Fix: designer/styles/tokens.css (--rf-sel-corner-len: 5px SSOT,
 * --rf-sel-corner-thick: 1px SSOT) consumed in
 * designer/styles/elements-selection.css:283-284 as
 * calc(var(--rf-sel-corner-len)/var(--geo-zoom,1)) — counter-scaling by the
 * same --geo-zoom custom property #canvas-layer already maintains, so the
 * net effective on-screen size stays constant.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  startRuntimeServer,
  launchRuntimePage,
  setZoom,
  selectSingle,
  dragSelectedElement,
  resizeFromHandle,
  assertNoConsoleErrors,
} from './runtime_harness.mjs';

// Pre-scale (zoom=1) SSOT values, mirrored from designer/styles/tokens.css —
// kept here only as the expected CONSTANT, not as a second source of truth
// for the CSS itself.
const EXPECTED_TICK_LEN_PX = 5;
const EXPECTED_TICK_THICK_PX = 1;
const TOLERANCE_PX = 0.05;

async function measureCornerTick(page) {
  return page.evaluate(() => {
    const box = document.querySelector('.sel-box');
    if (!box) return null;
    const cs = getComputedStyle(box);
    const cssWidth = parseFloat(cs.width);
    const renderedWidth = box.getBoundingClientRect().width;
    const realScale = renderedWidth / cssWidth;
    // getComputedStyle never resolves a calc()-based custom property to a
    // pixel number (CSS spec: custom properties are substituted lazily at
    // var() use, not computed) — force resolution via a throwaway element
    // that uses the custom property on a real, computable property.
    const probe = document.createElement('div');
    probe.style.position = 'absolute';
    probe.style.visibility = 'hidden';
    probe.style.width = 'var(--rf-sel-corner-tick-len)';
    probe.style.height = 'var(--rf-sel-corner-tick-thick)';
    box.appendChild(probe);
    const probeCs = getComputedStyle(probe);
    const cssTickLen = parseFloat(probeCs.width);
    const cssTickThick = parseFloat(probeCs.height);
    probe.remove();
    return {
      geoZoom: parseFloat(cs.getPropertyValue('--geo-zoom')),
      realScale,
      effectiveTickLenPx: cssTickLen * realScale,
      effectiveTickThickPx: cssTickThick * realScale,
    };
  });
}

test('LIVE: selection corner tick stays CR-sized (tiny L, hairline) and stable at 100/200/400% zoom', { timeout: 60000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl);

  try {
    await page.waitForFunction(() => typeof DS !== 'undefined' && Array.isArray(DS.elements) && DS.elements.length > 0);
    await page.waitForTimeout(800);
    await selectSingle(page, 0);

    for (const zoom of [1, 2, 4]) {
      await setZoom(page, zoom);
      await page.waitForTimeout(150);
      const m = await measureCornerTick(page);
      assert.ok(m, `zoom=${zoom}: .sel-box must exist while selected`);
      assert.equal(m.geoZoom, zoom, `zoom=${zoom}: --geo-zoom must mirror the real zoom level`);
      assert.ok(
        Math.abs(m.realScale - zoom) < 0.01,
        `zoom=${zoom}: .sel-box's own real composited scale must equal the zoom level (sanity check on the measurement itself), got ${m.realScale}`
      );
      assert.ok(
        Math.abs(m.effectiveTickLenPx - EXPECTED_TICK_LEN_PX) < TOLERANCE_PX,
        `zoom=${zoom}: corner tick length must stay ${EXPECTED_TICK_LEN_PX}px on screen (CR-stable), got ${m.effectiveTickLenPx.toFixed(3)}px`
      );
      assert.ok(
        Math.abs(m.effectiveTickThickPx - EXPECTED_TICK_THICK_PX) < TOLERANCE_PX,
        `zoom=${zoom}: corner tick thickness must stay ${EXPECTED_TICK_THICK_PX}px (hairline) on screen, got ${m.effectiveTickThickPx.toFixed(3)}px`
      );
      // Adversarial: must NOT match the old, broken proportional-scale value
      // (tick * zoom), confirming this isn't accidentally still scaling.
      const brokenValue = EXPECTED_TICK_LEN_PX * zoom;
      if (zoom > 1) {
        assert.ok(
          Math.abs(m.effectiveTickLenPx - brokenValue) > TOLERANCE_PX,
          `zoom=${zoom}: must not match the old broken double-scaled value (${brokenValue}px)`
        );
      }
    }

    await assertNoConsoleErrors(consoleErrors, 'selection corner CR parity live smoke');
  } finally {
    await browser.close();
    await server.stop();
  }
});

test('LIVE: corner tick fix does not regress resize or drag', { timeout: 60000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl);

  try {
    await page.waitForFunction(() => typeof DS !== 'undefined' && Array.isArray(DS.elements) && DS.elements.length > 0);
    await page.waitForTimeout(800);
    await setZoom(page, 1);
    await selectSingle(page, 0);

    const before = await page.evaluate(() => {
      const el = DS.getElementById([...DS.selection][0]);
      return { x: el.x, y: el.y, w: el.w, h: el.h };
    });

    await dragSelectedElement(page, 15, 10);
    const afterDrag = await page.evaluate(() => {
      const el = DS.getElementById([...DS.selection][0]);
      return { x: el.x, y: el.y };
    });
    assert.ok(Math.abs(afterDrag.x - before.x - 15) < 0.5, 'drag must still move the element by the requested delta');
    assert.ok(Math.abs(afterDrag.y - before.y - 10) < 0.5, 'drag must still move the element by the requested delta');

    await resizeFromHandle(page, 'se', 10, 6);
    const afterResize = await page.evaluate(() => {
      const el = DS.getElementById([...DS.selection][0]);
      return { w: el.w, h: el.h };
    });
    assert.ok(afterResize.w > before.w, 'resize must still grow width');
    assert.ok(afterResize.h > before.h, 'resize must still grow height');

    const overlay = await page.evaluate(() => ({
      boxCount: document.querySelectorAll('#handles-layer .sel-box').length,
      handleCount: document.querySelectorAll('#handles-layer .sel-handle').length,
    }));
    assert.equal(overlay.boxCount, 1, 'selection box must still render after drag+resize');
    assert.equal(overlay.handleCount, 8, 'all 8 resize handles must still render after drag+resize');

    await assertNoConsoleErrors(consoleErrors, 'corner tick fix drag/resize regression check');
  } finally {
    await browser.close();
    await server.stop();
  }
});
