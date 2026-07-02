'use strict';
/**
 * Fase 1 (3 line bugs) + BUG NEW 4 (hit-test resolver) — formal gates.
 * Diagnostic tool. Not CI. Run manually.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';

const TARGET = process.env.FLIGHT_URL || 'http://localhost:5001/';
const SHOT_DIR = '/tmp/claude-1000/-home-mimi-Escritorio-Claude/d0ec36be-65be-4e3b-b108-bf76e3f7b3d8/scratchpad/gates-fase1-bugnew4';
fs.mkdirSync(SHOT_DIR, { recursive: true });

let pass = 0, fail = 0;
function gate(id, label, ok, evidence) {
  if (ok) pass++; else fail++;
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${id} ${label}`);
  console.log(`      evidence: ${JSON.stringify(evidence)}`);
}

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const consoleErrors = [];
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', e => consoleErrors.push('PAGEERROR: ' + e.message));

await page.goto(TARGET, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.documentElement?.dataset?.rfRuntimeReady === '1', null, { timeout: 15000 });
await page.waitForFunction(() => typeof DS !== 'undefined' && DS.elements.length > 0, null, { timeout: 10000 });
await page.waitForTimeout(500);

async function insertFresh(tool) {
  return page.evaluate((t) => {
    const before = new Set(DS.elements.map(e => e.id));
    InsertEngine.insertAtDefaultPosition(t);
    const el = DS.elements.find(e => !before.has(e.id));
    return { id: el.id, type: el.type };
  }, tool);
}
async function selectEl(id) {
  await page.evaluate((id) => { DS.selectOnly(id, 'gates'); SelectionEngine.renderHandles(); }, id);
  await page.waitForTimeout(80);
}

// ============================================================
console.log('\n===================== GATE F1-1: line selection H/V =====================');
const lineH = await insertFresh('line');
await selectEl(lineH.id);
const selH = await page.evaluate(() => ({
  selBoxCount: document.querySelectorAll('.sel-box').length,
  handles: [...document.querySelectorAll('.sel-handle')].map(h => h.dataset.pos),
}));
gate('F1-1a', 'horizontal line: no .sel-box, handles subset of {w,e}', selH.selBoxCount === 0 && selH.handles.length === 2 && selH.handles.every(p => ['w', 'e'].includes(p)), selH);

const lineV = await insertFresh('line-v');
await selectEl(lineV.id);
const selV = await page.evaluate(() => ({
  selBoxCount: document.querySelectorAll('.sel-box').length,
  handles: [...document.querySelectorAll('.sel-handle')].map(h => h.dataset.pos),
}));
gate('F1-1b', 'vertical line: no .sel-box, handles subset of {n,s}', selV.selBoxCount === 0 && selV.handles.length === 2 && selV.handles.every(p => ['n', 's'].includes(p)), selV);

const rectR = await insertFresh('box');
await selectEl(rectR.id);
const selRect = await page.evaluate(() => ({
  selBoxCount: document.querySelectorAll('.sel-box').length,
  handles: [...document.querySelectorAll('.sel-handle')].map(h => h.dataset.pos),
}));
gate('F1-1c', 'rect still gets .sel-box + 8 handles (unchanged)', selRect.selBoxCount === 1 && selRect.handles.length === 8, selRect);

const fieldR = await insertFresh('field');
await selectEl(fieldR.id);
const selField = await page.evaluate(() => ({
  selBoxCount: document.querySelectorAll('.sel-box').length,
  handles: [...document.querySelectorAll('.sel-handle')].map(h => h.dataset.pos),
}));
gate('F1-1d', 'field still gets .sel-box + 8 handles (unchanged)', selField.selBoxCount === 1 && selField.handles.length === 8, selField);

// ============================================================
console.log('\n===================== GATE F1-2: resize line H =====================');
const lineH2 = await insertFresh('line');
await page.evaluate((id) => { const e = DS.elements.find(x => x.id === id); e.w = 200; e.h = 2; _canonicalCanvasWriter().updateElementPosition(id); }, lineH2.id);
const g12_before = await page.evaluate((id) => {
  const div = document.querySelector(`.cr-element[data-id="${id}"]`);
  const svg = div.querySelector('svg'); const line = div.querySelector('svg line');
  return { divW: div.style.width, svgW: svg.getAttribute('width'), x2: line.getAttribute('x2') };
}, lineH2.id);
// halve via the exact call _doResize makes
await page.evaluate((id) => { const e = DS.elements.find(x => x.id === id); e.w = 100; _canonicalCanvasWriter().updateElementPosition(id); }, lineH2.id);
const g12_half = await page.evaluate((id) => {
  const div = document.querySelector(`.cr-element[data-id="${id}"]`);
  const svg = div.querySelector('svg'); const line = div.querySelector('svg line');
  return { divW: div.style.width, svgW: svg.getAttribute('width'), x2: line.getAttribute('x2') };
}, lineH2.id);
gate('F1-2a', 'resize to half: div/svg/line.x2 all == 100', g12_half.divW === '100px' && g12_half.svgW === '100' && g12_half.x2 === '100', { before: g12_before, after: g12_half });
await page.evaluate((id) => { const e = DS.elements.find(x => x.id === id); e.w = 400; _canonicalCanvasWriter().updateElementPosition(id); }, lineH2.id);
const g12_double = await page.evaluate((id) => {
  const div = document.querySelector(`.cr-element[data-id="${id}"]`);
  const svg = div.querySelector('svg'); const line = div.querySelector('svg line');
  return { divW: div.style.width, svgW: svg.getAttribute('width'), x2: line.getAttribute('x2') };
}, lineH2.id);
gate('F1-2b', 'resize to double: div/svg/line.x2 all == 400, no stale SVG', g12_double.divW === '400px' && g12_double.svgW === '400' && g12_double.x2 === '400', g12_double);

console.log('\n===================== GATE F1-3: resize line V =====================');
const lineV2 = await insertFresh('line-v');
await page.evaluate((id) => { const e = DS.elements.find(x => x.id === id); e.w = 2; e.h = 200; _canonicalCanvasWriter().updateElementPosition(id); }, lineV2.id);
await page.evaluate((id) => { const e = DS.elements.find(x => x.id === id); e.h = 100; _canonicalCanvasWriter().updateElementPosition(id); }, lineV2.id);
const g13_half = await page.evaluate((id) => {
  const div = document.querySelector(`.cr-element[data-id="${id}"]`);
  const svg = div.querySelector('svg'); const line = div.querySelector('svg line');
  return { divH: div.style.height, svgH: svg.getAttribute('height'), y2: line.getAttribute('y2') };
}, lineV2.id);
gate('F1-3a', 'vertical resize to half: div/svg/line.y2 all == 100', g13_half.divH === '100px' && g13_half.svgH === '100' && g13_half.y2 === '100', g13_half);

// ============================================================
console.log('\n===================== GATE F1-4: insert line (click vs drag) =====================');
async function emptyPoint(secId) {
  return page.evaluate((secId) => {
    const div = document.querySelector(`.cr-section[data-section-id="${secId}"]`);
    const r = div.getBoundingClientRect();
    for (let y = r.top + 5; y < r.top + r.height - 5; y += 4) {
      for (let x = r.left + 5; x < r.left + r.width - 5; x += 8) {
        const el = document.elementFromPoint(x, y);
        if (el && !el.closest('.cr-element')) return { x, y };
      }
    }
    return null;
  }, secId);
}
const pt1 = await emptyPoint('s-pf');
await page.evaluate(() => InsertEngine.setTool('line'));
await page.waitForTimeout(80);
const idsBeforeClick = await page.evaluate(() => DS.elements.map(e => e.id));
await page.mouse.move(pt1.x, pt1.y);
await page.mouse.down(); await page.mouse.up();
await page.waitForTimeout(150);
const idsAfterClick = await page.evaluate(() => DS.elements.map(e => e.id));
const clickId = idsAfterClick.find(id => !idsBeforeClick.includes(id));
const clickEl = clickId ? await page.evaluate((id) => { const e = DS.elements.find(x => x.id === id); return { w: e.w, h: e.h }; }, clickId) : null;
gate('F1-4a', 'click-without-drag on line does NOT create generic 20x12 box', clickEl && !(Math.round(clickEl.w) === 20 && Math.round(clickEl.h) === 12), clickEl);

const pt2 = await emptyPoint('s-rh');
await page.evaluate(() => InsertEngine.setTool('line'));
await page.waitForTimeout(80);
const idsBeforeDrag = await page.evaluate(() => DS.elements.map(e => e.id));
await page.mouse.move(pt2.x, pt2.y);
await page.mouse.down();
await page.mouse.move(pt2.x + 150, pt2.y + 40, { steps: 8 }); // horizontal drag w/ vertical wobble
await page.mouse.up();
await page.waitForTimeout(150);
const idsAfterDrag = await page.evaluate(() => DS.elements.map(e => e.id));
const dragId = idsAfterDrag.find(id => !idsBeforeDrag.includes(id));
const dragEl = dragId ? await page.evaluate((id) => { const e = DS.elements.find(x => x.id === id); return { w: e.w, h: e.h, lineDir: e.lineDir }; }, dragId) : null;
gate('F1-4b', 'horizontal drag w/ vertical wobble: h stays thin (==2), w follows dx (~150)', dragEl && dragEl.h === 2 && dragEl.w > 100 && dragEl.w < 200, dragEl);

const pt3 = await emptyPoint('s-ph');
await page.evaluate(() => InsertEngine.setTool('line-v'));
await page.waitForTimeout(80);
const idsBeforeDragV = await page.evaluate(() => DS.elements.map(e => e.id));
await page.mouse.move(pt3.x, pt3.y);
await page.mouse.down();
await page.mouse.move(pt3.x + 30, pt3.y + 50, { steps: 8 }); // vertical drag w/ horizontal wobble
await page.mouse.up();
await page.waitForTimeout(150);
const idsAfterDragV = await page.evaluate(() => DS.elements.map(e => e.id));
const dragVId = idsAfterDragV.find(id => !idsBeforeDragV.includes(id));
const dragVEl = dragVId ? await page.evaluate((id) => { const e = DS.elements.find(x => x.id === id); return { w: e.w, h: e.h, lineDir: e.lineDir }; }, dragVId) : null;
gate('F1-4c', 'vertical drag w/ horizontal wobble: w stays thin (==2), h follows dy', dragVEl && dragVEl.w === 2 && dragVEl.h > 30, dragVEl);
await page.evaluate(() => InsertEngine.setTool('pointer'));

console.log('\n--- F1-4d: same click/drag contract in Preview ---');
await page.locator('#tab-preview').click();
await page.waitForTimeout(1200);
await page.evaluate(() => InsertEngine.setTool('line'));
await page.waitForTimeout(80);
const pSecs = await page.evaluate(() => [...document.querySelectorAll('#preview-content .preview-render-layer .cr-section')].map(s => { const r = s.getBoundingClientRect(); return { id: s.dataset.sectionId, top: r.top, left: r.left, width: r.width, height: r.height }; }));
const pf = pSecs.find(s => s.id === 's-pf');
const ptP = await page.evaluate((rect) => {
  for (let y = rect.top + 5; y < rect.top + rect.height - 5; y += 4) {
    for (let x = rect.left + 5; x < rect.left + rect.width - 5; x += 8) {
      const el = document.elementFromPoint(x, y);
      if (el && !el.closest('.pv-el')) return { x, y };
    }
  }
  return null;
}, pf);
const idsBeforeP = await page.evaluate(() => DS.elements.map(e => e.id));
await page.mouse.move(ptP.x, ptP.y);
await page.mouse.down();
await page.mouse.move(ptP.x + 120, ptP.y + 30, { steps: 6 });
await page.mouse.up();
await page.waitForTimeout(300);
const idsAfterP = await page.evaluate(() => DS.elements.map(e => e.id));
const pId = idsAfterP.find(id => !idsBeforeP.includes(id));
const pEl = pId ? await page.evaluate((id) => { const e = DS.elements.find(x => x.id === id); return { w: e.w, h: e.h, sectionId: e.sectionId }; }, pId) : null;
gate('F1-4d', 'Preview: horizontal line drag also stays thin', pEl && pEl.h === 2 && pEl.w > 80, pEl);
await page.evaluate(() => InsertEngine.setTool('pointer'));
await page.locator('#tab-design').click();
await page.waitForTimeout(400);

// ============================================================
console.log('\n===================== GATE S1/S2: BUG NEW 4 hit-test resolver (Design) =====================');
async function buildHitFixture(rectOrder) {
  return page.evaluate((rectOrder) => {
    const secId = 's-d1';
    const sec = DS.sections.find(s => s.id === secId);
    sec.height = 90;
    const secDiv = document.querySelector(`.cr-section[data-section-id="${secId}"]`);
    if (secDiv) secDiv.style.height = sec.height + 'px';
    const others = DS.elements.filter(e => e.sectionId !== secId);
    const rect = mkEl('rect', secId, 0, 0, 600, 80, { bgColor: 'transparent', borderColor: '#C0511A', borderWidth: 2 });
    const f1 = mkEl('field', secId, 50, 20, 200, 16, { fieldPath: 'fiscal.numero_documento', content: '' });
    const f2 = mkEl('field', secId, 300, 40, 200, 16, { fieldPath: 'cliente.razon_social', content: '' });
    const ordered = rectOrder === 'before' ? [rect, f1, f2] : [f1, f2, rect];
    DS.setElements([...others, ...ordered], 'gates_fixture');
    _canonicalCanvasWriter().renderAll();
    return { rectId: rect.id, f1Id: f1.id, f2Id: f2.id };
  }, rectOrder);
}
const fx = await buildHitFixture('after'); // the failing case pre-fix
const f1Rect = await page.evaluate((id) => document.querySelector(`.cr-element[data-id="${id}"]`).getBoundingClientRect(), fx.f1Id);
const clickPt = { x: f1Rect.x + f1Rect.width / 2, y: f1Rect.y + f1Rect.height / 2 };
await page.mouse.move(clickPt.x, clickPt.y);
await page.mouse.down(); await page.mouse.up();
await page.waitForTimeout(150);
const sel1 = await page.evaluate(() => [...DS.selection]);
gate('S1', 'click on inner field (rect AFTER, same z) selects the FIELD, not the rect', sel1[0] === fx.f1Id, { selected: sel1, expectedField: fx.f1Id });
const propType1 = await page.evaluate(() => document.querySelector('#props-form .prop-row span[style*="font-weight:bold"]')?.textContent);
gate('S1b', 'Properties panel shows Tipo: Campo', propType1 === 'Campo', { propType: propType1 });

// hover check
await page.mouse.move(clickPt.x + 1, clickPt.y + 1);
await page.waitForTimeout(150);
const hoverResult = await page.evaluate(() => {
  const el = document.querySelector('.rf-hit-hover');
  return el ? el.dataset.id : null;
});
gate('S1c', 'hover also marks the field, same resolver as click', hoverResult === fx.f1Id, { hovered: hoverResult, expectedField: fx.f1Id });

// S2: rect border still selectable
const rectRect = await page.evaluate((id) => document.querySelector(`.cr-element[data-id="${id}"]`).getBoundingClientRect(), fx.rectId);
const borderPt = { x: rectRect.x + 1, y: rectRect.y + rectRect.height - 5 }; // free bottom-left corner, away from fields
await page.mouse.move(borderPt.x, borderPt.y);
await page.mouse.down(); await page.mouse.up();
await page.waitForTimeout(150);
const sel2 = await page.evaluate(() => [...DS.selection]);
gate('S2', 'click on free area of the rect (away from fields) selects the RECT', sel2[0] === fx.rectId, { selected: sel2, expectedRect: fx.rectId });
const propType2 = await page.evaluate(() => document.querySelector('#props-form .prop-row span[style*="font-weight:bold"]')?.textContent);
gate('S2b', 'Properties panel shows Tipo: Rectángulo', propType2 === 'Rectángulo', { propType: propType2 });

// second inner field too
const f2Rect = await page.evaluate((id) => document.querySelector(`.cr-element[data-id="${id}"]`).getBoundingClientRect(), fx.f2Id);
const pt2b = { x: f2Rect.x + f2Rect.width / 2, y: f2Rect.y + f2Rect.height / 2 };
await page.mouse.move(pt2b.x, pt2b.y);
await page.mouse.down(); await page.mouse.up();
await page.waitForTimeout(150);
const self2b = await page.evaluate(() => [...DS.selection]);
gate('S1d', 'second inner field also selectable (not stuck on first)', self2b[0] === fx.f2Id, { selected: self2b, expected: fx.f2Id });

// explicit zIndex still respected
const fxZ = await page.evaluate(() => {
  const secId = 's-d1';
  const others = DS.elements.filter(e => e.sectionId !== secId);
  // Fields default to the CSS class's computed z-index (--rf-z-canvas, ~20)
  // when they carry no explicit zIndex of their own -- 9 would still lose to
  // that natively. Use something unambiguously higher to test "explicit
  // zIndex intentionally puts the rect on top".
  const rect = mkEl('rect', secId, 0, 0, 600, 80, { bgColor: 'transparent', borderColor: '#C0511A', borderWidth: 2, zIndex: 99 });
  const f1 = mkEl('field', secId, 50, 20, 200, 16, { fieldPath: 'x', content: '' });
  DS.setElements([...others, f1, rect], 'gates_fixture_z');
  _canonicalCanvasWriter().renderAll();
  return { rectId: rect.id, f1Id: f1.id };
});
const f1RectZ = await page.evaluate((id) => document.querySelector(`.cr-element[data-id="${id}"]`).getBoundingClientRect(), fxZ.f1Id);
const clickPtZ = { x: f1RectZ.x + f1RectZ.width / 2, y: f1RectZ.y + f1RectZ.height / 2 };
await page.mouse.move(clickPtZ.x, clickPtZ.y);
await page.mouse.down(); await page.mouse.up();
await page.waitForTimeout(150);
const selZ = await page.evaluate(() => [...DS.selection]);
gate('S1e', 'explicit zIndex=9 on rect is respected (rect intentionally on top wins)', selZ[0] === fxZ.rectId, { selected: selZ, rect: fxZ.rectId });

console.log('\n' + '='.repeat(70));
console.log(`RESULT SO FAR: ${pass} passed, ${fail} failed`);
console.log('Console errors:', consoleErrors.length ? consoleErrors : 'none');

await browser.close();
process.exit(fail > 0 ? 1 : 0);
