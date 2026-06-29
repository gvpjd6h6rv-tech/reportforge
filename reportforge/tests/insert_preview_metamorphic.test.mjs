'use strict';
/**
 * METAMORPHIC TEST — Preview → Insert (CR PARITY: stay in Preview)
 *
 * Contract (RF-CR-PARITY-PREVIEW-INSERT-STAY-IN-PREVIEW):
 *   Inserting an element from Preview must add it to the report WITHOUT leaving
 *   Preview, and refresh #preview-content with the new element. The merged
 *   stability fix (section-grow / no contain:paint clip + FIX-3) must still hold
 *   when the user later switches to Design.
 *
 * Live-server test (needs localhost:5001). NOT wired into CI; run manually:
 *   node reportforge/tests/insert_preview_metamorphic.test.mjs
 *
 * Three-phase validation (6 element types, headless):
 *   Phase 1 (FIX APPLIED, production):
 *     PARITY    — after Insertar X from Preview: previewMode stays true,
 *                 #canvas-layer keeps preview-mode, element present in #preview-content.
 *     STABILITY — then switch to Design: element in .cr-section, fits section
 *                 height (not clipped by contain:paint), hittable, #workspace class kept.
 *   Phase 2 (BUG INJECTED): inject legacy setTool that hides + does NOT insert
 *     → DS+1 FALSE (element not created) = bug reproduced.
 *   Phase 3 (RELOAD, production fix) → repeat Phase 1.
 *
 * insert-section: CLASSIFIED SEPARATELY — routed through CommandRuntimeSections.insertSection(),
 * not InsertEngine.setTool. Not covered here.
 */

import { chromium } from 'playwright';

const TARGET = process.env.FLIGHT_URL || 'http://localhost:5001/';

const TOOLS = [
  { action: 'insert-text',    label: 'Texto'      },
  { action: 'insert-field',   label: 'Campo'      },
  { action: 'insert-line',    label: 'Línea H'    },
  { action: 'insert-line-v',  label: 'Línea V'    },
  { action: 'insert-box',     label: 'Rectángulo' },
  { action: 'insert-barcode', label: 'Barcode'    },
];

// ── Bug injection — legacy state: hide() + NO insertAtDefaultPosition ──────────
//    Reproduces "element not created on Preview→Insert" (the pre-fix failure).
const INJECT_BUG = `(function() {
  if (window.__META_bug) return;
  window.__META_bug = true;
  const IE = window.InsertEngine;
  IE.setTool = function(tool) {
    if (tool !== 'pointer' && DS.previewMode && typeof PreviewEngineMode !== 'undefined') {
      PreviewEngineMode.hide();        // legacy: exit preview, create nothing
      DS.setTool(tool, 'InsertEngine.setTool');
      document.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('active', b.dataset.tool === tool));
      return;
    }
    DS.setTool(tool, 'InsertEngine.setTool');
    if (tool === 'pointer') SelectionEngine._drag = null;
  };
})();`;

// ── Probe: PARITY (preview state + element in #preview-content) ────────────────
async function probeParity(page, lastId, dsBefore) {
  return page.evaluate(({ id, before }) => {
    const cl = document.getElementById('canvas-layer');
    const pc = document.getElementById('preview-content');
    const dsEls = typeof DS !== 'undefined' ? DS.elements : [];
    return {
      dsPlus1:           dsEls.length > before,
      previewMode:       !!DS.previewMode,
      canvasPreviewMode: cl ? cl.classList.contains('preview-mode') : false,
      inPreviewContent:  pc ? !!pc.querySelector(`[data-id="${id}"],[data-origin-id="${id}"]`) : false,
    };
  }, { id: lastId, before: dsBefore });
}

// ── Probe: STABILITY (after switching to Design — no-clip / hittable) ──────────
async function probeStability(page, lastId) {
  return page.evaluate((id) => {
    const ws  = document.getElementById('workspace');
    const div = id ? document.querySelector(`.cr-element[data-id="${id}"]`) : null;
    let inSection = false, visible = false, hittable = false;
    if (div) {
      inSection = !!div.closest('.cr-section') && !div.closest('#preview-content');
      const sec = div.closest('.cr-section');
      if (sec) {
        const sh = parseFloat(sec.style.height) || 0;
        visible = (div.offsetTop + div.offsetHeight) <= sh;
      }
      const r = div.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        const ex = r.left + r.width / 2, ey = r.top + r.height / 2;
        const efp = document.elementFromPoint(ex, ey);
        hittable = efp ? (efp === div || div.contains(efp) || efp.classList.contains('sel-handle')) : false;
      }
    }
    return { inSection, visible, hittable, wsClass: ws ? ws.classList.contains('workspace') : false };
  }, lastId);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
