'use strict';
/**
 * METAMORPHIC TEST — Preview → Insert parity
 *
 * Three-phase validation (6 element types, headless):
 *   Phase 1 (FIX APPLIED):    production InsertEngine.js has the fix → all PASS
 *   Phase 2 (BUG INJECTED):   inject pre-fix state via page.evaluate → DS+1 FAIL (bug reproduced)
 *   Phase 3 (FIX REINJECTED): re-inject fix via page.evaluate → all PASS
 *
 * Acceptance criteria per element:
 *   ✔ DS +1      — element in model
 *   ✔ DOM +1     — element rendered
 *   ✔ inSection  — element in .cr-section (not #preview-content)
 *   ✔ visible    — element bottom ≤ section height (not clipped by contain:paint)
 *   ✔ hittable   — elementFromPoint at element center returns .cr-element OR sel-handle
 *                  (sel-handle on top of a 2px line IS correct; it confirms render + selection)
 *   ✔ wsClass    — #workspace retains 'workspace' class (FIX-3)
 *   ✔ overlay    — canvas-layer has no 'preview-mode' class
 *
 * insert-section: CLASSIFIED SEPARATELY — routed through CommandRuntimeSections.insertSection(),
 * which never calls PreviewEngineMode.hide(). Overlay bug is a separate fix, not blocked here.
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

// ── Bug injection — pre-fix state (no insertAtDefaultPosition, old cs.className='') ──
const INJECT_BUG = `(function() {
  if (window.__META_bug) return;
  window.__META_bug  = true;
  window.__META_fix  = false;
  const IE = window.InsertEngine;
  IE.setTool = function(tool) {
    if (tool !== 'pointer' && DS.previewMode && typeof PreviewEngineMode !== 'undefined') {
      PreviewEngineMode.hide();
      // NO insertAtDefaultPosition — mimics pre-fix state
      DS.setTool(tool, 'InsertEngine.setTool');
      document.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('active', b.dataset.tool === tool));
      const cs = document.getElementById('workspace');
      cs.className = '';                // C9 bug: destroys workspace + rf-synthetic-scrollbars
      cs.classList.add('tool-' + tool);
      return;
    }
    DS.setTool(tool, 'InsertEngine.setTool');
    document.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('active', b.dataset.tool === tool));
    const cs = document.getElementById('workspace');
    cs.className = '';
    cs.classList.add('tool-' + tool);
    if (tool === 'pointer') SelectionEngine._drag = null;
  };
  delete IE.insertAtDefaultPosition;
})();`;

// ── Fix injection — re-apply fix without file change ─────────────────────────
const INJECT_FIX = `(function() {
  if (window.__META_fix) return;
  window.__META_fix  = true;
  window.__META_bug  = false;
  const IE = window.InsertEngine;
  const _TC = [
    'tool-pointer','tool-text','tool-field',
    'tool-line','tool-line-v','tool-box','tool-barcode','tool-section',
  ];
  IE.insertAtDefaultPosition = function(tool) {
    const W = {text:200,field:200,line:200,'line-v':2,box:200,barcode:200};
    const H = {text:16, field:16, line:2, 'line-v':60, box:40, barcode:60};
    const w = W[tool]||120, h = H[tool]||20;
    const relY = DS.snap(4);
    const needed = DS.snap(relY + h + 4);
    let sec = DS.sections.find(s => s.stype==='det' && s.height>=needed);
    if (!sec) sec = DS.sections.reduce((b,s) => (!b||s.height>b.height)?s:b, null);
    if (!sec) return;
    if (sec.height < needed) {
      sec.height = needed;
      const sd = document.querySelector('.cr-section[data-section-id="'+sec.id+'"]');
      if (sd) sd.style.height = sec.height + 'px';
      if (typeof SectionLayoutEngine !== 'undefined') SectionLayoutEngine.update();
      if (typeof SectionEngine !== 'undefined') SectionEngine.updateSectionsList();
    }
    const pageW = (typeof CFG!=='undefined' && CFG.PAGE_W) || 754;
    const x = DS.snap(Math.max(0, Math.round((pageW-w)/2)));
    let newEl;
    if (tool==='text')    newEl=mkEl('text',   sec.id,x,relY,w,h,{content:'Texto',bgColor:'transparent',borderColor:'transparent'});
    else if (tool==='field')   newEl=mkEl('field',  sec.id,x,relY,w,h,{fieldPath:'',content:'Seleccione campo'});
    else if (tool==='line')    newEl=mkEl('line',   sec.id,x,relY,w,Math.max(h,2),{borderColor:'#000',lineWidth:1});
    else if (tool==='line-v')  newEl=mkEl('line',   sec.id,x,relY,2,Math.max(h,20),{borderColor:'#000',lineWidth:1,lineDir:'v'});
    else if (tool==='box')     newEl=mkEl('rect',   sec.id,x,relY,w,h,{bgColor:'transparent',borderColor:'#000',borderWidth:1});
    else if (tool==='barcode') newEl=mkEl('barcode',sec.id,x,relY,w,h,{barcodeType:'code128',showText:true});
    if (!newEl) return;
    DS.setElements([...DS.elements, newEl], 'IE.insertAtDefaultPosition');
    _canonicalCanvasWriter().renderElement(newEl);
    DS.selectOnly(newEl.id, 'IE.insertAtDefaultPosition');
    SelectionEngine.renderHandles();
    PropertiesEngine.render(); FormatEngine.updateToolbar();
    DS.saveHistory();
    this.setTool('pointer');
    const _elId = newEl.id;
    if (typeof RenderScheduler !== 'undefined') {
      RenderScheduler.post(() => {
        const div = document.querySelector('.cr-element[data-id="'+_elId+'"]');
        if (div) div.scrollIntoView({behavior:'auto',block:'center',inline:'nearest'});
      }, 'insert-scroll-to-'+_elId);
    }
    if (tool === 'text') {
      const div = document.querySelector('.cr-element[data-id="'+newEl.id+'"]');
      if (div) setTimeout(() => SelectionEngine.startTextEdit(div, newEl), 50);
    }
    if (tool === 'field') {
      const sb = document.getElementById('sb-msg');
      if (sb) sb.textContent = 'Arrastre un campo desde el Explorador para asignarlo';
    }
  };
  IE.setTool = function(tool) {
    if (tool !== 'pointer' && DS.previewMode && typeof PreviewEngineMode !== 'undefined') {
      PreviewEngineMode.hide();
      if (tool !== 'section') this.insertAtDefaultPosition(tool);
      return;
    }
    DS.setTool(tool, 'InsertEngine.setTool');
    document.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('active', b.dataset.tool === tool));
    const cs = document.getElementById('workspace');
    cs.classList.remove(..._TC);
    if (tool !== 'pointer') cs.classList.add('tool-'+tool);
    if (tool === 'pointer') SelectionEngine._drag = null;
  };
})();`;

// ── Probe ─────────────────────────────────────────────────────────────────────
async function probe(page, lastId, dsBefore) {
  return page.evaluate(({ id, before }) => {
    const ws  = document.getElementById('workspace');
    const cl  = document.getElementById('canvas-layer');
    const dsEls = typeof DS !== 'undefined' ? DS.elements : [];
    const div = id ? document.querySelector(`.cr-element[data-id="${id}"]`) : null;

    let hittable = false, visible = false;
    if (div) {
      // visible: element fits within its section (not clipped by contain:paint)
      const sec = div.closest('.cr-section');
      if (sec) {
        const sh = parseFloat(sec.style.height) || 0;
        visible = (div.offsetTop + div.offsetHeight) <= sh;
      }
      // hittable: elementFromPoint at element center returns the element, a child,
      // OR a selection handle (sel-handle on a 2px line IS correct behaviour)
      const r = div.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        const ex = r.left + r.width  / 2;
        const ey = r.top  + r.height / 2;
        const efp = document.elementFromPoint(ex, ey);
        hittable = efp ? (
          efp === div || div.contains(efp) ||
          efp.classList.contains('sel-handle')   // selection handle on thin element = OK
        ) : false;
      }
    }

    return {
      dsPlus1:  dsEls.length > before,
      domPlus1: document.querySelectorAll('.cr-element:not(#preview-content .cr-element)').length > before,
      inSection: div ? (!!div.closest('.cr-section') && !div.closest('#preview-content')) : false,
      visible,
      hittable,
      wsClass:  ws ? ws.classList.contains('workspace') : false,
      overlay:  cl ? !cl.classList.contains('preview-mode') : false,
    };
  }, { id: lastId, before: dsBefore });
}

// ── Helpers ───────────────────────────────────────────────────────────────────
async function ensureDesign(page) {
  const inPrev = await page.evaluate(() => typeof DS !== 'undefined' && DS.previewMode);
  if (inPrev) { await page.locator('#tab-design').click(); await page.waitForTimeout(400); }
}
async function triggerInsert(page, action) {
  await page.locator('.menu-item[data-menu="insertar"]').click();
  await page.waitForSelector('#dd-insertar', { state: 'visible', timeout: 3000 });
  await page.locator(`#dd-insertar .dd-item[data-action="${action}"]`).click();
  await page.waitForTimeout(600);
}
async function undo(page, before) {
  const n = await page.evaluate(() => typeof DS !== 'undefined' ? DS.elements.length : 0);
  if (n > before) { await page.keyboard.press('Control+z'); await page.waitForTimeout(300); }
}

// ── Assertion ─────────────────────────────────────────────────────────────────
let failures = 0;
function assert(cond, msg) {
  process.stdout.write(`  ${cond ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m'}  ${msg}\n`);
  if (!cond) failures++;
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(72));
console.log('METAMORPHIC TEST — Preview → Insert (3-phase, 6 element types)');
console.log(`Target: ${TARGET}`);
console.log('═'.repeat(72) + '\n');

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const page    = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', e => console.error('PAGEERROR:', e.message));

await page.goto(TARGET, { waitUntil: 'domcontentloaded' });
try {
  await page.waitForFunction(() => document.documentElement?.dataset?.rfRuntimeReady === '1', null, { timeout: 15000 });
  await page.waitForFunction(() => typeof DS !== 'undefined' && DS.elements.length > 0, null, { timeout: 10000 });
} catch { console.error('App not ready.'); await browser.close(); process.exit(1); }
await page.waitForTimeout(800);

const base = await page.evaluate(() => DS.elements.length);
console.log(`Base DS.elements: ${base}\n`);

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 1 — FIX IN PRODUCTION InsertEngine.js
// ═══════════════════════════════════════════════════════════════════════════════
console.log('─'.repeat(72));
console.log('PHASE 1 — FIX APPLIED  (expect all PASS)');
console.log('─'.repeat(72));

for (const tool of TOOLS) {
  console.log(`\n  ${tool.label} (${tool.action})`);
  await ensureDesign(page);
  await page.keyboard.press('Escape');
  const before = await page.evaluate(() => DS.elements.length);
  await page.locator('#tab-preview').click();
  await page.waitForTimeout(1200);
  await triggerInsert(page, tool.action);
  const lastId = await page.evaluate(() => { const e=DS.elements; return e.length?e[e.length-1].id:null; });
  const p = await probe(page, lastId, before);
  assert(p.dsPlus1,   'DS +1');
  assert(p.domPlus1,  'DOM +1');
  assert(p.inSection, 'element in .cr-section (not preview)');
  assert(p.visible,   'element fits section height (not clipped by contain:paint)');
  assert(p.hittable,  'elementFromPoint returns .cr-element or sel-handle');
  assert(p.wsClass,   '#workspace retains "workspace" class (FIX-3)');
  assert(p.overlay,   'canvas-layer: no "preview-mode" class');
  await ensureDesign(page);
  await undo(page, before);
}

console.log('\n  Sección (insert-section) — CLASSIFIED SEPARATELY');
console.log('  Route: CommandRuntimeSections.insertSection() (not InsertEngine.setTool)');
console.log('  Overlay bug in this path is a separate fix — not asserted here.');

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 2 — BUG INJECTED  (no insertAtDefaultPosition + cs.className='')
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n' + '─'.repeat(72));
console.log('PHASE 2 — BUG INJECTED  (expect DS+1 = false for all = bug reproduced)');
console.log('─'.repeat(72));

await page.evaluate(INJECT_BUG);
let bugReproduced = 0;

for (const tool of TOOLS) {
  console.log(`\n  ${tool.label} (${tool.action})`);
  await ensureDesign(page);
  await page.keyboard.press('Escape');
  const before = await page.evaluate(() => DS.elements.length);
  await page.locator('#tab-preview').click();
  await page.waitForTimeout(1200);
  await triggerInsert(page, tool.action);
  const lastId = await page.evaluate(() => { const e=DS.elements; return e.length?e[e.length-1].id:null; });
  const p = await probe(page, lastId, before);
  // Bug = no element created
  if (!p.dsPlus1) {
    console.log('  \x1b[32mPASS\x1b[0m  Bug confirmed: DS +1 = false (element not created)');
    bugReproduced++;
  } else {
    console.log('  \x1b[31mFAIL\x1b[0m  Bug injection gap: element WAS created — injection did not override');
    failures++;
  }
  await ensureDesign(page);
  await undo(page, before);
}
console.log(`\n  Bug reproduced for ${bugReproduced}/${TOOLS.length} tools`);

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 3 — RELOAD PAGE + PRODUCTION FIX (clean state, no injection needed)
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n' + '─'.repeat(72));
console.log('PHASE 3 — PAGE RELOAD + PRODUCTION FIX  (expect all PASS)');
console.log('─'.repeat(72));

// Reload restores workspace class to initial state; production InsertEngine.js
// (the fix) is loaded fresh from disk — no page.evaluate injection needed.
await page.reload({ waitUntil: 'domcontentloaded' });
try {
  await page.waitForFunction(() => document.documentElement?.dataset?.rfRuntimeReady === '1', null, { timeout: 15000 });
  await page.waitForFunction(() => typeof DS !== 'undefined' && DS.elements.length > 0, null, { timeout: 10000 });
} catch { console.error('Page not ready after reload.'); await browser.close(); process.exit(1); }
await page.waitForTimeout(800);
console.log('  Page reloaded — production fix active.\n');

for (const tool of TOOLS) {
  console.log(`\n  ${tool.label} (${tool.action})`);
  await ensureDesign(page);
  await page.keyboard.press('Escape');
  const before = await page.evaluate(() => DS.elements.length);
  await page.locator('#tab-preview').click();
  await page.waitForTimeout(1200);
  await triggerInsert(page, tool.action);
  const lastId = await page.evaluate(() => { const e=DS.elements; return e.length?e[e.length-1].id:null; });
  const p = await probe(page, lastId, before);
  assert(p.dsPlus1,   'DS +1');
  assert(p.domPlus1,  'DOM +1');
  assert(p.inSection, 'element in .cr-section (not preview)');
  assert(p.visible,   'element fits section height (not clipped by contain:paint)');
  assert(p.hittable,  'elementFromPoint returns .cr-element or sel-handle');
  assert(p.wsClass,   '#workspace retains "workspace" class (FIX-3)');
  assert(p.overlay,   'canvas-layer: no "preview-mode" class');
  await ensureDesign(page);
  await undo(page, before);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(72));
if (failures === 0) {
  console.log('\x1b[32m✔ ALL ASSERTIONS PASSED\x1b[0m');
  console.log('Phase 1: PASS  |  Phase 2: bug reproduced  |  Phase 3: PASS');
} else {
  console.log(`\x1b[31m✘ ${failures} assertion(s) FAILED\x1b[0m`);
}
console.log('═'.repeat(72) + '\n');

await browser.close();
if (failures > 0) process.exit(1);
