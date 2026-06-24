/**
 * RF-DESIGN-ZOOM400-SCROLLBAR-CR-PARITY-1
 *
 * Reported bug: at 400% zoom in Design mode, Crystal Reports leaves a
 * visible gap between the end of the canvas and the horizontal scrollbar;
 * RF's canvas runs flush into the scrollbar with zero gap. RF's scrollbars
 * are also much thinner than CR's classic, chunky ones.
 *
 * Root cause (confirmed live, not hypothesized):
 *   - engines/ZoomEngine.js's DesignZoomEngine._apply() set
 *     `vp.style.marginBottom = CFG.RULER_H + 'px'` — a FLAT, never-zoomed
 *     value — on #viewport, the SAME element that gets
 *     `transform: scale(z)`. CSS transforms are purely visual: the
 *     post-transform ink/paint overflow that a transformed descendant
 *     contributes to an `overflow:auto` ancestor's scrollHeight does NOT
 *     include trailing margin/padding reserved against the element's
 *     PRE-transform box. Proven live with getBoundingClientRect diffs at
 *     zoom 1/2/4: neither scaling the margin, nor padding-bottom on
 *     #workspace itself, nor a real sibling spacer div changed the actual
 *     visible gap at zoom>1 — #canvas-layer's bottom edge always ended up
 *     flush with #workspace's own bottom edge once scrolled to the end.
 *   - Fix: fold the gap INTO #viewport's own pre-transform height
 *     (`vp.style.height = cl.offsetHeight + CFG.RULER_H`) instead of
 *     margin/padding/siblings outside it — since it's now part of the
 *     SAME box being scaled, it scales proportionally with zoom exactly
 *     like the canvas itself, matching CR's gap growing visibly at higher
 *     zoom. Confirmed live: gap is exactly RULER_H*zoom px at zoom 1/2/4.
 *   - Scrollbar thickness: #workspace had no scrollbar styling at all
 *     (bare OS/browser default). Added `::-webkit-scrollbar` rules
 *     (17px, CR-like) for Chromium/WebKit browsers, where they reliably
 *     work, plus `scrollbar-color`/`scrollbar-width:auto` for Firefox.
 *     NOTE: Firefox's `scrollbar-width` CSS property only supports
 *     auto/thin/none — there is no standard way to make a Firefox NATIVE
 *     scrollbar thicker than "auto" without replacing it with a fully
 *     custom (non-native) scrollbar widget, which is out of scope for
 *     this minimal fix. This test verifies the gap (fully cross-browser,
 *     measurable) and that the CR-parity scrollbar CSS rules exist;
 *     pixel-thickness itself is only verifiable in Chromium, and headless
 *     Chromium specifically uses overlay scrollbars that reserve zero
 *     layout space regardless of any ::-webkit-scrollbar width — so this
 *     test does not assert on offsetWidth/clientWidth deltas.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startRuntimeServer, launchRuntimePage, setZoom } from './runtime_harness.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const LAYOUT_PATH = '/home/mimi/Escritorio/sap_b1_linux/reportforge_layouts/factura_fv1.json';

async function measureGapPx(page, zoom) {
  await setZoom(page, zoom);
  await page.waitForTimeout(600);
  await page.evaluate(() => { document.getElementById('workspace').scrollTop = 999999; });
  // #workspace has scroll-behavior:smooth, so the scrollTop assignment
  // above animates rather than landing instantly — needs a real wait, not
  // just a layout tick, or this reads a mid-animation (stale) position.
  await page.waitForTimeout(600);
  return page.evaluate(() => {
    const ws = document.getElementById('workspace');
    const cl = document.getElementById('canvas-layer');
    const wsRect = ws.getBoundingClientRect();
    const clRect = cl.getBoundingClientRect();
    return wsRect.bottom - clRect.bottom;
  });
}

test('LIVE: Design workspace leaves a CR-style gap below the canvas at zoom 100/200/400% (factura_fv1.json)', { timeout: 60000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page } = await launchRuntimePage(server.baseUrl);
  try {
    await page.evaluate(() => { delete window.showOpenFilePicker; });
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.locator('button.tb-icon[data-action="open"]').click();
    const chooser = await fileChooserPromise;
    await chooser.setFiles(LAYOUT_PATH);
    await page.waitForTimeout(500);

    const rulerH = await page.evaluate(() => CFG.RULER_H);

    const gap1 = await measureGapPx(page, 1.0);
    const gap2 = await measureGapPx(page, 2.0);
    const gap4 = await measureGapPx(page, 4.0);

    assert.ok(gap1 >= rulerH - 1, `zoom 100%: gap (${gap1}px) must be at least ~${rulerH}px`);
    assert.ok(
      Math.abs(gap2 - rulerH * 2) <= 1,
      `zoom 200%: gap (${gap2}px) must scale with zoom (expected ~${rulerH * 2}px) — RF must not run flush into the scrollbar like before this fix`,
    );
    assert.ok(
      Math.abs(gap4 - rulerH * 4) <= 1,
      `zoom 400%: gap (${gap4}px) must scale with zoom (expected ~${rulerH * 4}px) — this is the exact reported bug (RF showed 0px here before the fix)`,
    );
  } finally {
    await browser.close();
    await server.stop();
  }
});

test('CR-parity scrollbar styling rules exist for #workspace', () => {
  const css = fs.readFileSync(path.join(ROOT, 'designer/styles/canvas.css'), 'utf8');
  assert.match(css, /#workspace::-webkit-scrollbar\s*\{[^}]*width:\s*17px/, 'workspace must declare a CR-like (~17px) webkit scrollbar width');
  assert.match(css, /#workspace::-webkit-scrollbar\s*\{[^}]*height:\s*17px/, 'workspace must declare a CR-like (~17px) webkit scrollbar height');
  assert.match(css, /#workspace::-webkit-scrollbar-thumb/, 'workspace must style a visible scrollbar thumb');
  assert.match(css, /#workspace[^{]*\{[^}]*scrollbar-color:/s, 'workspace must set scrollbar-color for Firefox visibility');
});
