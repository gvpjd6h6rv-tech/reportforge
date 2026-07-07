#!/usr/bin/env node
// rf_thickness_raster_probe.mjs — RF-PREVIEW-THIN-OVERLAY-1 raster verification.
//
// Why this exists: RfBboxInkDiagnostic.js's THICKNESS SCAN can only read
// declared/computed CSS from inside the page — it can prove the CSS SAYS
// "0.125px" and still be completely wrong about what got painted. Verified
// live (raw getImageData pixel dumps, not heuristics) two DIFFERENT browser
// behaviors depending on which CSS property draws the stroke:
//
//  - outline-width (used by .sel-box / .preview-hover-box via
//    PreviewOverlayStyle.overlayBoxStyle): Chromium's computed style FLOORS
//    any declared value below 1px to exactly "1px" — confirmed via
//    getComputedStyle AND via raw pixels (a "0.125px" outline painted
//    exactly 1 device px at zoom=1 and exactly 4 device px at zoom=4,
//    identical to an unfixed flat 1px outline). The floor happens in LOCAL
//    (pre-transform) space, so the preview stage's transform:scale(zoom)
//    then scales that already-floored 1px right back up. BROWSER_PIXEL_FLOOR.
//
//  - height/width (used by .selection-guide-h/-v via
//    SelectionOverlayPreviewLayers.selectionGuideThickness): getComputedStyle
//    correctly reports the sub-pixel value (e.g. "0.125px" at zoom=4, not
//    floored), and raw pixels show a near-hairline band (1-2 device px,
//    closer to the true target than the outline case, though not perfectly
//    zoom-invariant due to sub-pixel edge positioning/anti-aliasing).
//
// Method: screenshot a crop around each overlay element, reload that PNG
// into an in-page <canvas> (Chromium decodes PNG natively — no Node-side
// image library needed), then scan pixel rows/columns with getImageData()
// for a TIGHT color match (not a loose blend heuristic — verified live that
// a tight threshold correctly isolates the stroke from nearby document ink).
//
// deviceScaleFactor is pinned to 1 so "screenshot pixels" == "CSS px"
// directly.
//
// Usage: node tools/diagnostics/rf-bbox-ink/rf_thickness_raster_probe.mjs
// Env:   RF_LIVE_URL (default http://127.0.0.1:5001)
//
// Does NOT touch element_style_helpers.py, PDF, document ink, layout model,
// #10.15 geometry, or governance thresholds — read-only diagnostic.

import { chromium } from 'playwright';

const BASE_URL = process.env.RF_LIVE_URL || 'http://127.0.0.1:5001';
const SCAN = 14; // px scanned on each side of the expected edge position
const TIGHT_DIST = 40; // tight color-distance tolerance — isolates the real stroke from nearby content

const COLORS = {
  selection: [0, 102, 204],   // #0066CC
  hover: [240, 128, 0],       // #F08000
  guide: [255, 32, 32],       // rgba(255,32,32,.9) alpha-blended over content — matched via alpha-aware distance below
};

function colorDistance(a, b) {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
}

// Alpha-aware: the guide is rgba(255,32,32,.9) painted OVER whatever content
// sits beneath it, so the rendered pixel is a blend, not the raw color.
// A pixel "counts" if it is closer to the 90%-blended-toward-red direction
// than to a neutral gray/background — i.e. red channel high, green/blue low
// relative to red, which is robust regardless of the exact background.
function looksLikeGuideRed([r, g, b]) {
  return r > 180 && r - g > 60 && r - b > 60;
}

async function screenshotToImageData(page, clip) {
  const buf = await page.screenshot({ clip });
  const b64 = buf.toString('base64');
  return page.evaluate(async ({ b64, w, h }) => {
    const img = new Image();
    const loaded = new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; });
    img.src = `data:image/png;base64,${b64}`;
    await loaded;
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const { data } = ctx.getImageData(0, 0, w, h);
    const rows = [];
    for (let y = 0; y < h; y++) {
      const row = [];
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        row.push([data[i], data[i + 1], data[i + 2], data[i + 3]]);
      }
      rows.push(row);
    }
    return rows;
  }, { b64, w: Math.round(clip.width), h: Math.round(clip.height) });
}

