/**
 * RF-DESIGN-RECT-BORDER-PAINT-1
 *
 * Reported bug: rh-fiscal-box (factura_fv1.json, "FACTURA ELECTRÓNICA"
 * area) exists in the JSON and in the Design DOM — hovering it shows the
 * orange hit-test outline, computed border style even looked plausible —
 * but its black border was never actually PAINTED on screen in Design.
 * The same element's border IS visible in Preview. A DOM-presence check
 * alone is not sufficient evidence of "visible" — this test samples real
 * pixel colors along the box's 4 edges in an actual screenshot.
 *
 * Root cause (confirmed live): factura_fv1.json's rects omit
 * "borderStyle" (only borderColor/borderWidth are present). Elements
 * created in-app go through DocumentState.mkEl(), which defaults
 * borderStyle to 'solid'. Elements loaded from an EXTERNAL JSON
 * (CommandRuntimeFile.js's _cloneElement) were passed through verbatim —
 * borderStyle stayed undefined. CanvasLayoutElements.js's _setBorder()
 * then built `div.style.border = "2px undefined #111111"` — invalid CSS,
 * silently dropped by the browser (computed border stayed "0px none"),
 * while the box's dimensions/hit-test still worked fine (those don't
 * depend on a border existing). Preview was unaffected because the
 * Python loader (layout_loader.py) already defaults borderStyle to
 * "solid" at load time. Fix: CommandRuntimeFile.js's _cloneElement() now
 * merges the same defaults mkEl() applies onto any loaded element.
 *
 * This test extends across all 4 real SAP B1 layouts and reports a full
 * id | type | section | DOM | visual Design | visual Preview | status
 * table — "visible" only counts if a real screenshot pixel sample along
 * the box's edges is meaningfully darker than its interior.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import { startRuntimeServer, launchRuntimePage, setZoom } from './runtime_harness.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ARTIFACTS_DIR = path.join(__dirname, '.artifacts');

const FILES = [
  'factura_fv1.json',
  'factura_fv2.json',
  'guia_remision_fv1.json',
  'guia_remision_fv2.json',
].map((f) => `/home/mimi/Escritorio/sap_b1_linux/reportforge_layouts/${f}`);

async function openLayout(page, layoutPath) {
  await page.evaluate(() => { delete window.showOpenFilePicker; });
  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.locator('button.tb-icon[data-action="open"]').click();
  const chooser = await fileChooserPromise;
  await chooser.setFiles(layoutPath);
  await page.waitForTimeout(500);
}

// Screenshots the element's own box PLUS a margin of surrounding context,
// then asks border_pixel_probe.py whether a continuous line of pixels
// matching the EXPECTED border color (the element's own declared
// borderColor — trustworthy regardless of whether borderWidth/Style
// actually rendered, which is exactly the bug class under test) runs
// along one of the box's 4 edges — via a small Python/Pillow helper
// (mirrors compare_png_tolerance.py's pattern of shelling out to Python
// for real pixel decoding). Real layouts use non-black borders too
// (e.g. #888 gray), so a generic "is it dark" heuristic isn't enough.
async function samplePixels(page, box, targetRgb) {
  const margin = 6;
  const bx = Math.round(box.x), by = Math.round(box.y);
  const bw = Math.max(1, Math.round(box.width)), bh = Math.max(1, Math.round(box.height));
  const clip = { x: bx - margin, y: by - margin, width: bw + margin * 2, height: bh + margin * 2 };
  await fs.mkdir(ARTIFACTS_DIR, { recursive: true });
  const file = path.join(ARTIFACTS_DIR, `border-probe-${bx}-${by}-${bw}-${bh}-${Date.now()}-${Math.random().toString(36).slice(2)}.png`);
  const buf = await page.screenshot({ clip });
  await fs.writeFile(file, buf);
  const result = spawnSync('python3', [
    path.join(__dirname, 'border_pixel_probe.py'), file,
    String(margin), String(margin), String(bw), String(bh), String(margin),
    String(targetRgb[0]), String(targetRgb[1]), String(targetRgb[2]),
  ], { encoding: 'utf8' });
  await fs.unlink(file).catch(() => {});
  if (result.status !== 0) throw new Error(`border_pixel_probe.py failed: ${result.stderr}`);
  return JSON.parse(result.stdout);
}

// Resolves the element's own DECLARED borderColor (the data model's
// source of truth, not a derived computed style) to an [r,g,b] triple,
// via an offscreen canvas (browsers normalize any valid CSS color
// through 2D canvas fillStyle round-tripping).
async function expectedBorderRgb(page, id) {
  return page.evaluate((id) => {
    const el = DS.getElementById(id);
    const color = el.borderColor && el.borderColor !== 'transparent' ? el.borderColor : '#000';
    const canvas = document.createElement('canvas');
    canvas.width = 1; canvas.height = 1;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return [r, g, b];
  }, id);
}

async function visualBorderState(page, id, sectionId, mode) {
  const selector = mode === 'design'
    ? `.cr-element[data-id="${id}"]`
    : null;
  let box;
  if (mode === 'design') {
    const locator = page.locator(selector);
    await locator.scrollIntoViewIfNeeded().catch(() => {});
    box = await locator.boundingBox();
  } else {
    await page.evaluate(({ id, sectionId }) => {
      const el = DS.getElementById(id);
      const node = SelectionDragPreviewSync.findPreviewRenderNodes({ id, sectionId: el.sectionId })[0];
      node?.scrollIntoView?.({ block: 'center' });
    }, { id, sectionId });
    await page.waitForTimeout(400);
    box = await page.evaluate(({ id, sectionId }) => {
      const el = DS.getElementById(id);
      const node = SelectionDragPreviewSync.findPreviewRenderNodes({ id, sectionId: el.sectionId })[0];
      if (!node) return null;
      const r = node.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    }, { id, sectionId });
  }
  if (!box || box.width < 1 || box.height < 1) return { domFound: !!box, visuallyPainted: false };
  const margin = 6;
  const viewport = page.viewportSize();
  if (box.x - margin < 0 || box.y - margin < 0 || box.x + box.width + margin > viewport.width || box.y + box.height + margin > viewport.height) {
    return { domFound: true, visuallyPainted: false, offscreen: true };
  }
  const targetRgb = await expectedBorderRgb(page, id);
  const pixels = await samplePixels(page, box, targetRgb);
  return { domFound: true, visuallyPainted: pixels.painted, pixels, targetRgb };
}

test('LIVE: rh-fiscal-box border is visually painted at the pixel level in Design (factura_fv1.json) — RED before fix, GREEN after', { timeout: 60000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page } = await launchRuntimePage(server.baseUrl);
  try {
    await openLayout(page, FILES[0]);
    await page.waitForTimeout(300);

    const state = await visualBorderState(page, 'rh-fiscal-box', 's-rh', 'design');
    assert.equal(state.domFound, true, 'rh-fiscal-box must exist in Design DOM');
    assert.equal(
      state.visuallyPainted,
      true,
      `rh-fiscal-box border must be VISUALLY PAINTED in Design (pixel sample), not just present in the DOM — got pixels: ${JSON.stringify(state.pixels)}`,
    );
  } finally {
    await browser.close();
    await server.stop();
  }
});

test('LIVE: rh-fiscal-box border visual paint matches between Design and Preview', { timeout: 60000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page } = await launchRuntimePage(server.baseUrl);
  try {
    await openLayout(page, FILES[0]);
    await page.waitForTimeout(300);
    const designState = await visualBorderState(page, 'rh-fiscal-box', 's-rh', 'design');

    await page.click('#tab-preview');
    await page.waitForTimeout(500);
    const previewState = await visualBorderState(page, 'rh-fiscal-box', 's-rh', 'preview');

    assert.equal(designState.visuallyPainted, true, 'Design must paint the border');
    assert.equal(previewState.visuallyPainted, true, 'Preview must paint the border');
  } finally {
    await browser.close();
    await server.stop();
  }
});

// Scoped to STATIC sections (rh/ph/rf/pf) only. A detail (iterates) section
// repeats its template element once per data row — Design renders exactly
// one (the template), Preview renders N (one per row) — there is no single
// well-defined "the same visual instance" to compare 1:1 between modes, so
// per-row pixel comparison there is inherently ambiguous, not a meaningful
// regression signal. DOM-existence parity for those is already covered by
// preview_anomaly_probe-style checks elsewhere in this suite; this test's
// job is the pixel-paint signal for the non-repeating, single-instance case.
test('LIVE: full visual-paint audit matrix for rect/line across all 4 real SAP B1 layouts (static sections)', { timeout: 180000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page } = await launchRuntimePage(server.baseUrl);
  const rows = [];
  const failures = [];
  try {
    for (const layoutPath of FILES) {
      await page.waitForTimeout(1200);
      await openLayout(page, layoutPath);
      await page.waitForTimeout(400);

      const targets = await page.evaluate(() => {
        const staticSectionIds = new Set(DS.sections.filter((s) => !s.iterates).map((s) => s.id));
        return DS.elements
          .filter((e) => (e.type === 'rect' || e.type === 'line') && staticSectionIds.has(e.sectionId))
          .map((e) => ({ id: e.id, type: e.type, sectionId: e.sectionId, borderWidth: e.borderWidth, lineWidth: e.lineWidth }));
      });

      // Pass 1: capture every target's Design state while still in Design
      // (no tab-switching per element — that's what made earlier runs flaky).
      const designStates = {};
      for (const t of targets) {
        designStates[t.id] = await visualBorderState(page, t.id, t.sectionId, 'design');
      }

      // Pass 2: switch to Preview ONCE, let it fully settle, then capture all.
      await page.click('#tab-preview');
      await page.waitForTimeout(700);
      const previewStates = {};
      for (const t of targets) {
        previewStates[t.id] = await visualBorderState(page, t.id, t.sectionId, 'preview');
      }
      await page.click('#tab-design');
      await page.waitForTimeout(300);

      for (const t of targets) {
        const hasVisibleStroke = t.type === 'rect' ? Number(t.borderWidth) > 0 : Number(t.lineWidth ?? 1) > 0;
        const designState = designStates[t.id];
        const previewState = previewStates[t.id];
        const status = !hasVisibleStroke
          ? 'no-stroke-expected'
          : (designState.visuallyPainted && previewState.visuallyPainted) ? 'OK'
          : !designState.visuallyPainted && previewState.visuallyPainted ? 'BUG: Design not painted'
          : !previewState.visuallyPainted && designState.visuallyPainted ? 'BUG: Preview not painted'
          : 'BUG: neither painted';

        rows.push({
          file: layoutPath.split('/').pop(), id: t.id, type: t.type, sectionId: t.sectionId,
          domDesign: designState.domFound, visualDesign: designState.visuallyPainted,
          domPreview: previewState.domFound, visualPreview: previewState.visuallyPainted,
          status,
        });
        if (hasVisibleStroke && status !== 'OK') failures.push(rows[rows.length - 1]);
      }
    }
  } finally {
    await browser.close();
    await server.stop();
  }

  console.log('id | type | section | domDesign | visualDesign | domPreview | visualPreview | status');
  for (const r of rows) {
    console.log(`${r.file} | ${r.id} | ${r.type} | ${r.sectionId} | ${r.domDesign} | ${r.visualDesign} | ${r.domPreview} | ${r.visualPreview} | ${r.status}`);
  }

  assert.equal(
    failures.length,
    0,
    `${failures.length} rect/line element(s) in a static section with a real stroke are not visually painted somewhere: ${JSON.stringify(failures, null, 2)}`,
  );
});
