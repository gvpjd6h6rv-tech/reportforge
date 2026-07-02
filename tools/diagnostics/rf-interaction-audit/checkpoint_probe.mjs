'use strict';
/**
 * CHECKPOINT PROBE — observation only, no fixes applied.
 * Demonstrates current (pre-fix) behavior for the 3 new bugs reported.
 */
import { chromium } from 'playwright';

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

async function insertFresh(tool) {
  return page.evaluate((t) => {
    const before = new Set(DS.elements.map(e => e.id));
    InsertEngine.insertAtDefaultPosition(t);
    const el = DS.elements.find(e => !before.has(e.id));
    return { id: el.id, type: el.type };
  }, tool);
}

console.log('\n=== BUG 1 PROBE: line selection shows box like a rect ===');
const lineH = await insertFresh('line');
const rectR = await insertFresh('box');
const sel1 = await page.evaluate(({ lineId, rectId }) => {
  DS.selectOnly(lineId, 'probe');
  SelectionEngine.renderHandles();
  const lineBoxes = document.querySelectorAll('.sel-box').length;
  const lineHandles = [...document.querySelectorAll('.sel-handle')].map(h => h.dataset.pos);
  DS.selectOnly(rectId, 'probe');
  SelectionEngine.renderHandles();
  const rectBoxes = document.querySelectorAll('.sel-box').length;
  const rectHandles = [...document.querySelectorAll('.sel-handle')].map(h => h.dataset.pos);
  return { lineBoxes, lineHandles, rectBoxes, rectHandles };
}, { lineId: lineH.id, rectId: rectR.id });
console.log('line selection:', JSON.stringify({ sel_box_count: sel1.lineBoxes, handles: sel1.lineHandles }));
console.log('rect selection:', JSON.stringify({ sel_box_count: sel1.rectBoxes, handles: sel1.rectHandles }));
console.log(sel1.lineBoxes > 0 && sel1.lineHandles.length === 8 ? 'CONFIRMED: line gets the SAME .sel-box + 8 handles as a rect (CR-parity violated)' : 'not reproduced');

console.log('\n=== BUG 2 PROBE: resize line box does not update SVG geometry ===');
const lineR = await insertFresh('line');
await page.evaluate((id) => {
  const e = DS.elements.find(x => x.id === id);
  e.w = 200; e.h = 2; e.lineDir = 'h';
  _canonicalCanvasWriter().updateElementPosition(id);
  _canonicalCanvasWriter().updateElement(id);
}, lineR.id);
const before2 = await page.evaluate((id) => {
  const div = document.querySelector(`.cr-element[data-id="${id}"]`);
  const svg = div.querySelector('svg');
  const line = div.querySelector('svg line');
  return { divWidth: div.style.width, svgWidth: svg.getAttribute('width'), x2: line.getAttribute('x2') };
}, lineR.id);
// Simulate a resize (halve the width) the same way _doResize does: updateElementLayout + updateElementPosition
await page.evaluate((id) => {
  const e = DS.elements.find(x => x.id === id);
  e.w = 100; // halved
  _canonicalCanvasWriter().updateElementPosition(id); // exactly what _doResize calls
}, lineR.id);
const after2 = await page.evaluate((id) => {
  const div = document.querySelector(`.cr-element[data-id="${id}"]`);
  const svg = div.querySelector('svg');
  const line = div.querySelector('svg line');
  return { divWidth: div.style.width, svgWidth: svg.getAttribute('width'), x2: line.getAttribute('x2') };
}, lineR.id);
console.log('before (w=200):', JSON.stringify(before2));
console.log('after updateElementPosition(w=100):', JSON.stringify(after2));
console.log(after2.divWidth === '100px' && after2.svgWidth !== '100' ? 'CONFIRMED: container div resizes but inner SVG width/x2 stay stale (visual line does not shrink)' : 'not reproduced as expected');

console.log('\n=== BUG 3 PROBE: insert line via click-without-drag creates an arbitrary box-shaped line ===');
await page.evaluate(() => InsertEngine.setTool('line'));
await page.waitForTimeout(100);
const idsBefore3 = await page.evaluate(() => DS.elements.map(e => e.id));
// A plain click (mousedown+mouseup at the same point, no movement) via the real routed pointer path
const target = await page.evaluate(() => { const r = document.getElementById('workspace').getBoundingClientRect(); return { x: r.left + 300, y: r.top + 300 }; });
await page.mouse.move(target.x, target.y);
await page.mouse.down();
await page.mouse.up();
await page.waitForTimeout(200);
const idsAfter3 = await page.evaluate(() => DS.elements.map(e => e.id));
const newId3 = idsAfter3.find(id => !idsBefore3.includes(id));
const newEl3 = newId3 ? await page.evaluate((id) => { const e = DS.elements.find(x => x.id === id); return { type: e.type, w: e.w, h: e.h, lineDir: e.lineDir }; }, newId3) : null;
console.log('click-without-drag result:', JSON.stringify(newEl3));
console.log(newEl3 && newEl3.w === 20 && newEl3.h === 12 ? 'CONFIRMED: plain click creates an arbitrary 20x12 box-shaped "line" (generic box fallback, not a documented minimal line)' : 'different result: ' + JSON.stringify(newEl3));
await page.evaluate(() => InsertEngine.setTool('pointer'));

console.log('\n=== BUG 3b PROBE: insert line via a real diagonal-ish drag does not stay thin/horizontal ===');
await page.evaluate(() => InsertEngine.setTool('line'));
await page.waitForTimeout(100);
const idsBefore3b = await page.evaluate(() => DS.elements.map(e => e.id));
await page.mouse.move(target.x, target.y);
await page.mouse.down();
await page.mouse.move(target.x + 150, target.y + 40, { steps: 6 }); // mostly horizontal drag with some vertical wobble
await page.mouse.up();
await page.waitForTimeout(200);
const idsAfter3b = await page.evaluate(() => DS.elements.map(e => e.id));
const newId3b = idsAfter3b.find(id => !idsBefore3b.includes(id));
const newEl3b = newId3b ? await page.evaluate((id) => { const e = DS.elements.find(x => x.id === id); return { type: e.type, w: e.w, h: e.h, lineDir: e.lineDir }; }, newId3b) : null;
console.log('drag (dx=150,dy=40) result:', JSON.stringify(newEl3b));
console.log(newEl3b && newEl3b.h > 2 ? `CONFIRMED: horizontal line drag with vertical wobble produced h=${newEl3b.h} (not forced thin/horizontal)` : 'thin/horizontal as expected');

console.log('\nConsole errors:', consoleErrors.length ? consoleErrors : 'none');
await browser.close();