// Counts CONSECUTIVE tight-matching device pixels in a 1-D pixel line —
// this is "measuredVisualPx" for that edge, verified against raw dumps.
function countBand(line, targetRgb) {
  let best = 0, cur = 0, firstIdx = -1, bestStart = -1, curStart = -1;
  line.forEach(([r, g, b, a], i) => {
    const match = a > 0 && colorDistance([r, g, b], targetRgb) <= TIGHT_DIST;
    if (match) {
      if (cur === 0) curStart = i;
      cur += 1;
      if (firstIdx < 0) firstIdx = i;
    } else {
      if (cur > best) { best = cur; bestStart = curStart; }
      cur = 0;
    }
  });
  if (cur > best) { best = cur; bestStart = curStart; }
  return { measuredVisualPx: best, firstMatchIndex: bestStart };
}

function countGuideBand(line) {
  let best = 0, cur = 0, bestStart = -1, curStart = -1;
  line.forEach(([r, g, b], i) => {
    const match = looksLikeGuideRed([r, g, b]);
    if (match) {
      if (cur === 0) curStart = i;
      cur += 1;
    } else {
      if (cur > best) { best = cur; bestStart = curStart; }
      cur = 0;
    }
  });
  if (cur > best) { best = cur; bestStart = curStart; }
  return { measuredVisualPx: best, firstMatchIndex: bestStart };
}

// Measures the TOP edge only (reliable for wide elements that may extend
// past the viewport on left/right — top/bottom are the edges the user's
// screenshots actually complained about, and avoid the off-screen-clip
// artifact a full 4-side scan hits on section-wide elements).
async function measureTopEdge(page, rect, targetRgb) {
  const cx = Math.round(Math.min(Math.max(rect.left + 20, rect.left + rect.width / 2), rect.left + rect.width - 5));
  const clip = { x: Math.max(0, cx - 1), y: Math.max(0, Math.round(rect.top - SCAN)), width: 2, height: SCAN * 2 };
  const rows = await screenshotToImageData(page, clip);
  const col = rows.map((row) => row[0]);
  const band = countBand(col, targetRgb);
  return { clip, column: col, ...band };
}

async function measureGuideBand(page, rect) {
  const isHorizontal = rect.width > rect.height;
  const cx = isHorizontal ? Math.round(Math.min(rect.left + 40, rect.right - 5)) : Math.round(rect.left);
  const cy = isHorizontal ? Math.round(rect.top) : Math.round(Math.min(rect.top + 40, rect.bottom - 5));
  const clip = isHorizontal
    ? { x: Math.max(0, cx - 1), y: Math.max(0, cy - SCAN), width: 2, height: SCAN * 2 }
    : { x: Math.max(0, cx - SCAN), y: Math.max(0, cy - 1), width: SCAN * 2, height: 2 };
  const rows = await screenshotToImageData(page, clip);
  const line = isHorizontal ? rows.map((row) => row[0]) : rows[0];
  const band = countGuideBand(line);
  return { clip, orientation: isHorizontal ? 'h' : 'v', line, ...band };
}

function classifyOutlineLike(domStatus, raster) {
  if (domStatus === 'CSS_OVERRIDDEN' || domStatus === 'CACHE_OR_SERVER_STALE' || domStatus === 'ELEMENT_NOT_FOUND') return domStatus;
  if (raster.measuredVisualPx === 0) return 'CSS_NOT_APPLIED';
  if (raster.measuredVisualPx >= 1 && raster.measuredVisualPx <= 1.4) return 'THICKNESS_OK'; // ~1 device px hairline, the practical floor on this display
  return 'BROWSER_PIXEL_FLOOR'; // >1 device px growing with zoom = the declared sub-px value was floored, then scaled
}

async function selectSmallElement(page, { maxWidth = 300, maxHeight = 40 } = {}) {
  const els = page.locator('.preview-hit-layer [data-origin-id]');
  const count = await els.count();
  for (let i = 0; i < count; i++) {
    const b = await els.nth(i).boundingBox();
    if (b && b.width <= maxWidth && b.width >= 20 && b.height <= maxHeight) return els.nth(i);
  }
  return els.nth(0);
}

