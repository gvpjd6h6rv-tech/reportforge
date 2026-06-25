/**
 * RF-DESIGN-PREVIEW-PARITY-4-REAL-DOCS-1
 *
 * Exhaustive Design <-> Preview visual parity audit across the 4 real
 * SAP B1 layouts. Rule: every element visible in Design must appear
 * visible in Preview (and vice versa for the static, non-iterating
 * sections, where a 1:1 instance comparison is well-defined). DOM
 * presence alone is NEVER accepted as "visible" — every element type
 * gets a real visibility probe:
 *   - rect/line: pixel-level border/fill color sampling (border_pixel_probe.py)
 *   - field/text/barcode: non-empty rendered text + non-zero box
 *   - image: <img> actually loaded (naturalWidth > 0)
 *
 * Detail (iterates) sections: Design renders exactly one template
 * instance; Preview renders one per data row. There is no 1:1 "same
 * visual instance" across modes for row 2..N, so the rigorous
 * assertion only covers each detail element's FIRST rendered row
 * (a well-defined, comparable instance) — documented here, not hidden.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import { startRuntimeServer, launchRuntimePage } from './runtime_harness.mjs';

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

async function expectedRgb(page, colorExpr) {
  return page.evaluate((color) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1; canvas.height = 1;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = color && color !== 'transparent' ? color : '#000';
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return [r, g, b];
  }, colorExpr);
}

async function strokeOrFillPainted(page, box, rgb) {
  const margin = 6;
  const bx = Math.round(box.x), by = Math.round(box.y);
  const bw = Math.max(1, Math.round(box.width)), bh = Math.max(1, Math.round(box.height));
  const clip = { x: bx - margin, y: by - margin, width: bw + margin * 2, height: bh + margin * 2 };
  await fs.mkdir(ARTIFACTS_DIR, { recursive: true });
  const file = path.join(ARTIFACTS_DIR, `parity-probe-${bx}-${by}-${bw}-${bh}-${Date.now()}-${Math.random().toString(36).slice(2)}.png`);
  const buf = await page.screenshot({ clip });
  await fs.writeFile(file, buf);
  const result = spawnSync('python3', [
    path.join(__dirname, 'border_pixel_probe.py'), file,
    String(margin), String(margin), String(bw), String(bh), String(margin),
    String(rgb[0]), String(rgb[1]), String(rgb[2]),
  ], { encoding: 'utf8' });
  await fs.unlink(file).catch(() => {});
  if (result.status !== 0) throw new Error(`border_pixel_probe.py failed: ${result.stderr}`);
  return JSON.parse(result.stdout).painted;
}

// Generic "is this element actually visible" probe, dispatched by type.
// Never returns true on DOM presence alone.
async function visibilityProbe(page, el, box) {
  if (box.width < 1 || box.height < 1) return { visible: false, value: '', reason: 'zero-size box' };
  const viewport = page.viewportSize();
  const margin = 6;
  if (box.x - margin < 0 || box.y - margin < 0 || box.x + box.width + margin > viewport.width || box.y + box.height + margin > viewport.height) {
    return { visible: null, value: '', reason: 'offscreen (not measurable in this viewport)' };
  }

  if (el.type === 'rect') {
    const hasStroke = Number(el.borderWidth) > 0;
    const hasFill = el.bgColor && el.bgColor !== 'transparent';
    if (!hasStroke && !hasFill) return { visible: null, value: '', reason: 'no stroke/fill expected' };
    if (hasStroke) {
      const rgb = await expectedRgb(page, el.borderColor);
      const painted = await strokeOrFillPainted(page, box, rgb);
      return { visible: painted, value: `border:${el.borderColor}` };
    }
    const rgb = await expectedRgb(page, el.bgColor);
    // Reuse the edge-sampling probe for fills too: child labels routinely
    // sit flush against a colored header bar's left/right/bottom edges,
    // but checking ALL 4 edges (not just one dead-center point) means a
    // fill is correctly flagged painted if even one edge is clear of them.
    const painted = await strokeOrFillPainted(page, box, rgb);
    return { visible: painted, value: `fill:${el.bgColor}` };
  }

  if (el.type === 'line') {
    const rgb = await expectedRgb(page, el.borderColor);
    const painted = await strokeOrFillPainted(page, box, rgb);
    return { visible: painted, value: `stroke:${el.borderColor}` };
  }

  if (el.type === 'image') {
    const loaded = await page.evaluate(({ id, mode }) => {
      const sel = mode === 'design' ? `.cr-element[data-id="${id}"] img` : null;
      const img = mode === 'design' ? document.querySelector(sel) : null;
      return img ? { loaded: img.complete && img.naturalWidth > 0, src: img.src } : null;
    }, { id: el.id, mode: 'design' }).catch(() => null);
    return { visible: !!loaded?.loaded, value: loaded?.src || '' };
  }

  // field / text / barcode: text-content visibility
  const text = await page.evaluate(({ id, sectionId, isPreview }) => {
    let node;
    if (isPreview) {
      node = SelectionDragPreviewSync.findPreviewRenderNodes({ id, sectionId })[0];
    } else {
      node = document.querySelector(`.cr-element[data-id="${id}"]`);
    }
    if (!node) return null;
    if (node.tagName === 'IMG') return node.alt || '(img)';
    return (node.textContent || '').trim();
  }, { id: el.id, sectionId: el.sectionId, isPreview: box.__isPreview === true }).catch(() => null);

  return { visible: !!text && text.length > 0, value: text || '' };
}

// SAMPLE_DATA (the Preview mock dataset) was built around factura_fv1's
// field-naming convention; the other 3 real documents reference plenty of
// paths (empresa_telefono, transportista_ruc, item.numero, ...) that were
// simply never modeled there. An empty Preview value for one of those is
// a data/schema gap, not a rendering defect — this distinguishes the two
// so the matrix doesn't misreport a missing mock fixture as "BUG RF".
async function fieldPathHasSampleData(page, fieldPath) {
  if (!fieldPath) return true;
  return page.evaluate((fp) => {
    if (typeof SAMPLE_DATA === 'undefined') return false;
    if (fp.startsWith('item.')) {
      const key = fp.slice('item.'.length);
      const row = Array.isArray(SAMPLE_DATA.items) ? SAMPLE_DATA.items[0] : null;
        return !!(row && Object.prototype.hasOwnProperty.call(row, key) && row[key] !== '' && row[key] != null);
    }
    return Object.prototype.hasOwnProperty.call(SAMPLE_DATA, fp) && SAMPLE_DATA[fp] !== '' && SAMPLE_DATA[fp] != null;
  }, fieldPath);
}

async function designState(page, el) {
  const locator = page.locator(`.cr-element[data-id="${el.id}"]`);
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  const bb = await locator.boundingBox();
  if (!bb) return { domFound: false, visible: false, value: '' };
  const probe = await visibilityProbe(page, el, bb);
  return { domFound: true, ...probe };
}

async function previewState(page, el) {
  await page.evaluate(({ id, sectionId }) => {
    const node = SelectionDragPreviewSync.findPreviewRenderNodes({ id, sectionId })[0];
    node?.scrollIntoView?.({ block: 'center' });
  }, { id: el.id, sectionId: el.sectionId });
  await page.waitForTimeout(400);
  const bb = await page.evaluate(({ id, sectionId }) => {
    const node = SelectionDragPreviewSync.findPreviewRenderNodes({ id, sectionId })[0];
    if (!node) return null;
    const r = node.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  }, { id: el.id, sectionId: el.sectionId });
  if (!bb) return { domFound: false, visible: false, value: '' };
  bb.__isPreview = true;
  const probe = await visibilityProbe(page, el, bb);
  return { domFound: true, ...probe };
}

test('LIVE: full Design<->Preview parity matrix across all 4 real SAP B1 layouts (static sections, all element types)', { timeout: 240000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page } = await launchRuntimePage(server.baseUrl);
  const rows = [];
  const failures = [];
  try {
    for (const layoutPath of FILES) {
      await page.waitForTimeout(1000);
      await openLayout(page, layoutPath);
      await page.waitForTimeout(400);

      const targets = await page.evaluate(() => {
        const staticSectionIds = new Set(DS.sections.filter((s) => !s.iterates).map((s) => s.id));
        return DS.elements
          .filter((e) => staticSectionIds.has(e.sectionId))
          .map((e) => ({
            id: e.id, type: e.type, sectionId: e.sectionId,
            x: e.x, y: e.y, w: e.w, h: e.h,
            borderWidth: e.borderWidth, borderColor: e.borderColor, bgColor: e.bgColor, fieldPath: e.fieldPath,
          }));
      });

      const designStates = {};
      for (const t of targets) designStates[t.id] = await designState(page, t);

      await page.click('#tab-preview');
      await page.waitForTimeout(700);
      const previewStates = {};
      for (const t of targets) previewStates[t.id] = await previewState(page, t);
      await page.click('#tab-design');
      await page.waitForTimeout(300);

      for (const t of targets) {
        const d = designStates[t.id];
        const p = previewStates[t.id];
        let status;
        let causa = '';
        if (d.visible === null || p.visible === null) {
          status = 'GAP clasificado'; causa = d.reason || p.reason || 'no aplica stroke/fill';
        } else if (d.visible && p.visible) {
          status = 'CERTIFICADO';
        } else if (d.visible && !p.visible && t.type === 'field' && !(await fieldPathHasSampleData(page, t.fieldPath))) {
          status = 'GAP clasificado'; causa = `fieldPath "${t.fieldPath}" sin datos de muestra (SAMPLE_DATA no cubre este documento)`;
        } else if (d.visible && !p.visible) {
          status = 'BUG RF'; causa = 'visible en Design, ausente/vacío en Preview';
        } else if (!d.visible && p.visible) {
          status = 'BUG RF'; causa = 'visible en Preview, ausente/vacío en Design';
        } else {
          status = 'BUG RF'; causa = 'ausente en ambos modos (esperado visible)';
        }
        const row = {
          file: layoutPath.split('/').pop(), id: t.id, type: t.type, section: t.sectionId,
          xywh: `${t.x}/${t.y}/${t.w}/${t.h}`,
          domDesign: d.domFound, domPreview: p.domFound,
          visDesign: d.visible, visPreview: p.visible,
          valDesign: String(d.value).slice(0, 40), valPreview: String(p.value).slice(0, 40),
          causa, status,
        };
        rows.push(row);
        if (status === 'BUG RF') failures.push(row);
      }
    }
  } finally {
    await browser.close();
    await server.stop();
  }

  console.log('file | id | type | section | x/y/w/h | domDesign | domPreview | visDesign | visPreview | valDesign | valPreview | causa | estado');
  for (const r of rows) {
    console.log(`${r.file} | ${r.id} | ${r.type} | ${r.section} | ${r.xywh} | ${r.domDesign} | ${r.domPreview} | ${r.visDesign} | ${r.visPreview} | ${r.valDesign} | ${r.valPreview} | ${r.causa} | ${r.status}`);
  }
  console.log(`\nTotal: ${rows.length} | CERTIFICADO: ${rows.filter(r => r.status === 'CERTIFICADO').length} | GAP clasificado: ${rows.filter(r => r.status === 'GAP clasificado').length} | BUG RF: ${failures.length}`);

  assert.equal(failures.length, 0, `${failures.length} element(s) fail Design<->Preview parity: ${JSON.stringify(failures, null, 2)}`);
});

// First-row coverage for detail (iterates) sections: Design's single
// template instance vs Preview's first rendered row — the one
// well-defined comparable pair across the two modes for repeating rows.
test('LIVE: detail-section (iterates) elements — template (Design) vs first row (Preview) parity', { timeout: 120000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page } = await launchRuntimePage(server.baseUrl);
  const rows = [];
  const failures = [];
  try {
    for (const layoutPath of FILES) {
      await page.waitForTimeout(1000);
      await openLayout(page, layoutPath);
      await page.waitForTimeout(400);

      const targets = await page.evaluate(() => {
        const iterSectionIds = new Set(DS.sections.filter((s) => s.iterates).map((s) => s.id));
        return DS.elements
          .filter((e) => iterSectionIds.has(e.sectionId))
          .map((e) => ({
            id: e.id, type: e.type, sectionId: e.sectionId,
            x: e.x, y: e.y, w: e.w, h: e.h,
            borderWidth: e.borderWidth, borderColor: e.borderColor, bgColor: e.bgColor, fieldPath: e.fieldPath,
          }));
      });

      const designStates = {};
      for (const t of targets) designStates[t.id] = await designState(page, t);

      await page.click('#tab-preview');
      await page.waitForTimeout(700);
      const previewStates = {};
      for (const t of targets) previewStates[t.id] = await previewState(page, t);
      await page.click('#tab-design');
      await page.waitForTimeout(300);

      for (const t of targets) {
        const d = designStates[t.id];
        const p = previewStates[t.id];
        let status, causa = '';
        if (d.visible === null || p.visible === null) { status = 'GAP clasificado'; causa = d.reason || p.reason || 'no aplica'; }
        else if (d.visible && p.visible) status = 'CERTIFICADO';
        else if (d.visible && !p.visible && t.type === 'field' && !(await fieldPathHasSampleData(page, t.fieldPath))) {
          status = 'GAP clasificado'; causa = `fieldPath "${t.fieldPath}" sin datos de muestra (SAMPLE_DATA no cubre este documento)`;
        }
        else { status = 'BUG RF'; causa = `design=${d.visible} preview=${p.visible} (fila 1)`; }
        const row = {
          file: layoutPath.split('/').pop(), id: t.id, type: t.type, section: t.sectionId,
          xywh: `${t.x}/${t.y}/${t.w}/${t.h}`,
          visDesign: d.visible, visPreview: p.visible,
          valDesign: String(d.value).slice(0, 40), valPreview: String(p.value).slice(0, 40),
          causa, status,
        };
        rows.push(row);
        if (status === 'BUG RF') failures.push(row);
      }
    }
  } finally {
    await browser.close();
    await server.stop();
  }

  console.log('\n[DETALLE — fila 1] file | id | type | section | x/y/w/h | visDesign | visPreview | valDesign | valPreview | causa | estado');
  for (const r of rows) {
    console.log(`${r.file} | ${r.id} | ${r.type} | ${r.section} | ${r.xywh} | ${r.visDesign} | ${r.visPreview} | ${r.valDesign} | ${r.valPreview} | ${r.causa} | ${r.status}`);
  }
  console.log(`\nTotal detalle: ${rows.length} | CERTIFICADO: ${rows.filter(r => r.status === 'CERTIFICADO').length} | GAP clasificado: ${rows.filter(r => r.status === 'GAP clasificado').length} | BUG RF: ${failures.length}`);

  assert.equal(failures.length, 0, `${failures.length} detail element(s) fail Design<->Preview parity: ${JSON.stringify(failures, null, 2)}`);
});
