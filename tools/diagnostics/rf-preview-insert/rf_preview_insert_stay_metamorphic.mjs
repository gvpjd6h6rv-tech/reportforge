'use strict';
/**
 * RF PREVIEW-INSERT STAY-IN-PREVIEW — METAMORPHIC (A/B/C)
 * ─────────────────────────────────────────────────────────────────────
 * DIAGNOSTIC TOOL — NOT a CI test. Run manually only.
 *
 * Validates the production fix via the REAL menu-click path (Insertar → X)
 * for the 6 element tools.
 *
 *   Phase A — fix applied (production): after Insertar X from Preview →
 *             previewMode===true AND #canvas-layer.preview-mode present AND
 *             element present in #preview-content. PASS.
 *   Phase B — fix removed (inject legacy hide() behavior via page.evaluate) →
 *             app LEAVES preview (previewMode===false / no preview-mode) OR
 *             element absent from #preview-content. FAIL (bug reproduced).
 *   Phase C — reload (production fix) → repeat A. PASS.
 *
 * Usage:
 *   node --experimental-vm-modules tools/diagnostics/rf-preview-insert/rf_preview_insert_stay_metamorphic.mjs
 *   HEADLESS=1 ...   FLIGHT_URL=http://host:port/ ...
 */

import { chromium } from 'playwright';

const TARGET   = process.env.FLIGHT_URL || 'http://localhost:5001/';
const HEADLESS = process.env.HEADLESS === '1';

const TOOLS = [
  { action: 'insert-text',    label: 'Texto'      },
  { action: 'insert-field',   label: 'Campo'      },
  { action: 'insert-line',    label: 'Línea H'    },
  { action: 'insert-line-v',  label: 'Línea V'    },
  { action: 'insert-box',     label: 'Rectángulo' },
  { action: 'insert-barcode', label: 'Barcode'    },
];

// Inject the LEGACY (pre-fix) behavior: hide() then insert → leaves preview.
const INJECT_LEGACY = `(function(){
  if (window.__META_legacy) return;
  window.__META_legacy = true;
  const IE = window.InsertEngine;
  const _origIAD = IE.insertAtDefaultPosition.bind(IE);
  IE.setTool = function(tool){
    if (tool !== 'pointer' && DS.previewMode && typeof PreviewEngineMode !== 'undefined'){
      PreviewEngineMode.hide();                 // legacy: exit preview
      if (tool !== 'section') _origIAD(tool);
      return;
    }
    DS.setTool(tool, 'InsertEngine.setTool');
    document.querySelectorAll('[data-tool]').forEach(b=>b.classList.toggle('active',b.dataset.tool===tool));
    const cs=document.getElementById('workspace');
    cs.className=''; cs.classList.add('tool-'+tool);
    if (tool==='pointer') SelectionEngine._drag=null;
  };
})();`;

const G='\x1b[32m', R='\x1b[31m', Y='\x1b[33m', X='\x1b[0m';
let failures = 0;
function assert(cond, msg){ console.log(`  ${cond?G+'PASS'+X:R+'FAIL'+X}  ${msg}`); if(!cond) failures++; }

async function ensureDesign(page){
  const inPrev = await page.evaluate(()=> typeof DS!=='undefined' && DS.previewMode);
  if(inPrev){ await page.locator('#tab-design').click(); await page.waitForTimeout(400); }
}
async function triggerInsert(page, action){
  await page.locator('.menu-item[data-menu="insertar"]').click();
  await page.waitForSelector('#dd-insertar', { state:'visible', timeout:3000 });
  await page.locator(`#dd-insertar .dd-item[data-action="${action}"]`).click();
  await page.waitForTimeout(1200); // allow async preview refresh
}
async function undo(page, before){
  const n = await page.evaluate(()=> DS.elements.length);
  if(n>before){ await page.keyboard.press('Control+z'); await page.waitForTimeout(300); }
}
async function probe(page, newId){
  return page.evaluate((id)=>{
    const cl=document.getElementById('canvas-layer');
    const pc=document.getElementById('preview-content');
    return {
      previewMode: !!DS.previewMode,
      canvasPreviewMode: cl?cl.classList.contains('preview-mode'):false,
      inPreview: pc ? !!pc.querySelector(`[data-id="${id}"],[data-origin-id="${id}"]`) : false,
      dsCount: DS.elements.length,
    };
  }, newId);
}
async function lastId(page){ return page.evaluate(()=>{ const e=DS.elements; return e.length?e[e.length-1].id:null; }); }