async function run() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1200 }, deviceScaleFactor: 1 });
  const report = { baseUrl: BASE_URL, generatedAt: new Date().toISOString(), zoomResults: [] };

  await page.goto(BASE_URL);
  await page.waitForTimeout(400);

  const ptitle = await page.locator('.panel-title').first().boundingBox();
  await page.mouse.click(ptitle.x + 10, ptitle.y + ptitle.height / 2);
  await page.mouse.click(ptitle.x + 10, ptitle.y + ptitle.height / 2);
  await page.mouse.click(ptitle.x + 10, ptitle.y + ptitle.height / 2);
  await page.waitForTimeout(600);
  const diagReady = await page.evaluate(() => !!(window.RfBboxInkDiagnostic && typeof window.RfBboxInkDiagnostic.thicknessScan === 'function'));
  if (!diagReady) {
    console.error('RfBboxInkDiagnostic did not load — CACHE_OR_SERVER_STALE. Aborting.');
    await browser.close();
    process.exit(1);
  }

  await page.locator('#tab-preview').click();
  await page.waitForTimeout(500);

  for (const zoomPct of [100, 400]) {
    const zoom = zoomPct / 100;
    await page.evaluate((z) => { if (typeof PreviewZoomEngine !== 'undefined') PreviewZoomEngine.set(z); }, zoom);
    await page.waitForTimeout(400);

    const selEl = await selectSmallElement(page);
    await selEl.scrollIntoViewIfNeeded();
    await page.waitForTimeout(150);
    const selBox = await selEl.boundingBox();
    await page.mouse.click(selBox.x + selBox.width / 2, selBox.y + selBox.height / 2);
    await page.waitForTimeout(250);

    const domScan = await page.evaluate(() => window.RfBboxInkDiagnostic.thicknessScan());
    const result = { zoomPct, zoom, expectedCssWidth: domScan.expectedCssWidth, domScan, raster: {} };

    const selRect = await page.evaluate(() => {
      const el = document.querySelector('.preview-selection-layer .sel-box, #handles-layer .sel-box');
      return el ? el.getBoundingClientRect().toJSON() : null;
    });
    if (selRect && selRect.top > SCAN) {
      const m = await measureTopEdge(page, selRect, COLORS.selection);
      result.raster.selectionBoxTopEdge = { ...m, status: classifyOutlineLike(domScan.selectionBox.status, m) };
    }

    // hover a different, small element
    const hovEl = await selectSmallElement(page, { maxWidth: 250, maxHeight: 30 });
    await hovEl.scrollIntoViewIfNeeded();
    await page.waitForTimeout(150);
    const hovBox = await hovEl.boundingBox();
    await page.mouse.move(hovBox.x + hovBox.width / 2, hovBox.y + hovBox.height / 2);
    await page.waitForTimeout(250);
    const hovRect = await page.evaluate(() => {
      const el = document.querySelector('.preview-hover-box');
      return el ? el.getBoundingClientRect().toJSON() : null;
    });
    if (hovRect && hovRect.top > SCAN) {
      const m = await measureTopEdge(page, hovRect, COLORS.hover);
      const hovDomScan = await page.evaluate(() => window.RfBboxInkDiagnostic.thicknessScan());
      result.raster.hoverBoxTopEdge = { ...m, status: classifyOutlineLike(hovDomScan.hoverBox.status, m) };
    }

    // guide lines only render during an active drag (CR-PARITY-1)
    await page.mouse.move(selBox.x + selBox.width / 2, selBox.y + selBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(selBox.x + selBox.width / 2 + 15, selBox.y + selBox.height / 2 + 10, { steps: 5 });
    await page.waitForTimeout(200);
    const guideRect = await page.evaluate(() => {
      const el = document.querySelector('.selection-guide-h');
      return el ? el.getBoundingClientRect().toJSON() : null;
    });
    if (guideRect && guideRect.top > SCAN) {
      const m = await measureGuideBand(page, guideRect);
      result.raster.guideLineH = {
        ...m,
        status: m.measuredVisualPx === 0 ? 'CSS_NOT_APPLIED'
          : (m.measuredVisualPx <= 2 ? 'THICKNESS_OK' : 'BROWSER_PIXEL_FLOOR'),
      };
    }
    await page.mouse.up();

    report.zoomResults.push(result);
  }

  await browser.close();
  console.log(JSON.stringify(report, null, 2));

  const rows = report.zoomResults.flatMap((r) =>
    Object.entries(r.raster).map(([k, v]) => `${r.zoomPct}% ${k}: measuredVisualPx=${v.measuredVisualPx} status=${v.status}`));
  console.error('\n--- SUMMARY ---\n' + rows.join('\n'));
}

run().catch((err) => { console.error(err); process.exit(1); });
