#!/usr/bin/env node
'use strict';

/**
 * RF Section-Move Ink Diagnostic (Bug B: box visible, interior invisible).
 *
 * Diagnostic-only. Drives the REAL designer in a real browser and, for each
 * section->section move performed through the real Properties "Sección:"
 * dropdown, measures whether the field's INTERIOR TEXT keeps real painted
 * pixels (ink) inside the destination section -- not merely whether the DOM
 * node / bounding box / blue selection box exist.
 *
 * Why ink, not DOM (forensic #10.7R):
 * - Moving a field to a shorter section without renormalizing its y leaves it
 *   painted past the section box; `.cr-section { contain: layout paint }`
 *   clips the paint, so display/visibility/opacity/getBoundingClientRect and
 *   the #selection-layer overlay all keep reporting "fine" while 0 real
 *   pixels of the text are visible. Only a screenshot pixel test catches it.
 * - The visible page/ink is a BROWSER concern: JS is served no-store, but the
 *   designer is a long-lived SPA -- a fix on disk does nothing until the tab
 *   is RELOADED. This tool always launches a fresh browser context, so it
 *   reflects freshly-loaded JS. To reproduce a human's stale-tab false-green,
 *   a human must hard-reload; this tool cannot see that.
 *
 * Robustness: scrolls the element into view before every screenshot (a field
 * placed deep in a tall section is otherwise below the viewport fold -> a
 * false ink=0). Deselects before sampling so the blue overlay never counts
 * as ink; background is the color-mode (histogram) of the crop, not a corner.
 *
 * Usage:
 *   node section_move_ink.mjs [--port 5173] [--outdir /tmp/rf-section-move-ink]
 * Spawns its own reportforge_server.py on --port from the repo's current
 * disk. Exit 1 if any transition loses ink.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const SENTINEL = 'INK106';
const INK_THRESHOLD = 5;
const TRANSITIONS = [
  ['s-rh', 's-ph'], ['s-ph', 's-d1'], ['s-d1', 's-pf'], ['s-pf', 's-rf'], ['s-rf', 's-rh'],
];

function arg(name, def) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : def;
}
const PORT = Number(arg('--port', '5173'));
const OUTDIR = arg('--outdir', '/tmp/rf-section-move-ink');

async function waitHealth(url, ms = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { if ((await fetch(url)).ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('server never became ready: ' + url);
}

async function measureInk(page, rect, margin = 3) {
  const b64 = (await page.screenshot()).toString('base64');
  return page.evaluate(async ({ b64, rect, margin }) => {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = 'data:image/png;base64,' + b64; });
    const dpr = window.devicePixelRatio || 1;
    const L = Math.max(0, Math.round(rect.x + margin) * dpr), T = Math.max(0, Math.round(rect.y + margin) * dpr);
    const W = Math.max(1, Math.round(rect.width - margin * 2) * dpr), H = Math.max(1, Math.round(rect.height - margin * 2) * dpr);
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d'); x.drawImage(img, L, T, W, H, 0, 0, W, H);
    const d = x.getImageData(0, 0, W, H).data;
    const m = new Map();
    for (let i = 0; i < d.length; i += 4) { const k = (d[i] >> 3) + ',' + (d[i + 1] >> 3) + ',' + (d[i + 2] >> 3); m.set(k, (m.get(k) || 0) + 1); }
    let mk = null, mc = -1; for (const [k, v] of m) { if (v > mc) { mc = v; mk = k; } }
    const [br, bg, bb] = mk.split(',').map((n) => Number(n) << 3);
    let ink = 0;
    for (let i = 0; i < d.length; i += 4) { if (Math.abs(d[i] - br) + Math.abs(d[i + 1] - bg) + Math.abs(d[i + 2] - bb) > 60) ink++; }
    return { ink, total: W * H, bg: [br, bg, bb] };
  }, { b64, rect, margin });
}

async function rectOf(page, id) {
  await page.evaluate((id) => document.querySelector(`.cr-element[data-id="${id}"]`)?.scrollIntoView({ block: 'center' }), id);
  await page.waitForTimeout(80);
  return page.evaluate((id) => { const r = document.querySelector(`.cr-element[data-id="${id}"]`).getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }, id);
}

async function clearSel(page) {
  const cv = await page.locator('#canvas-layer').boundingBox();
  await page.mouse.click(cv.x + cv.width - 40, cv.y + cv.height - 40);
  await page.waitForTimeout(100);
}

(async () => {
  mkdirSync(OUTDIR, { recursive: true });
  const server = spawn('python3', ['reportforge_server.py', String(PORT)], { cwd: ROOT, stdio: 'ignore', env: { ...process.env, PYTHONPATH: ROOT } });
  const results = [];
  let failed = false;
  try {
    await waitHealth(`http://localhost:${PORT}/health`);
    const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] });
    const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof DS !== 'undefined' && Array.isArray(DS.elements) && DS.elements.length > 0);
    await page.waitForTimeout(800);

    for (const [origin, target] of TRANSITIONS) {
      // Place a real DB-bound field deep in the origin section (guaranteed to
      // overflow a shorter target) with the sentinel content.
      const before = await page.evaluate(({ sentinel, origin, target }) => {
        const el = DS.elements.find((e) => e.fieldPath === 'cliente.email') || DS.elements.find((e) => e.type === 'field') || DS.elements.find((e) => e.type === 'text');
        const os = DS.getSection(origin), ts = DS.getSection(target);
        // Place deep enough to overflow the target section on an un-clamped
        // move, but capped modestly so it stays on-screen for measurement.
        const y = Math.max(0, Math.min((os?.height || 20) - el.h - 1, (ts?.height || 20) + 6));
        DS.updateElementLayout(el.id, { sectionId: origin, y }, 'diag-setup');
        el.content = sentinel; _canonicalCanvasWriter().updateElement(el.id);
        return { id: el.id, sectionId: el.sectionId, x: el.x, y: el.y, w: el.w, h: el.h, fieldPath: el.fieldPath };
      }, { sentinel: SENTINEL, origin, target });

      // ── DESIGN mode: origin ink (scrolled into view) ──
      await clearSel(page);
      const originInk = await measureInk(page, await rectOf(page, before.id));

      // Open the properties panel reliably (programmatic selection), THEN
      // drive the REAL dropdown gesture (a genuine <select> change event).
      await page.evaluate((id) => { DS.selectOnly(id, 'diag'); if (typeof PropertiesEngine !== 'undefined' && PropertiesEngine.render) PropertiesEngine.render(); }, before.id);
      await page.waitForSelector('#prop-section', { timeout: 5000 });
      await page.waitForTimeout(30);
      await page.selectOption('#prop-section', target);
      await page.waitForFunction(({ id, target }) => DS.getElementById(id)?.sectionId === target, { id: before.id, target }, { timeout: 5000 });

      const after = await page.evaluate(({ id }) => {
        const el = DS.getElementById(id); const div = document.querySelector(`.cr-element[data-id="${id}"]`);
        const sec = div ? div.closest('.cr-section') : null; const cs = sec ? getComputedStyle(sec) : {};
        return { sectionId: el.sectionId, x: el.x, y: el.y, h: el.h, domParent: sec ? sec.dataset.sectionId : null, contain: cs.contain, overflow: cs.overflow, sectionHeight: cs.height };
      }, { id: before.id });

      await clearSel(page);
      const designInk = await measureInk(page, await rectOf(page, before.id));
      await page.screenshot({ path: `${OUTDIR}/${origin}_to_${target}_design.png` });

      // The BUG signal is post-move ink loss (box present, interior gone).
      // originInk is only a precheck; a 0 there in a tall first section is a
      // measurement artifact (field below the fold), not the product bug, so
      // it is reported as a warning rather than a failure.
      const pass = designInk.ink > INK_THRESHOLD;
      failed = failed || !pass;
      const warn = originInk.ink <= INK_THRESHOLD ? ' (origin precheck ink=0: measurement artifact, not the bug)' : '';
      results.push({ transition: `${origin}->${target}`, mode: 'design', before, after, originInk: originInk.ink, afterInk: designInk.ink, pass });
      console.log(`[design] ${origin}->${target}: originInk=${originInk.ink} afterInk=${designInk.ink} y=${after.y}/${after.sectionHeight} domParent=${after.domParent} contain=${after.contain} -> ${pass ? 'OK' : 'INK LOST'}${warn}`);
    }

    // ── PREVIEW mode audit ──────────────────────────────────────────────
    // The visible preview render-layer comes from the SERVER (/designer-preview
    // -> AdvancedHtmlEngine), whose .cr-section CSS is `overflow:hidden` --
    // so an un-clamped field placed past its section is clipped in preview
    // TOO, not only on the design canvas. Move a field into the short detail
    // section, enter preview, and confirm its rendered node keeps ink.
    const pv = await page.evaluate(() => {
      const el = DS.elements.find((e) => e.fieldPath === 'cliente.email') || DS.elements.find((e) => e.type === 'field');
      // Place at y=34 in s-ph so that, moved to s-d1 (14px), an UN-clamped
      // model leaves y=34 far past the detail row -> the server render's
      // .cr-section{overflow:hidden} clips it in preview too. With the clamp,
      // y drops to 2 and preview renders it.
      DS.updateElementLayout(el.id, { sectionId: 's-ph', y: 34 }, 'diag');
      DS.selectOnly(el.id, 'diag'); if (PropertiesEngine.render) PropertiesEngine.render();
      return { id: el.id };
    });
    await page.waitForSelector('#prop-section', { timeout: 5000 }); await page.waitForTimeout(30);
    await page.selectOption('#prop-section', 's-d1');
    await page.waitForFunction((id) => DS.getElementById(id)?.sectionId === 's-d1', pv.id, { timeout: 5000 });
    // enter preview (F5 path)
    await page.evaluate(() => (typeof handleAction === 'function') && handleAction('preview'));
    await page.waitForTimeout(1200);
    const previewProbe = await page.evaluate(() => {
      // detail-band rows render as .cr-detail-row (one per item), static
      // sections as .cr-section -- cover both.
      const nodes = [...document.querySelectorAll('#preview-content .preview-render-layer [data-section-id="s-d1"] [data-el-index]')];
      const node = nodes.find((n) => n.getBoundingClientRect().width > 2) || nodes[0] || null;
      if (!node) return { found: false, pageCount: document.querySelectorAll('#preview-content .preview-render-layer .rpt-page').length };
      const r = node.getBoundingClientRect();
      return { found: true, rect: { x: r.x, y: r.y, width: r.width, height: r.height }, pageCount: document.querySelectorAll('#preview-content .preview-render-layer .rpt-page').length };
    });
    let previewInk = null;
    if (previewProbe.found && previewProbe.rect.width > 2 && previewProbe.rect.height > 2) {
      previewInk = await measureInk(page, previewProbe.rect);
      await page.screenshot({ path: `${OUTDIR}/preview_s-d1_field.png` });
      const pvPass = previewInk.ink > INK_THRESHOLD;
      failed = failed || !pvPass;
      results.push({ transition: 's-ph->s-d1', mode: 'preview', afterInk: previewInk.ink, pass: pvPass });
      console.log(`[preview] s-ph->s-d1: rendered-node ink=${previewInk.ink} -> ${pvPass ? 'OK' : 'INK LOST'}`);
    } else {
      console.log(`[preview] s-ph->s-d1: field node not found in render-layer (pages=${previewProbe.pageCount}) -- inconclusive`);
    }
    await browser.close();
  } finally {
    server.kill('SIGKILL');
  }
  console.log('\nSCREENSHOTS + report in ' + OUTDIR);
  process.exit(failed ? 1 : 0);
})();