async function ensureDesign(page) {
  const inPrev = await page.evaluate(() => typeof DS !== 'undefined' && DS.previewMode);
  if (inPrev) { await page.locator('#tab-design').click(); await page.waitForTimeout(500); }
}
async function triggerInsert(page, action) {
  await page.locator('.menu-item[data-menu="insertar"]').click();
  await page.waitForSelector('#dd-insertar', { state: 'visible', timeout: 3000 });
  await page.locator(`#dd-insertar .dd-item[data-action="${action}"]`).click();
  await page.waitForTimeout(1200); // allow async preview refresh to settle
}
async function undo(page, before) {
  const n = await page.evaluate(() => typeof DS !== 'undefined' ? DS.elements.length : 0);
  if (n > before) { await page.keyboard.press('Control+z'); await page.waitForTimeout(300); }
}
async function lastId(page) { return page.evaluate(() => { const e = DS.elements; return e.length ? e[e.length - 1].id : null; }); }
async function bootReady(page) {
  await page.goto(TARGET, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.documentElement?.dataset?.rfRuntimeReady === '1', null, { timeout: 15000 });
  await page.waitForFunction(() => typeof DS !== 'undefined' && DS.elements.length > 0, null, { timeout: 10000 });
  await page.waitForTimeout(800);
}

// ── Assertion ─────────────────────────────────────────────────────────────────
let failures = 0;
function assert(cond, msg) {
  process.stdout.write(`  ${cond ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m'}  ${msg}\n`);
  if (!cond) failures++;
}

// Run one production-fix phase (PARITY in preview + STABILITY in design)
async function runProductionPhase(page) {
  for (const t of TOOLS) {
    console.log(`\n  ${t.label} (${t.action})`);
    await ensureDesign(page);
    await page.keyboard.press('Escape');
    const before = await page.evaluate(() => DS.elements.length);

    await page.locator('#tab-preview').click();
    await page.waitForTimeout(1200);
    await triggerInsert(page, t.action);

    const id = await lastId(page);
    const par = await probeParity(page, id, before);
    assert(par.dsPlus1,           'PARITY  · DS +1');
    assert(par.previewMode,       'PARITY  · DS.previewMode stays true');
    assert(par.canvasPreviewMode, 'PARITY  · #canvas-layer keeps preview-mode');
    assert(par.inPreviewContent,  'PARITY  · element present in #preview-content');

    // Switch to Design and verify the stability (no-clip) property holds
    await page.locator('#tab-design').click();
    await page.waitForTimeout(500);
    const st = await probeStability(page, id);
    assert(st.inSection, 'STABLE  · element in .cr-section (Design)');
    assert(st.visible,   'STABLE  · element fits section height (no contain:paint clip)');
    assert(st.hittable,  'STABLE  · elementFromPoint hits element / sel-handle');
    assert(st.wsClass,   'STABLE  · #workspace retains "workspace" class (FIX-3)');

    await ensureDesign(page);
    await undo(page, before);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(72));
console.log('METAMORPHIC — Preview → Insert (CR PARITY: stay in Preview)');
console.log(`Target: ${TARGET}`);
console.log('═'.repeat(72) + '\n');

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const page    = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', e => console.error('PAGEERROR:', e.message));

await bootReady(page);
console.log(`Base DS.elements: ${await page.evaluate(() => DS.elements.length)}\n`);

// ── PHASE 1 — production fix ───────────────────────────────────────────────────
console.log('─'.repeat(72));
console.log('PHASE 1 — FIX APPLIED (production)  → PARITY + STABILITY, expect all PASS');
console.log('─'.repeat(72));
await runProductionPhase(page);

// ── PHASE 2 — bug injected (element not created) ───────────────────────────────
console.log('\n' + '─'.repeat(72));
console.log('PHASE 2 — BUG INJECTED (legacy hide, no insert)  → expect DS+1 FALSE');
console.log('─'.repeat(72));
await page.evaluate(INJECT_BUG);
let reproduced = 0;
for (const t of TOOLS) {
  console.log(`\n  ${t.label} (${t.action})`);
  await ensureDesign(page);
  await page.keyboard.press('Escape');
  const before = await page.evaluate(() => DS.elements.length);
  await page.locator('#tab-preview').click();
  await page.waitForTimeout(1200);
  await triggerInsert(page, t.action);
  const after = await page.evaluate(() => DS.elements.length);
  if (after === before) { console.log('  \x1b[32mPASS\x1b[0m  bug reproduced: DS +1 = false (element not created)'); reproduced++; }
  else { console.log('  \x1b[31mFAIL\x1b[0m  injection did not reproduce the bug'); failures++; }
  await ensureDesign(page);
  await undo(page, before);
}
console.log(`\n  Bug reproduced for ${reproduced}/${TOOLS.length} tools`);

// ── PHASE 3 — reload production fix ────────────────────────────────────────────
console.log('\n' + '─'.repeat(72));
console.log('PHASE 3 — RELOAD (production fix)  → PARITY + STABILITY, expect all PASS');
console.log('─'.repeat(72));
await bootReady(page);
console.log('  Page reloaded — production fix active.');
await runProductionPhase(page);

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(72));
if (failures === 0) {
  console.log('\x1b[32m✔ ALL ASSERTIONS PASSED\x1b[0m');
  console.log('Phase 1: PARITY+STABILITY  |  Phase 2: bug reproduced  |  Phase 3: PARITY+STABILITY');
} else {
  console.log(`\x1b[31m✘ ${failures} assertion(s) FAILED\x1b[0m`);
}
console.log('═'.repeat(72) + '\n');

await browser.close();
if (failures > 0) process.exit(1);
