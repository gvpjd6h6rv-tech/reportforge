'use strict';
import { chromium } from 'playwright';

const TARGET = process.env.FLIGHT_URL || 'http://localhost:5001/';
const G = '\x1b[32m', R = '\x1b[31m', X = '\x1b[0m';
function mark(ok) { return ok ? `${G}PASS${X}` : `${R}FAIL${X}`; }

let pass = 0, fail = 0;
function check(label, ok, extra) {
  if (ok) pass++; else fail++;
  console.log(`${mark(ok)}  ${label}${extra ? '  (' + extra + ')' : ''}`);
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

// Finds a screen point inside `rect` that does NOT land on an existing hit
// target (.pv-el in Preview, .cr-element in Design), so an insert-click gate
// exercises genuinely-empty canvas instead of accidentally selecting something.
async function findEmptyPoint(rect, hitSelector) {
  return page.evaluate(({ rect, hitSelector }) => {
    for (let y = rect.top + 4; y < rect.top + rect.height - 4; y += 4) {
      for (let x = rect.left + 4; x < rect.left + rect.width - 4; x += 10) {
        const el = document.elementFromPoint(x, y);
        if (el && !el.closest(hitSelector)) return { x, y };
      }
    }
    return null;
  }, { rect, hitSelector });
}

async function previewSections() {
  return page.evaluate(() => [...document.querySelectorAll('#preview-content .preview-render-layer .cr-section')].map(s => {
    const r = s.getBoundingClientRect();
    return { id: s.dataset.sectionId, top: r.top, left: r.left, width: r.width, height: r.height };
  }));
}
async function designSections() {
  return page.evaluate(() => [...document.querySelectorAll('#sections-layer .cr-section')].map(s => {
    const r = s.getBoundingClientRect();
    return { id: s.dataset.sectionId, top: r.top, left: r.left, width: r.width, height: r.height };
  }));
}

console.log('\n=== Enter Preview ===');
await page.locator('#tab-preview').click();
await page.waitForTimeout(1500);
check('DS.previewMode true after clicking tab-preview', await page.evaluate(() => !!DS.previewMode));

// ---------------------------------------------------------------
// GATE 1: no premature insertion on tool selection
// ---------------------------------------------------------------
console.log('\n=== GATE 1: no premature insertion ===');
const before1 = await page.evaluate(() => DS.elements.length);
await page.locator('#tool-box').click();
await page.waitForTimeout(200);
check('DS.elements.length unchanged after selecting insert-box', await page.evaluate(() => DS.elements.length) === before1, `${before1} -> ${await page.evaluate(() => DS.elements.length)}`);
check('DS.tool armed to "box"', await page.evaluate(() => DS.tool) === 'box');
await page.evaluate(() => InsertEngine.setTool('pointer'));

// ---------------------------------------------------------------
// GATE 2: insertion by click lands at the clicked section/position
// ---------------------------------------------------------------
console.log('\n=== GATE 2: insertion by click respects mouse position (Page Footer) ===');
const pSecs = await previewSections();
const pf = pSecs.find(s => s.id === 's-pf');
const clickPt = await findEmptyPoint(pf, '.pv-el');
console.log('page-footer rect:', JSON.stringify(pf), '  empty click point:', JSON.stringify(clickPt));

await page.locator('#tool-box').click();
await page.waitForTimeout(150);
const idsBefore2 = await page.evaluate(() => DS.elements.map(e => e.id));
await page.mouse.click(clickPt.x, clickPt.y);
await page.waitForTimeout(400);
const idsAfter2 = await page.evaluate(() => DS.elements.map(e => e.id));
const newId2 = idsAfter2.find(id => !idsBefore2.includes(id));
check('exactly one new element after click', idsAfter2.length === idsBefore2.length + 1, `${idsBefore2.length} -> ${idsAfter2.length}`);
const newEl2 = newId2 && await page.evaluate((id) => { const e = DS.elements.find(x => x.id === id); return e && { type: e.type, sectionId: e.sectionId, x: e.x, y: e.y, w: e.w, h: e.h }; }, newId2);
console.log('new element:', JSON.stringify(newEl2));
check('new element section === clicked section (s-pf)', newEl2 && newEl2.sectionId === 's-pf', `got ${newEl2 && newEl2.sectionId}`);
check('x is NOT the old default-centered x (277)', newEl2 && newEl2.x !== 277, 'x=' + (newEl2 && newEl2.x));
check('relY is NOT the old default y=4', newEl2 && newEl2.y !== 4, 'y=' + (newEl2 && newEl2.y));
check('tool resets to pointer after single click-insert', await page.evaluate(() => DS.tool) === 'pointer');

const c2 = await page.evaluate(() => DS.elements.length);
await page.keyboard.press('Control+z');
await page.waitForTimeout(300);
check('undo restores element count', await page.evaluate(() => DS.elements.length) === c2 - 1);

// ---------------------------------------------------------------
// GATE 3/4: insertion by drag derives x/y/w/h from the drag (line tool, Report Header)
// ---------------------------------------------------------------
console.log('\n=== GATE 3/4: insertion by drag (insert-line, Report Header) ===');
const pSecs2 = await previewSections();
const rh = pSecs2.find(s => s.id === 's-rh');
const p1 = await findEmptyPoint({ top: rh.top, left: rh.left, width: rh.width * 0.4, height: rh.height }, '.pv-el');
const p2 = { x: p1.x + 150, y: p1.y };
console.log('report-header rect:', JSON.stringify(rh), 'drag from', JSON.stringify(p1), 'to', JSON.stringify(p2));

await page.locator('#tool-line').click();
await page.waitForTimeout(150);
const idsBefore3 = await page.evaluate(() => DS.elements.map(e => e.id));
await page.mouse.move(p1.x, p1.y);
await page.mouse.down();
await page.mouse.move(p2.x, p2.y, { steps: 6 });
await page.mouse.up();
await page.waitForTimeout(400);
const idsAfter3 = await page.evaluate(() => DS.elements.map(e => e.id));
const newId3 = idsAfter3.find(id => !idsBefore3.includes(id));
check('exactly one new element after drag', idsAfter3.length === idsBefore3.length + 1, `${idsBefore3.length} -> ${idsAfter3.length}`);
const newEl3 = newId3 && await page.evaluate((id) => { const e = DS.elements.find(x => x.id === id); return e && { type: e.type, sectionId: e.sectionId, x: e.x, y: e.y, w: e.w, h: e.h }; }, newId3);
console.log('drag-created line element:', JSON.stringify(newEl3));
check('drag element section === drag section (s-rh)', newEl3 && newEl3.sectionId === 's-rh', `got ${newEl3 && newEl3.sectionId}`);
check('drag element width reflects drag distance (~150px), not default 200', newEl3 && newEl3.w > 100 && newEl3.w < 200, 'w=' + (newEl3 && newEl3.w));

await page.keyboard.press('Control+z');
await page.waitForTimeout(300);

// ---------------------------------------------------------------
// GATE 4b: vertical line tool also respects mouse position
// ---------------------------------------------------------------
console.log('\n=== GATE 4b: insert-line-v respects mouse position ===');
const pSecs3 = await previewSections();
const pf2 = pSecs3.find(s => s.id === 's-pf');
const vp1 = await findEmptyPoint({ top: pf2.top, left: pf2.left + pf2.width * 0.5, width: pf2.width * 0.4, height: pf2.height }, '.pv-el');
await page.locator('#tool-line-v').click();
await page.waitForTimeout(150);
const idsBefore4 = await page.evaluate(() => DS.elements.map(e => e.id));
await page.mouse.click(vp1.x, vp1.y);
await page.waitForTimeout(400);
const idsAfter4 = await page.evaluate(() => DS.elements.map(e => e.id));
const newId4 = idsAfter4.find(id => !idsBefore4.includes(id));
const newEl4 = newId4 && await page.evaluate((id) => { const e = DS.elements.find(x => x.id === id); return e && { type: e.type, sectionId: e.sectionId, x: e.x, y: e.y, lineDir: e.lineDir }; }, newId4);
console.log('line-v element:', JSON.stringify(newEl4));
check('line-v inserted in clicked section (s-pf)', newEl4 && newEl4.sectionId === 's-pf', `got ${newEl4 && newEl4.sectionId}`);
await page.keyboard.press('Control+z');
await page.waitForTimeout(300);

// ---------------------------------------------------------------
// GATE 5: Preview stays active and refreshes after insert
// ---------------------------------------------------------------
console.log('\n=== GATE 5: Preview refresh after insert ===');
const pSecs4 = await previewSections();
const rf5 = pSecs4.find(s => s.id === 's-rf');
const p5 = await findEmptyPoint(rf5, '.pv-el');
await page.locator('#tool-box').click();
await page.waitForTimeout(150);
await page.mouse.click(p5.x, p5.y);
await page.waitForTimeout(600);
const stillPreview = await page.evaluate(() => !!DS.previewMode);
const visibleInPreview = await page.evaluate(() => {
  const last = DS.elements[DS.elements.length - 1];
  return !!document.querySelector(`#preview-content [data-id="${last.id}"], #preview-content [data-origin-id="${last.id}"]`);
});
check('DS.previewMode remains true after insert', stillPreview);
check('newly inserted element visible in #preview-content DOM', visibleInPreview);
await page.keyboard.press('Control+z');
await page.waitForTimeout(300);

// ---------------------------------------------------------------
// GATE 8: fallback -- click outside any valid section does not insert
// ---------------------------------------------------------------
console.log('\n=== GATE 8: fallback on invalid target ===');
await page.locator('#tool-box').click();
await page.waitForTimeout(150);
const before8 = await page.evaluate(() => DS.elements.length);
const ws = await page.evaluate(() => { const r = document.getElementById('workspace').getBoundingClientRect(); return { left: r.left, bottom: r.bottom }; });
await page.mouse.click(ws.left + 50, ws.bottom - 5);
await page.waitForTimeout(300);
check('no element created when clicking outside valid section', await page.evaluate(() => DS.elements.length) === before8, `${before8} -> ${await page.evaluate(() => DS.elements.length)}`);
const sbMsg = await page.evaluate(() => document.getElementById('sb-msg')?.textContent || '');
check('statusbar explains missing target section', sbMsg.includes('No hay sección destino'), JSON.stringify(sbMsg));
await page.evaluate(() => InsertEngine.setTool('pointer'));

// ---------------------------------------------------------------
// GATE 6: Design mode unaffected
// ---------------------------------------------------------------
console.log('\n=== GATE 6: Design mode regression check ===');
await page.locator('#tab-design').click();
await page.waitForTimeout(400);
check('back in Design mode', await page.evaluate(() => !DS.previewMode));

const dSecs = await designSections();
const dph = dSecs.find(s => s.id === 's-ph') || dSecs[0];
const dPt = await findEmptyPoint(dph, '.cr-element');
console.log('design section target:', JSON.stringify(dph), 'point:', JSON.stringify(dPt));

await page.locator('#tool-box').click();
await page.waitForTimeout(150);
const idsBeforeD = await page.evaluate(() => DS.elements.map(e => e.id));
await page.mouse.move(dPt.x, dPt.y);
await page.mouse.down();
await page.mouse.move(dPt.x + 90, dPt.y + 30, { steps: 4 });
await page.mouse.up();
await page.waitForTimeout(300);
const idsAfterD = await page.evaluate(() => DS.elements.map(e => e.id));
const newIdD = idsAfterD.find(id => !idsBeforeD.includes(id));
check('Design-mode drag-insert still works (mouse-driven, +1 element)', idsAfterD.length === idsBeforeD.length + 1, `${idsBeforeD.length} -> ${idsAfterD.length}`);
const dEl = newIdD && await page.evaluate((id) => { const e = DS.elements.find(x => x.id === id); return e && { sectionId: e.sectionId, x: e.x, y: e.y, w: e.w, h: e.h }; }, newIdD);
console.log('Design drag element:', JSON.stringify(dEl));
check('Design element section matches drag section', dEl && dEl.sectionId === dph.id, `expected ${dph.id}, got ${dEl && dEl.sectionId}`);
await page.keyboard.press('Control+z');
await page.waitForTimeout(200);

// Design rubber-band selection (tool=pointer) still works, unaffected by the
// DS.previewMode && DS.tool==='pointer' guard we added (Design is never previewMode).
console.log('\n=== GATE 6b: Design rubber-band select still works ===');
await page.evaluate(() => InsertEngine.setTool('pointer'));
const rbRect = dSecs.find(s => s.id === 's-rh') || dSecs[0];
await page.mouse.move(rbRect.left + 2, rbRect.top + 2);
await page.mouse.down();
await page.mouse.move(rbRect.left + rbRect.width - 2, rbRect.top + rbRect.height - 2, { steps: 4 });
await page.mouse.up();
await page.waitForTimeout(200);
const selSize = await page.evaluate(() => DS.selection.size);
check('rubber-band selects at least one element in Design', selSize > 0, `selection.size=${selSize}`);
await page.evaluate(() => SelectionEngine.clearSelection());

// ---------------------------------------------------------------
// GATE 4c: sweep the remaining tool types by click (text/field/box/barcode),
// all landing at the same clicked Page Footer point.
// ---------------------------------------------------------------
console.log('\n=== GATE 4c: all insert tools respect click position (Page Footer) ===');
await page.locator('#tab-preview').click();
await page.waitForTimeout(600);
const pSecsSweep = await previewSections();
const pfSweep = pSecsSweep.find(s => s.id === 's-pf');
for (const tool of ['text', 'field', 'box', 'barcode']) {
  const pt = await findEmptyPoint(pfSweep, '.pv-el');
  await page.evaluate((t) => InsertEngine.setTool(t), tool);
  await page.waitForTimeout(120);
  const idsBefore = await page.evaluate(() => DS.elements.map(e => e.id));
  await page.mouse.click(pt.x, pt.y);
  await page.waitForTimeout(400);
  const idsAfter = await page.evaluate(() => DS.elements.map(e => e.id));
  const newId = idsAfter.find(id => !idsBefore.includes(id));
  const el = newId && await page.evaluate((id) => { const e = DS.elements.find(x => x.id === id); return e && { type: e.type, sectionId: e.sectionId }; }, newId);
  check(`tool="${tool}" inserted at clicked section s-pf`, el && el.sectionId === 's-pf', JSON.stringify(el));
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(250);
}

// ---------------------------------------------------------------
// GATE 4d: clicking a specific (non-first) repeating detail row resolves to
// the shared template section (s-d1) with relY relative to THAT row's own
// top, not the flat cumulative model offset (the bug this fix targets).
// ---------------------------------------------------------------
console.log('\n=== GATE 4d: detail-row click (repeating section) ===');
const rows = await page.evaluate(() => [...document.querySelectorAll('#preview-content .preview-render-layer .cr-detail-row')].map(s => { const r = s.getBoundingClientRect(); return { top: r.top, left: r.left, width: r.width, height: r.height }; }));
console.log('detail rows found:', rows.length);
if (rows.length > 1) {
  const targetRow = rows[Math.min(4, rows.length - 1)];
  const rowPt = await findEmptyPoint(targetRow, '.pv-el');
  await page.evaluate(() => InsertEngine.setTool('box'));
  await page.waitForTimeout(120);
  const idsBeforeRow = await page.evaluate(() => DS.elements.map(e => e.id));
  await page.mouse.click(rowPt.x, rowPt.y);
  await page.waitForTimeout(400);
  const idsAfterRow = await page.evaluate(() => DS.elements.map(e => e.id));
  const newRowId = idsAfterRow.find(id => !idsBeforeRow.includes(id));
  const rowEl = newRowId && await page.evaluate((id) => { const e = DS.elements.find(x => x.id === id); return e && { sectionId: e.sectionId, y: e.y }; }, newRowId);
  console.log('detail-row inserted element:', JSON.stringify(rowEl));
  check('detail-row click inserts into template section s-d1', rowEl && rowEl.sectionId === 's-d1', JSON.stringify(rowEl));
  check('detail-row relY is row-local (< row height), not the cumulative offset', rowEl && rowEl.y >= 0 && rowEl.y < targetRow.height, 'y=' + (rowEl && rowEl.y));
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(250);
} else {
  console.log('(skipped — document has < 2 detail rows)');
}

console.log('\n' + '='.repeat(60));
console.log(`RESULT: ${pass} passed, ${fail} failed`);
console.log('='.repeat(60));
if (consoleErrors.length) {
  console.log(`\nConsole errors (${consoleErrors.length}):`);
  consoleErrors.slice(0, 20).forEach(e => console.log('  ' + e));
} else {
  console.log('\nConsole errors: none');
}

await browser.close();
process.exit(fail > 0 ? 1 : 0);