async function bootReady(page){
  await page.goto(TARGET, { waitUntil:'domcontentloaded' });
  await page.waitForFunction(()=>document.documentElement?.dataset?.rfRuntimeReady==='1', null, {timeout:15000});
  await page.waitForFunction(()=> typeof DS!=='undefined' && DS.elements.length>0, null, {timeout:10000});
  await page.waitForTimeout(800);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n'+'═'.repeat(72));
console.log('RF PREVIEW-INSERT STAY-IN-PREVIEW — METAMORPHIC (A/B/C)');
console.log(`Target: ${TARGET}`);
console.log('═'.repeat(72)+'\n');

const browser = await chromium.launch({ headless:HEADLESS, args:['--no-sandbox','--disable-dev-shm-usage'], slowMo:50 });
const page = await browser.newPage({ viewport:{width:1440,height:900} });
page.on('pageerror', e=>console.error('PAGEERROR:', e.message));

await bootReady(page);

// ── PHASE A — production fix ───────────────────────────────────────────────────
console.log('─'.repeat(72));
console.log('PHASE A — FIX APPLIED (production)  → expect stays in Preview');
console.log('─'.repeat(72));
for(const t of TOOLS){
  console.log(`\n  ${t.label} (${t.action})`);
  await ensureDesign(page); await page.keyboard.press('Escape');
  const before = await page.evaluate(()=>DS.elements.length);
  await page.locator('#tab-preview').click(); await page.waitForTimeout(1200);
  await triggerInsert(page, t.action);
  const id = await lastId(page);
  const p = await probe(page, id);
  assert(p.dsCount>before,          'DS +1');
  assert(p.previewMode===true,      'DS.previewMode stays true');
  assert(p.canvasPreviewMode===true,'#canvas-layer keeps preview-mode');
  assert(p.inPreview===true,        'element present in #preview-content');
  await ensureDesign(page); await undo(page, before);
}

// ── PHASE B — legacy injected (bug reproduced) ─────────────────────────────────
console.log('\n'+'─'.repeat(72));
console.log('PHASE B — FIX REMOVED (legacy hide injected)  → expect LEAVES Preview');
console.log('─'.repeat(72));
await page.evaluate(INJECT_LEGACY);
let reproduced = 0;
for(const t of TOOLS){
  console.log(`\n  ${t.label} (${t.action})`);
  await ensureDesign(page); await page.keyboard.press('Escape');
  const before = await page.evaluate(()=>DS.elements.length);
  await page.locator('#tab-preview').click(); await page.waitForTimeout(1200);
  await triggerInsert(page, t.action);
  const id = await lastId(page);
  const p = await probe(page, id);
  // Bug = leaves preview OR element not in preview-content
  const bug = (p.previewMode===false) || (p.canvasPreviewMode===false) || (p.inPreview===false);
  if(bug){ console.log(`  ${G}PASS${X}  bug reproduced (previewMode=${p.previewMode}, canvasPreview=${p.canvasPreviewMode}, inPreview=${p.inPreview})`); reproduced++; }
  else   { console.log(`  ${R}FAIL${X}  legacy injection did not reproduce the bug`); failures++; }
  await ensureDesign(page); await undo(page, before);
}
console.log(`\n  Bug reproduced for ${reproduced}/${TOOLS.length} tools`);

// ── PHASE C — reload production fix ────────────────────────────────────────────
console.log('\n'+'─'.repeat(72));
console.log('PHASE C — RELOAD (production fix)  → expect stays in Preview');
console.log('─'.repeat(72));
await bootReady(page);
console.log('  Page reloaded — production fix active.');
for(const t of TOOLS){
  console.log(`\n  ${t.label} (${t.action})`);
  await ensureDesign(page); await page.keyboard.press('Escape');
  const before = await page.evaluate(()=>DS.elements.length);
  await page.locator('#tab-preview').click(); await page.waitForTimeout(1200);
  await triggerInsert(page, t.action);
  const id = await lastId(page);
  const p = await probe(page, id);
  assert(p.dsCount>before,          'DS +1');
  assert(p.previewMode===true,      'DS.previewMode stays true');
  assert(p.canvasPreviewMode===true,'#canvas-layer keeps preview-mode');
  assert(p.inPreview===true,        'element present in #preview-content');
  await ensureDesign(page); await undo(page, before);
}

console.log('\n'+'═'.repeat(72));
if(failures===0){
  console.log(`${G}✔ METAMORPHIC PASS — A stays in Preview · B reproduces bug · C stays in Preview${X}`);
} else {
  console.log(`${R}✘ ${failures} assertion(s) FAILED${X}`);
}
console.log('═'.repeat(72)+'\n');

await browser.close();
process.exit(failures>0?1:0);
