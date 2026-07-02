'use strict';
/**
 * FASE 2 — drag/move audit, all element types, Design + Preview.
 * Each element is placed in its own non-overlapping slot (Page Footer has
 * ample room) so a click unambiguously targets the intended element instead
 * of whatever else happens to be piled at the generic insertAtDefaultPosition
 * spot. Diagnostic tool. Not CI.
 */
import { chromium } from 'playwright';

let pass = 0, fail = 0;
function gate(id, label, ok, evidence) {
  if (ok) pass++; else fail++;
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${id} ${label}`);
  console.log(`      evidence: ${JSON.stringify(evidence)}`);
}

const TARGET = process.env.FLIGHT_URL || 'http://localhost:5001/';
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const consoleErrors = [];
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', e => consoleErrors.push('PAGEERROR: ' + e.message));

await page.goto(TARGET, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.documentElement?.dataset?.rfRuntimeReady === '1', null, { timeout: 15000 });
await page.waitForFunction(() => typeof DS !== 'undefined' && DS.elements.length > 0, null, { timeout: 10000 });
await page.waitForTimeout(500);

let _slot = 0;
async function insertFreshSlot(tool) {
  // Page footer (s-pf) is 120 tall by default -- grow it generously and hand
  // each element its own row so nothing overlaps another test's element.
  const row = _slot++;
  const id = await page.evaluate(({ tool, row }) => {
    const sec = DS.sections.find(s => s.id === 's-pf');
    sec.height = Math.max(sec.height, 40 * (row + 2));
    const secDiv = document.querySelector('.cr-section[data-section-id="s-pf"]');
    if (secDiv) secDiv.style.height = sec.height + 'px';
    const before = new Set(DS.elements.map(e => e.id));
    InsertEngine.insertAtDefaultPosition(tool);
    return DS.elements.find(e => !before.has(e.id)).id;
  }, { tool, row });
  if (tool === 'text') {
    // insertAtDefaultPosition('text') schedules a 50ms setTimeout capturing
    // the div it just created, to auto-focus it for inline editing. Let it
    // fire and settle (and blur it) BEFORE removing/recreating that same div
    // below to relocate it -- otherwise the timer's captured div reference
    // goes stale/detached mid-flight.
    await page.waitForTimeout(100);
    await page.evaluate(() => { const a = document.activeElement; if (a && a.blur) a.blur(); });
  }
  return page.evaluate(({ id, row }) => {
    const el = DS.elements.find(e => e.id === id);
    el.sectionId = 's-pf'; el.x = 20; el.y = 10 + row * 40;
    if (el.type !== 'line' || el.lineDir !== 'v') el.w = Math.min(el.w, 150);
    document.querySelector(`.cr-element[data-id="${el.id}"]`)?.remove();
    _canonicalCanvasWriter().renderElement(el);
    return { id: el.id, type: el.type };
  }, { id, row });
}

console.log('\n===================== Insert sanity: all types, Design =====================');
for (const tool of ['text', 'field', 'box', 'line', 'line-v', 'barcode']) {
  const before = await page.evaluate(() => DS.elements.length);
  const el = await insertFreshSlot(tool);
  const after = await page.evaluate(() => DS.elements.length);
  gate(`INS-D-${tool}`, `insert ${tool} in Design creates exactly one element`, after === before + 1 && el.type != null, { before, after, el });
}

console.log('\n===================== Drag/move: all types, Design =====================');
async function dragMoveTest(tool) {
  const el = await insertFreshSlot(tool);
  if (tool === 'text') { await page.waitForTimeout(200); await page.evaluate(() => { const a = document.activeElement; if (a && a.blur) a.blur(); }); }
  await page.evaluate((id) => { DS.selectOnly(id, 'gates'); SelectionEngine.renderHandles(); }, el.id);
  await page.waitForTimeout(100);
  const before = await page.evaluate((id) => { const e = DS.elements.find(x => x.id === id); return { x: e.x, y: e.y, sectionId: e.sectionId }; }, el.id);
  // insertAtDefaultPosition() schedules its own async scrollIntoView() for
  // each newly-created element (via RenderScheduler.post); with several
  // slots stacked up that scroll can still be settling when the NEXT
  // insertFreshSlot's divRect gets measured, racing the click. Scroll
  // explicitly and let it settle before measuring.
  await page.evaluate((id) => document.querySelector(`.cr-element[data-id="${id}"]`).scrollIntoView({ block: 'center' }), el.id);
  await page.waitForTimeout(150);
  const divRect = await page.evaluate((id) => document.querySelector(`.cr-element[data-id="${id}"]`).getBoundingClientRect(), el.id);
  const startPt = { x: divRect.x + divRect.width / 2, y: divRect.y + divRect.height / 2 };
  await page.mouse.move(startPt.x, startPt.y);
  await page.mouse.down();
  await page.mouse.move(startPt.x + 60, startPt.y + 8, { steps: 6 }); // small dy -- avoids section-height clamping ambiguity
  await page.mouse.up();
  await page.waitForTimeout(150);
  const after = await page.evaluate((id) => { const e = DS.elements.find(x => x.id === id); return { x: e.x, y: e.y, sectionId: e.sectionId }; }, el.id);
  const divRectAfter = await page.evaluate((id) => document.querySelector(`.cr-element[data-id="${id}"]`).getBoundingClientRect(), el.id);
  const visualMoved = Math.abs(divRectAfter.x - divRect.x) > 30;
  return { before, after, visualMoved, moved: after.x !== before.x || after.y !== before.y };
}
for (const tool of ['text', 'field', 'box', 'line', 'line-v', 'barcode']) {
  const r = await dragMoveTest(tool);
  gate(`DRAG-D-${tool}`, `drag ${tool} in Design: x/y change + visual follows mouse`, r.moved && r.visualMoved, r);
}

console.log('\n===================== Drag/move: all types, Preview =====================');
// A fresh page per tool avoids any cumulative scroll/selection/timer state
// from prior iterations in the same session -- isolated single-element
// checks proved the underlying drag/move works; this keeps the harness from
// producing false negatives unrelated to the product.
async function dragMoveTestPreviewFresh(tool) {
  const p = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto(TARGET, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => document.documentElement?.dataset?.rfRuntimeReady === '1', null, { timeout: 15000 });
  await p.waitForFunction(() => typeof DS !== 'undefined' && DS.elements.length > 0, null, { timeout: 10000 });
  await p.waitForTimeout(500);
  const id = await p.evaluate((tool) => {
    const before = new Set(DS.elements.map(e => e.id));
    InsertEngine.insertAtDefaultPosition(tool);
    return DS.elements.find(e => !before.has(e.id)).id;
  }, tool);
  if (tool === 'text') { await p.waitForTimeout(150); await p.evaluate(() => { const a = document.activeElement; if (a && a.blur) a.blur(); }); }
  await p.evaluate((id) => {
    const e = DS.elements.find(x => x.id === id);
    e.sectionId = 's-pf'; e.x = 20; e.y = 10; e.w = Math.min(e.w, 150);
    document.querySelector(`.cr-element[data-id="${id}"]`)?.remove();
    _canonicalCanvasWriter().renderElement(e);
  }, id);
  await p.locator('#tab-preview').click();
  await p.waitForTimeout(1200);
  const before = await p.evaluate((id) => { const e = DS.elements.find(x => x.id === id); return { x: e.x, y: e.y }; }, id);
  const node = await p.evaluate((id) => {
    const n = document.querySelector(`.preview-hit-layer .pv-el[data-origin-id="${id}"]`);
    return n ? n.getBoundingClientRect() : null;
  }, id);
  if (!node) { await p.close(); return { skipped: true, reason: 'hit-layer node not found', tool }; }
  await p.evaluate((id) => { DS.selectOnly(id, 'gates'); SelectionEngine.renderHandles(); }, id);
  await p.waitForTimeout(100);
  const startPt = { x: node.x + node.width / 2, y: node.y + node.height / 2 };
  await p.mouse.move(startPt.x, startPt.y);
  await p.mouse.down();
  await p.mouse.move(startPt.x + 50, startPt.y + 8, { steps: 6 });
  await p.mouse.up();
  await p.waitForTimeout(150);
  const after = await p.evaluate((id) => { const e = DS.elements.find(x => x.id === id); return { x: e.x, y: e.y }; }, id);
  await p.close();
  return { before, after, moved: after.x !== before.x || after.y !== before.y };
}
for (const tool of ['text', 'field', 'box', 'line', 'line-v', 'barcode']) {
  const r = await dragMoveTestPreviewFresh(tool);
  if (r.skipped) { gate(`DRAG-P-${tool}`, `drag ${tool} in Preview (SKIPPED: ${r.reason})`, false, r); continue; }
  gate(`DRAG-P-${tool}`, `drag ${tool} in Preview: x/y change`, r.moved, r);
}

console.log('\n' + '='.repeat(70));
console.log(`RESULT: ${pass} passed, ${fail} failed`);
console.log('Console errors:', consoleErrors.length ? consoleErrors : 'none');

await browser.close();
process.exit(fail > 0 ? 1 : 0);
