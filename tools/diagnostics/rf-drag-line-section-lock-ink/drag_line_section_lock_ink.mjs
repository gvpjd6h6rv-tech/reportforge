#!/usr/bin/env node
'use strict';

/**
 * RF Drag-Line Section-Lock Ink Diagnostic (DESIGNER-DRAG-LINE-SECTION-LOCK-01).
 *
 * Diagnostic-only. Drives the REAL designer in a real browser and proves,
 * with a visible ink overlay + runtime assertions, that a HORIZONTAL-only
 * drag on an element taller than its own section (e.g. a vertical line
 * whose bottom edge touches/enters the next section) changes ONLY x --
 * sectionId, y, and the DOM owner section must stay on the original
 * section, even though the element keeps visually invading the next one.
 *
 * Root cause this proves fixed (three independent layers, all in
 * engines/DocumentActionsLayoutClamp.js::normalizeElementLayout and
 * engines/SelectionInteractionMotion.js::_doMove):
 *   1. _doMove used to send {x,y} unconditionally on every mousemove tick.
 *   2. normalizeElementLayout's overflow/carry re-owner fired whenever the
 *      patch merely HAD a y key, not when y actually changed -- an
 *      oversized element overflows its own band on every move regardless.
 *   3. normalizeElementLayout's anti-straddle y-clamp ran unconditionally;
 *      for an oversized element maxY=0, so even a correctly-omitted-y patch
 *      still got a forced y=0 the moment ANY patch touched the element,
 *      because curY fell back to element.y and got clamped. Only visible
 *      against a non-grid-aligned y (confirmed live against
 *      factura_a4.json) -- DS.snap(5) itself returns 4.988976..., so
 *      comparing a snapped candidate against a raw stored y produced false
 *      "vertical intent" even at real mouse deltaY=0.
 *
 * Two scenarios:
 *   --scenario fixture  (default) -- minimal synthetic 2-section layout,
 *     vline1 (h=60) in a 30px section, y=5 (deliberately NOT grid-aligned,
 *     so it also exercises root-cause layer 3).
 *   --scenario factura   -- real production layout (factura_a4.json),
 *     vertical line inserted via the REAL toolbar tool (#tool-line-v,
 *     click-to-place), same insertion path a user would use.
 *
 * Ink drawn (non-interactive, pointer-events:none, never intercepts the
 * real drag, never mutates the model):
 *   blue rect   = owner section (original, before AND after)
 *   orange rect = next section (the one the element's bottom overlaps)
 *   purple rect = element's real bounding box
 *   green bar   = the line's visible vertical axis
 *   blue dot    = top anchor
 *   red dot     = bottom end
 *   label panel = sectionId_before/after, y_before/after, x_before/after,
 *                 lineBottom, ownerSectionBottom
 *
 * Usage:
 *   node drag_line_section_lock_ink.mjs [--scenario fixture|factura]
 *        [--port 5173] [--outdir /tmp/rf-drag-line-section-lock-ink]
 * Spawns its own reportforge_server.py on --port from the repo's current
 * disk. Exit 1 if any assertion fails.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const FIXTURE_PATH = resolve(ROOT, 'reportforge/tests/fixtures/designer_drag_line_section_lock_two_section_vline.json');
const FACTURA_PATH = resolve(ROOT, 'reportforge/layouts/factura_a4.json');

function arg(name, def) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : def;
}
const SCENARIO = arg('--scenario', 'fixture');
const PORT = Number(arg('--port', '5173'));
const OUTDIR = arg('--outdir', '/tmp/rf-drag-line-section-lock-ink');

async function waitHealth(url, ms = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { if ((await fetch(url)).ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('server never became ready: ' + url);
}

function drawInk(args) {
  const { elementId, ownerSectionId, nextSectionId, phaseLabel, dragStart, dragEnd, before, after, ownerSectionBottomModel, extraLabel } = args;
  document.getElementById('rf-drag-ink-layer')?.remove();
  const layer = document.createElement('div');
  layer.id = 'rf-drag-ink-layer';
  layer.style.cssText = 'position:fixed;inset:0;z-index:99999;pointer-events:none;font-family:monospace;';
  document.body.appendChild(layer);

  const ownerSecEl = document.querySelector(`.cr-section[data-section-id="${ownerSectionId}"]`);
  const nextSecEl = nextSectionId ? document.querySelector(`.cr-section[data-section-id="${nextSectionId}"]`) : null;
  const lineEl = document.querySelector(`.cr-element[data-id="${elementId}"]`);

  function rectDiv(rect, color, label) {
    const d = document.createElement('div');
    d.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;outline:3px solid ${color};box-sizing:border-box;`;
    layer.appendChild(d);
    if (label) {
      const l = document.createElement('div');
      l.textContent = label;
      l.style.cssText = `position:fixed;left:${rect.left}px;top:${Math.max(0, rect.top - 16)}px;background:${color};color:#fff;font-size:10px;padding:1px 4px;white-space:nowrap;`;
      layer.appendChild(l);
    }
  }
  function dot(x, y, color, label) {
    const d = document.createElement('div');
    d.style.cssText = `position:fixed;left:${x - 5}px;top:${y - 5}px;width:10px;height:10px;border-radius:50%;background:${color};border:1px solid #000;`;
    layer.appendChild(d);
    if (label) {
      const l = document.createElement('div');
      l.textContent = label;
      l.style.cssText = `position:fixed;left:${x + 8}px;top:${y - 6}px;background:${color};color:#fff;font-size:9px;padding:0 3px;white-space:nowrap;`;
      layer.appendChild(l);
    }
  }

  if (ownerSecEl) rectDiv(ownerSecEl.getBoundingClientRect(), '#0057FF', `OWNER (blue): ${ownerSectionId}`);
  if (nextSecEl) rectDiv(nextSecEl.getBoundingClientRect(), '#FF8C00', `NEXT (orange): ${nextSectionId}`);
  if (lineEl) {
    const r = lineEl.getBoundingClientRect();
    rectDiv(r, '#A020F0', 'bbox (purple)');
    const axisX = r.left + r.width / 2;
    const axis = document.createElement('div');
    axis.style.cssText = `position:fixed;left:${axisX - 1.5}px;top:${r.top}px;width:3px;height:${r.height}px;background:#00C800;`;
    layer.appendChild(axis);
    dot(axisX, r.top, '#0057FF', 'top anchor (blue)');
    dot(axisX, r.bottom, '#FF0000', 'bottom end (red)');
  }

  if (dragStart && dragEnd) {
    const arrow = document.createElement('div');
    const y = dragStart.y;
    const x1 = Math.min(dragStart.x, dragEnd.x);
    const w = Math.abs(dragEnd.x - dragStart.x);
    arrow.style.cssText = `position:fixed;left:${x1}px;top:${y - 1}px;width:${w}px;height:2px;background:#000;`;
    layer.appendChild(arrow);
  }

  const panel = document.createElement('div');
  panel.style.cssText = 'position:fixed;bottom:6px;left:6px;background:#111;color:#0f0;font-size:11px;padding:8px 10px;line-height:1.6;white-space:pre;border:1px solid #0f0;max-width:560px;';
  panel.textContent = [
    `phase: ${phaseLabel}`,
    extraLabel ? extraLabel : null,
    `sectionId_before: ${before.sectionId}   sectionId_after: ${after.sectionId}`,
    `y_before: ${before.y}   y_after: ${after.y}`,
    `x_before: ${before.x}   x_after: ${after.x}`,
    `lineBottom: ${(after.y + after.h).toFixed(3)}   ownerSectionBottom: ${ownerSectionBottomModel}`,
  ].filter(Boolean).join('\n');
  layer.appendChild(panel);
}

async function openLayout(page, layoutPath) {
  await page.evaluate(() => { delete window.showOpenFilePicker; });
  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.click('button[data-action="open"]');
  const chooser = await fileChooserPromise;
  await chooser.setFiles(layoutPath);
  await page.waitForTimeout(1200);
}

async function dragHorizontally(page, elementId, dxTarget = 100) {
  const rect = await page.evaluate((id) => document.querySelector(`.cr-element[data-id="${id}"]`).getBoundingClientRect().toJSON(), elementId);
  const startX = rect.left + rect.width / 2;
  const startY = rect.top + Math.min(10, rect.height / 2);
  const endX = startX + dxTarget;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 30, startY, { steps: 5 });
  await page.mouse.move(endX, startY, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  return { startX, startY, endX };
}

async function runFixtureScenario(page, baseUrl) {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof DS !== 'undefined' && Array.isArray(DS.elements));
  await page.waitForTimeout(500);
  await openLayout(page, FIXTURE_PATH);

  const before = await page.evaluate(() => ({ ...window.DS.getElementById('vline1') }));
  const ownerHeight = await page.evaluate((secId) => (window.DS.sections.find((s) => s.id === secId) || {}).height, before.sectionId);

  await page.evaluate(drawInk, {
    elementId: 'vline1', ownerSectionId: 's-A', nextSectionId: 's-B',
    phaseLabel: 'FIXTURE_IDLE', dragStart: null, dragEnd: null,
    before, after: before, ownerSectionBottomModel: ownerHeight,
  });
  await page.screenshot({ path: `${OUTDIR}/fixture_idle.png` });

  const { startX, startY, endX } = await dragHorizontally(page, 'vline1');

  const after = await page.evaluate(() => ({ ...window.DS.getElementById('vline1') }));
  const domInfo = await page.evaluate(() => {
    const el = document.querySelector('.cr-element[data-id="vline1"]');
    const ps = el ? el.closest('.cr-section') : null;
    return { domSectionId: ps ? ps.dataset.sectionId : null, elFound: !!el };
  });

  await page.evaluate(drawInk, {
    elementId: 'vline1', ownerSectionId: 's-A', nextSectionId: 's-B',
    phaseLabel: 'FIXTURE_AFTER_HORIZONTAL_DRAG',
    dragStart: { x: startX, y: startY }, dragEnd: { x: endX, y: startY },
    before, after, ownerSectionBottomModel: ownerHeight,
  });
  await page.screenshot({ path: `${OUTDIR}/fixture_after_horizontal_drag.png` });

  return { before, after, domInfo, ownerHeight };
}

async function runFacturaScenario(page, baseUrl) {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof DS !== 'undefined' && Array.isArray(DS.elements));
  await page.waitForTimeout(500);
  await openLayout(page, FACTURA_PATH);

  // Real production insertion path: click the real vertical-line toolbar
  // tool, click-to-place inside s-ph's free sliver (x:789.27-794 of 794 --
  // the only spot not already covered by an existing .cr-element or a
  // section-resize handle; GlobalEventHandlers.js skips insert entirely
  // when the click target is inside an existing element).
  await page.click('#tool-line-v');
  const secRect = await page.evaluate(() => document.querySelector('.cr-section[data-section-id="s-ph"]').getBoundingClientRect().toJSON());
  await page.mouse.move(secRect.left + 791, secRect.top + 15);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(400);

  const created = await page.evaluate(() => {
    const els = window.DS.elements.filter((e) => e.type === 'line' && e.lineDir === 'v');
    return els[els.length - 1] || null;
  });
  if (!created) throw new Error('no vertical line was created via #tool-line-v');

  const before = { ...created };
  const ownerHeight = await page.evaluate((secId) => (window.DS.sections.find((s) => s.id === secId) || {}).height, before.sectionId);
  const sectionIds = await page.evaluate(() => window.DS.sections.map((s) => s.id));
  const nextSectionId = sectionIds[sectionIds.indexOf(before.sectionId) + 1] || null;

  const { startX, startY, endX } = await dragHorizontally(page, before.id);

  const after = await page.evaluate((id) => ({ ...window.DS.getElementById(id) }), before.id);
  const domInfo = await page.evaluate((id) => {
    const el = document.querySelector(`.cr-element[data-id="${id}"]`);
    const ps = el ? el.closest('.cr-section') : null;
    return { domSectionId: ps ? ps.dataset.sectionId : null, elFound: !!el };
  }, before.id);

  await page.evaluate(drawInk, {
    elementId: before.id, ownerSectionId: before.sectionId, nextSectionId,
    phaseLabel: 'FACTURA_A4_AFTER_HORIZONTAL_DRAG',
    extraLabel: 'layout: factura_a4.json (real production layout, real #tool-line-v insertion)',
    dragStart: { x: startX, y: startY }, dragEnd: { x: endX, y: startY },
    before, after, ownerSectionBottomModel: ownerHeight,
  });
  await page.screenshot({ path: `${OUTDIR}/factura_a4_after_horizontal_drag.png` });

  return { before, after, domInfo, ownerHeight };
}

(async () => {
  mkdirSync(OUTDIR, { recursive: true });
  const server = spawn('python3', ['reportforge_server.py', String(PORT)], { cwd: ROOT, stdio: 'ignore', env: { ...process.env, PYTHONPATH: ROOT } });
  let failed = false;
  try {
    await waitHealth(`http://localhost:${PORT}/health`);
    const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] });
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    const baseUrl = `http://localhost:${PORT}/designer/crystal-reports-designer-v4.html`;

    const result = SCENARIO === 'factura'
      ? await runFacturaScenario(page, baseUrl)
      : await runFixtureScenario(page, baseUrl);

    const asserts = {
      sectionId_before_eq_after: result.before.sectionId === result.after.sectionId,
      y_before_eq_after: result.before.y === result.after.y,
      x_after_neq_before: result.after.x !== result.before.x,
      lineBottom_after_gt_ownerSectionBottom: (result.after.y + result.after.h) > result.ownerHeight,
      domOwner_is_original_section: result.domInfo.domSectionId === result.before.sectionId,
    };
    failed = Object.values(asserts).some((v) => v === false);

    console.log(`[${SCENARIO}]`, JSON.stringify({ before: result.before, after: result.after, ownerHeight: result.ownerHeight, domInfo: result.domInfo, asserts }, null, 2));
    await browser.close();
  } finally {
    server.kill('SIGKILL');
  }
  console.log('\nSCREENSHOTS + report in ' + OUTDIR);
  process.exit(failed ? 1 : 0);
})();
