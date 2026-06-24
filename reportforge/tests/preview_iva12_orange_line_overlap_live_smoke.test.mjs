/**
 * LIVE SMOKE — RF-PARITY-AUDIT-1: orange divider line must not paint over
 * "IVA 12%:" (or the black divider over "VALOR TOTAL:") in Preview mode.
 *
 * Why a brand-new file, not the existing orange_line_iva12_overlap_regression
 * test: that test measured only getBoundingClientRect() geometry — line.bottom
 * vs text.top. That geometry was ALWAYS mathematically clean (verified with
 * diff=0.0 against expected position, computed in a single page state with
 * no cross-call drift) in BOTH Design and Preview, at every zoom level. Yet
 * a real screenshot of the exact same, geometrically-correct page showed the
 * line visibly crossing the text. The rect-based test was therefore a FALSE
 * NEGATIVE: it can never fail, because the bug is not a layout/geometry bug
 * — it is a paint-layer artifact. This test asserts on RASTER PIXELS
 * (screenshot -> canvas -> getImageData) in the gap between the line and the
 * text, which is the only way to actually catch it.
 *
 * Root cause (proven live, not hypothesis):
 * Preview's *visible* render layer (`.preview-render-layer`, populated by
 * the Python server's POST /designer-preview -> reportforge/core/render/
 * engines/element_renderers.py:render_line) drew horizontal/vertical
 * dividers as an SVG <line> inside a div, both with `overflow:visible`,
 * under the preview viewport's `transform:scale(zoom)` (#viewport,
 * confirmed via computed style: `matrix(zoom,0,0,zoom,0,0)`). Evidence
 * trail that ruled out every other explanation before landing on this one:
 *   - Geometry diff vs expected position (section.top + rawTop*zoom) was
 *     0.0 for every element in the row, in one self-consistent page state.
 *   - elementFromPoint() at the exact pixel band where the visible stroke
 *     appeared returned nothing from the render-layer (only the unrelated,
 *     deliberately-invisible `.preview-hit-layer` copy, which always wins
 *     hit-testing regardless of what's actually painted underneath it —
 *     this is also WHY hit-testing/rect-based tests can never catch this:
 *     they inspect the hit-layer, not the painted render-layer).
 *   - A full-subtree rect scan of `.preview-render-layer *` at that exact
 *     pixel band found zero elements whose box covered it.
 *   - Changing the line's `overflow` to `hidden` made the stroke vanish
 *     entirely (instead of clipping to a visible position), proving the
 *     SVG was being rasterized outside its own declared box, not merely
 *     bleeding past a clip edge.
 * Fix: reportforge/core/render/engines/element_renderers.py:render_line —
 * replaced the SVG <line> with a plain CSS border (border-top/border-left),
 * vertically/horizontally centered the same way the SVG's `mid = h/2`
 * convention did (still used, unchanged, by Design's
 * engines/CanvasLayoutElements.js:_buildLine, for design/preview parity of
 * the line's position) — a border has no sub-pixel raster-tile ambiguity.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  startRuntimeServer,
  launchRuntimePage,
  enterPreview,
  assertNoConsoleErrors,
} from './runtime_harness.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ARTIFACTS_DIR = path.join(__dirname, 'artifacts');

// Full diagnostic dump for every element whose rect falls in the band
// between two given rows — data-id, textContent, rect, z-index, section,
// type, border/color — exactly as required, so a contradiction (Playwright
// measures a gap but the screenshot shows ink) is debuggable from the test
// output alone, without re-deriving it by hand.
async function dumpBand(page, { fromY, toY, fromX, toX }) {
  return page.evaluate(({ fromY, toY, fromX, toX }) => {
    const all = [...document.querySelectorAll('.preview-render-layer *')];
    return all
      .map((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return null;
        const cs = getComputedStyle(el);
        const section = el.closest('.cr-section');
        return {
          tag: el.tagName,
          cls: el.className,
          dataElIndex: el.dataset.elIndex || null,
          textContent: el.textContent.trim().slice(0, 40),
          rect: { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height), bottom: Math.round(r.bottom) },
          zIndex: cs.zIndex,
          type: el.tagName === 'SVG' || el.tagName === 'LINE' ? el.tagName.toLowerCase() : (section ? section.dataset.stype : null),
          border: cs.border,
          borderTop: cs.borderTop,
          color: cs.color,
          backgroundColor: cs.backgroundColor,
          sectionId: section ? section.dataset.section : null,
        };
      })
      .filter(Boolean)
      .filter((e) => e.rect.bottom >= fromY && e.rect.top <= toY && e.rect.left < toX && e.rect.left + e.rect.width > fromX);
  }, { fromY, toY, fromX, toX });
}

// Pixel-level scan: for each row, total dark/orange pixel counts AND the
// longest CONTIGUOUS run of each. The longest-run distinction matters: real
// letter glyphs ("IVA 12%:", "VALOR TOTAL:") are short words with gaps
// between letters, so they never produce one unbroken stroke spanning most
// of the row's width — but a phantom divider line bleeding into the text
// row does. This is raster truth, independent of any DOM rect, and is what
// actually catches a bug that paints INSIDE an element's own box (not just
// in the gap before it) — see file header: the bug paints inside the text
// element's box, not in the empty gap, so the gap alone is not enough.
async function scanInkRows(page, clip) {
  const buf = await page.screenshot({ clip });
  const b64 = buf.toString('base64');
  const rows = await page.evaluate(async (b64) => {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = 'data:image/png;base64,' + b64; });
    const canvas = document.createElement('canvas');
    canvas.width = img.width; canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, img.width, img.height).data;
    function isInk(x, y, kind) {
      const i = (y * img.width + x) * 4;
      const [r, g, bl] = [data[i], data[i + 1], data[i + 2]];
      if (kind === 'dark') return r < 100 && g < 100 && bl < 100;
      return r > 150 && g > 50 && g < 140 && bl < 90; // orange-ish
    }
    function rowStats(y, kind) {
      let total = 0, run = 0, maxRun = 0;
      for (let x = 0; x < img.width; x++) {
        if (isInk(x, y, kind)) { total++; run++; maxRun = Math.max(maxRun, run); } else run = 0;
      }
      return { total, maxRun };
    }
    const out = [];
    for (let y = 0; y < img.height; y++) {
      const dark = rowStats(y, 'dark');
      const orange = rowStats(y, 'orange');
      out.push({ y, dark: dark.total, darkMaxRun: dark.maxRun, orange: orange.total, orangeMaxRun: orange.maxRun });
    }
    return out;
  }, b64);
  return { buf, rows, width: undefined };
}

async function setupPreviewAt200(page) {
  await page.setViewportSize({ width: 2400, height: 2400 });
  await page.waitForFunction(() => typeof DS !== 'undefined' && Array.isArray(DS.elements) && DS.elements.length > 0);
  await page.waitForTimeout(800);
  await enterPreview(page);
  await page.waitForTimeout(300);
  await page.evaluate(() => PreviewZoomEngine.set(2));
  await page.waitForTimeout(400);
}

// Locate, in the VISIBLE render-layer (not the invisible hit-layer, which
// would mask the bug — see file header), the exact text div and its
// immediately-preceding divider div, by text content, not by a guessed id,
// so this never measures the wrong element.
async function locateRow(page, exactText) {
  return page.evaluate((exactText) => {
    const pf = document.querySelector('.preview-render-layer .cr-section[data-stype="pf"]');
    if (!pf) return null;
    const children = [...pf.querySelectorAll(':scope > div')];
    const textEl = children.find((el) => el.textContent.trim() === exactText);
    if (!textEl) return null;
    const lineEl = textEl.previousElementSibling;
    const tr = textEl.getBoundingClientRect();
    const lr = lineEl ? lineEl.getBoundingClientRect() : null;
    return {
      text: { left: tr.left, top: tr.top, width: tr.width, height: tr.height, bottom: tr.bottom },
      line: lr ? { left: lr.left, top: lr.top, width: lr.width, height: lr.height, bottom: lr.bottom } : null,
    };
  }, exactText);
}

test('LIVE: Preview @ 200% — orange line above "IVA 12%:" must not paint ink into the text row (raster, not rect)', { timeout: 60000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl);

  try {
    await setupPreviewAt200(page);

    const row = await locateRow(page, 'IVA 12%:');
    assert.ok(row, 'must find the "IVA 12%:" text div in the visible render-layer, and its preceding divider div');
    assert.ok(row.line, 'must find a divider div immediately preceding "IVA 12%:" in DOM order');

    const rectGap = row.text.top - row.line.bottom;
    // Diagnostic dump (full, as required) of every element in the row band.
    const band = await dumpBand(page, {
      fromY: row.line.top - 10, toY: row.text.bottom + 5,
      fromX: row.text.left - 300, toX: row.text.left + row.text.width + 20,
    });
    console.log('IVA-12 row diagnostic dump:', JSON.stringify(band, null, 2));
    console.log(`IVA-12 row: rect gap (line.bottom -> text.top) = ${rectGap.toFixed(1)}px`);

    // Raster truth: scan the FULL band from the line's own top to the
    // text's own bottom — not just the empty gap between them. The bug
    // this test exists to catch paints a phantom stroke INSIDE the text
    // element's own box (proven live: a full-tree rect scan found zero
    // elements covering that pixel band, yet the screenshot showed ink
    // there) — a gap-only scan is a false negative, exactly like the
    // rect-only test before it.
    const clip = {
      x: Math.max(0, Math.round(row.text.left - 250)),
      y: Math.max(0, Math.round(row.line.top)),
      width: 700,
      height: Math.max(1, Math.round(row.text.bottom - row.line.top)),
    };
    await fs.mkdir(ARTIFACTS_DIR, { recursive: true });
    const { buf, rows } = await scanInkRows(page, clip);
    await fs.writeFile(path.join(ARTIFACTS_DIR, 'preview_iva12_gap_band.png'), buf);

    // Phantom-line signature: a row strictly INSIDE the text's own vertical
    // span (so it can't just be the divider's own stroke) with a
    // CONTIGUOUS ink run spanning more than half the scan width. Real
    // glyphs ("IVA 12%:") are short words with gaps between letters and
    // never produce one unbroken run that wide.
    const textTopRel = row.text.top - clip.y;
    const inkThreshold = row.text.width * 0.6;
    const phantomRows = rows.filter((r) => r.y >= textTopRel && (r.dark > inkThreshold || r.orange > inkThreshold || r.darkMaxRun > inkThreshold || r.orangeMaxRun > inkThreshold));
    if (phantomRows.length > 0) {
      // Contradiction case: rect math says clean geometry, but pixels show
      // a phantom stroke. Per the audit rules, dump everything needed to
      // debug it without re-running anything by hand, and fail loudly.
      console.log('CONTRADICTION: phantom wide stroke detected inside the text row:', JSON.stringify(phantomRows));
      console.log('Full diagnostic band dump (data-id/textContent/rect/z-index/section/type/border-color):', JSON.stringify(band, null, 2));
    }
    assert.equal(
      phantomRows.length, 0,
      `Preview @200%: found a phantom wide ink stroke inside "IVA 12%:"'s own box ` +
      `(rect gap above it was ${rectGap.toFixed(1)}px — clean — so this is a paint-layer bug, not a layout bug) — ` +
      `rows=${JSON.stringify(phantomRows)}, screenshot saved to reportforge/tests/artifacts/preview_iva12_gap_band.png`
    );
    assert.ok(rectGap > 0, `Preview @200%: rect gap above "IVA 12%:" must be > 0px, got ${rectGap}px`);

    await assertNoConsoleErrors(consoleErrors, 'preview IVA12 orange line overlap live smoke');
  } finally {
    await browser.close();
    await server.stop();
  }
});

test('LIVE: Preview @ 200% — divider line above "VALOR TOTAL:" must not paint ink into the text row (raster, not rect)', { timeout: 60000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl);

  try {
    await setupPreviewAt200(page);

    const row = await locateRow(page, 'VALOR TOTAL:');
    assert.ok(row, 'must find the "VALOR TOTAL:" text div in the visible render-layer, and its preceding divider div');
    assert.ok(row.line, 'must find a divider div immediately preceding "VALOR TOTAL:" in DOM order');

    const rectGap = row.text.top - row.line.bottom;
    const band = await dumpBand(page, {
      fromY: row.line.top - 10, toY: row.text.bottom + 5,
      fromX: row.text.left - 300, toX: row.text.left + row.text.width + 20,
    });
    console.log('VALOR-TOTAL row diagnostic dump:', JSON.stringify(band, null, 2));
    console.log(`VALOR-TOTAL row: rect gap (line.bottom -> text.top) = ${rectGap.toFixed(1)}px`);

    // See the IVA-12 test above for why this scans the FULL band (line.top
    // to text.bottom), not just the empty gap: the bug paints inside the
    // text element's own box, which a gap-only scan would miss entirely.
    const clip = {
      x: Math.max(0, Math.round(row.text.left - 250)),
      y: Math.max(0, Math.round(row.line.top)),
      width: 700,
      height: Math.max(1, Math.round(row.text.bottom - row.line.top)),
    };
    await fs.mkdir(ARTIFACTS_DIR, { recursive: true });
    const { buf, rows } = await scanInkRows(page, clip);
    await fs.writeFile(path.join(ARTIFACTS_DIR, 'preview_valortotal_gap_band.png'), buf);

    const textTopRel = row.text.top - clip.y;
    const inkThreshold = row.text.width * 0.6;
    const phantomRows = rows.filter((r) => r.y >= textTopRel && (r.dark > inkThreshold || r.orange > inkThreshold || r.darkMaxRun > inkThreshold || r.orangeMaxRun > inkThreshold));
    if (phantomRows.length > 0) {
      console.log('CONTRADICTION: phantom wide stroke detected inside the text row:', JSON.stringify(phantomRows));
      console.log('Full diagnostic band dump:', JSON.stringify(band, null, 2));
    }
    assert.equal(
      phantomRows.length, 0,
      `Preview @200%: found a phantom wide ink stroke inside "VALOR TOTAL:"'s own box ` +
      `(rect gap above it was ${rectGap.toFixed(1)}px — clean) — rows=${JSON.stringify(phantomRows)}, ` +
      `screenshot saved to reportforge/tests/artifacts/preview_valortotal_gap_band.png`
    );
    assert.ok(rectGap > 0, `Preview @200%: rect gap above "VALOR TOTAL:" must be > 0px, got ${rectGap}px`);

    await assertNoConsoleErrors(consoleErrors, 'preview VALOR TOTAL line overlap live smoke');
  } finally {
    await browser.close();
    await server.stop();
  }
});

test('LIVE: Preview @ 200% — Design vs Preview gap parity above "IVA 12%:" (within 1px)', { timeout: 60000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl);

  try {
    await page.setViewportSize({ width: 2400, height: 2400 });
    await page.waitForFunction(() => typeof DS !== 'undefined' && Array.isArray(DS.elements) && DS.elements.length > 0);
    await page.waitForTimeout(800);

    const designRow = await page.evaluate(() => {
      const ivaText = [...document.querySelectorAll('.cr-element[data-id]')].find((el) => el.textContent.trim() === 'IVA 12%:');
      if (!ivaText) return null;
      const all = [...ivaText.parentElement.querySelectorAll('.cr-element[data-id]')];
      const idNum = parseInt(ivaText.dataset.id.replace(/\D/g, ''), 10);
      let lineEl = null, best = -Infinity;
      for (const el of all) {
        const n = parseInt((el.dataset.id || '').replace(/\D/g, ''), 10);
        if (!isNaN(n) && n < idNum && n > best) { best = n; lineEl = el; }
      }
      const tr = ivaText.getBoundingClientRect();
      const lr = lineEl ? lineEl.getBoundingClientRect() : null;
      return { textTop: tr.top, lineBottom: lr ? lr.bottom : null };
    });
    assert.ok(designRow && designRow.lineBottom != null, 'must find Design-mode line+text pair for "IVA 12%:"');
    const designGap = designRow.textTop - designRow.lineBottom;

    await setupPreviewAt200(page);
    const previewRow = await locateRow(page, 'IVA 12%:');
    assert.ok(previewRow && previewRow.line, 'must find Preview-mode line+text pair for "IVA 12%:"');
    const previewGap = previewRow.text.top - previewRow.line.bottom;

    console.log(`Design gap=${designGap.toFixed(1)}px (zoom=1), Preview gap=${previewGap.toFixed(1)}px (zoom=2)`);
    // Design ran at zoom=1, Preview at zoom=2 — normalize Preview's gap by /2
    // before comparing, since both encode the same model-space gap.
    const previewGapNormalized = previewGap / 2;
    assert.ok(
      Math.abs(previewGapNormalized - designGap) <= 1,
      `Design/Preview gap above "IVA 12%:" must match within 1px (model space) — design=${designGap.toFixed(1)}px, preview(normalized)=${previewGapNormalized.toFixed(1)}px`
    );

    await assertNoConsoleErrors(consoleErrors, 'design vs preview IVA12 gap parity live smoke');
  } finally {
    await browser.close();
    await server.stop();
  }
});
