'use strict';
/**
 * FASE 2 — multi-selection, copy/paste, delete, properties edit.
 * Builds fixtures directly via mkEl()+DS.setElements() (bypassing
 * insertAtDefaultPosition's own async scrollIntoView, which caused test-only
 * scroll races in the drag/move audit) so every element lands exactly where
 * intended, non-overlapping, in one shot.
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

// Build N fixture elements directly (no scroll side effects), one per row in
// the page footer, and return their ids + rects.
async function buildFixtures(specs) {
  const ids = await page.evaluate((specs) => {
    const sec = DS.sections.find(s => s.id === 's-pf');
    sec.height = Math.max(sec.height, 40 * (specs.length + 2));
    const secDiv = document.querySelector('.cr-section[data-section-id="s-pf"]');
    if (secDiv) secDiv.style.height = sec.height + 'px';
    const made = specs.map((spec, i) => {
      const y = 10 + i * 40;
      if (spec.type === 'field') return mkEl('field', 's-pf', 20, y, 150, 16, { fieldPath: spec.fieldPath || 'cliente.email', content: '' });
      if (spec.type === 'text') return mkEl('text', 's-pf', 20, y, 150, 16, { content: spec.content || 'Hola' });
      if (spec.type === 'rect') return mkEl('rect', 's-pf', 20, y, 150, 30, { bgColor: spec.bgColor || '#FFCC00', borderColor: spec.borderColor || '#003399', borderWidth: 2 });
      if (spec.type === 'line') return mkEl('line', 's-pf', 20, y, 150, 2, { borderColor: '#000', lineWidth: spec.lineWidth ?? 3, lineDir: 'h' });
      if (spec.type === 'line-v') return mkEl('line', 's-pf', 20, y, 2, 30, { borderColor: '#000', lineWidth: spec.lineWidth ?? 3, lineDir: 'v' });
      if (spec.type === 'barcode') return mkEl('barcode', 's-pf', 20, y, 150, 30, { barcodeType: 'code128', showText: true });
      return null;
    });
    const others = DS.elements;
    DS.setElements([...others, ...made], 'fixtures');
    _canonicalCanvasWriter().renderAll();
    return made.map(e => e.id);
  }, specs);
  await page.waitForTimeout(150);
  return ids;
}
async function rectOf(id) {
  return page.evaluate((id) => document.querySelector(`.cr-element[data-id="${id}"]`)?.getBoundingClientRect(), id);
}

// ============================================================
console.log('\n===================== Multi-selection =====================');
const [tId, fId, rId, lId] = await buildFixtures([{ type: 'text' }, { type: 'field' }, { type: 'rect' }, { type: 'line' }]);
await page.evaluate((ids) => {
  DS.clearSelectionState('gates');
  ids.forEach(id => DS.addSelection(id, 'gates'));
  SelectionEngine.renderHandles();
}, [tId, fId, rId, lId]);
await page.waitForTimeout(100);
const selAfterMulti = await page.evaluate(() => [...DS.selection].sort());
gate('MULTI-1', 'multi-select 4 heterogeneous elements: DS.selection has exactly those 4', JSON.stringify(selAfterMulti) === JSON.stringify([tId, fId, rId, lId].sort()), { selected: selAfterMulti, expected: [tId, fId, rId, lId] });

console.log('\n--- move the group via drag on one member ---');
const beforePositions = await page.evaluate((ids) => Object.fromEntries(ids.map(id => { const e = DS.elements.find(x => x.id === id); return [id, { x: e.x, y: e.y }]; })), [tId, fId, rId, lId]);
const tRect = await rectOf(tId);
const startPt = { x: tRect.x + tRect.width / 2, y: tRect.y + tRect.height / 2 };
await page.mouse.move(startPt.x, startPt.y);
await page.mouse.down();
await page.mouse.move(startPt.x + 40, startPt.y + 5, { steps: 5 });
await page.mouse.up();
await page.waitForTimeout(150);
const afterPositions = await page.evaluate((ids) => Object.fromEntries(ids.map(id => { const e = DS.elements.find(x => x.id === id); return [id, { x: e.x, y: e.y }]; })), [tId, fId, rId, lId]);
const allMovedSameDelta = [fId, rId, lId].every(id => {
  const dx0 = afterPositions[tId].x - beforePositions[tId].x;
  const dxN = afterPositions[id].x - beforePositions[id].x;
  return Math.abs(dx0 - dxN) < 0.5;
});
gate('MULTI-2', 'dragging one member of the multi-selection moves ALL members by the same delta', allMovedSameDelta, { before: beforePositions, after: afterPositions });

console.log('\n--- delete the group ---');
const countBeforeDel = await page.evaluate(() => DS.elements.length);
await page.evaluate(() => CommandEngine.delete());
await page.waitForTimeout(150);
const countAfterDel = await page.evaluate(() => DS.elements.length);
const domGhosts = await page.evaluate((ids) => ids.filter(id => !!document.querySelector(`.cr-element[data-id="${id}"]`)), [tId, fId, rId, lId]);
const handlesAfterDel = await page.evaluate(() => document.querySelectorAll('.sel-box, .sel-handle').length);
gate('MULTI-3', 'delete multi-selection: DS.elements -4, no DOM ghosts, no leftover handles', countAfterDel === countBeforeDel - 4 && domGhosts.length === 0 && handlesAfterDel === 0, { countBeforeDel, countAfterDel, domGhosts, handlesAfterDel });

// ============================================================
console.log('\n===================== Copy / Paste =====================');
async function copyPasteTest(spec, checkProps) {
  const [id] = await buildFixtures([spec]);
  const before = await page.evaluate((id) => { const e = DS.elements.find(x => x.id === id); return { ...e }; }, id);
  await page.evaluate((id) => { DS.selectOnly(id, 'gates'); ClipboardEngine.copy(); }, id);
  const countBefore = await page.evaluate(() => DS.elements.length);
  const newIds = await page.evaluate(() => ClipboardEngine.paste());
  await page.waitForTimeout(100);
  const countAfter = await page.evaluate(() => DS.elements.length);
  const newId = newIds[0];
  const after = newId ? await page.evaluate((id) => { const e = DS.elements.find(x => x.id === id); return { ...e }; }, newId) : null;
  const propsPreserved = after && checkProps.every(k => JSON.stringify(after[k]) === JSON.stringify(before[k]));
  const uniqueId = newId && newId !== id;
  const offsetCorrect = after && Math.abs((after.x - before.x) - 8) < 0.5 && Math.abs((after.y - before.y) - 8) < 0.5;
  return { before, after, countBefore, countAfter, propsPreserved, uniqueId, offsetCorrect, newId, origId: id };
}

const r1 = await copyPasteTest({ type: 'field', fieldPath: 'cliente.direccion' }, ['fieldPath', 'content']);
gate('COPY-1', 'copy/paste field: +1 element, unique id, fieldPath preserved, +8/+8 offset', r1.countAfter === r1.countBefore + 1 && r1.uniqueId && r1.propsPreserved && r1.offsetCorrect, r1);

const r2 = await copyPasteTest({ type: 'line', lineWidth: 7 }, ['lineDir', 'lineWidth', 'borderColor']);
gate('COPY-2', 'copy/paste horizontal line: lineDir/lineWidth/borderColor preserved', r2.countAfter === r2.countBefore + 1 && r2.uniqueId && r2.propsPreserved, r2);

const r3 = await copyPasteTest({ type: 'line-v', lineWidth: 5 }, ['lineDir', 'lineWidth']);
gate('COPY-3', 'copy/paste vertical line: lineDir preserved as v', r3.after && r3.after.lineDir === 'v' && r3.propsPreserved, r3);

const r4 = await copyPasteTest({ type: 'rect', bgColor: '#00FF00', borderColor: '#FF0000' }, ['bgColor', 'borderColor', 'borderWidth']);
gate('COPY-4', 'copy/paste rect: border/bg preserved', r4.countAfter === r4.countBefore + 1 && r4.propsPreserved, r4);

const r5 = await copyPasteTest({ type: 'text', content: 'Copiar este texto' }, ['content']);
gate('COPY-5', 'copy/paste text: content preserved verbatim', r5.propsPreserved, r5);

console.log('\n--- copy/paste multi-selection (mixed types) ---');
const mixIds = await buildFixtures([{ type: 'field', fieldPath: 'x.y' }, { type: 'rect' }, { type: 'line' }]);
await page.evaluate((ids) => { DS.clearSelectionState('gates'); ids.forEach(id => DS.addSelection(id, 'gates')); ClipboardEngine.copy(); }, mixIds);
const countBeforeMixPaste = await page.evaluate(() => DS.elements.length);
const mixNewIds = await page.evaluate(() => ClipboardEngine.paste());
await page.waitForTimeout(100);
const countAfterMixPaste = await page.evaluate(() => DS.elements.length);
const allUnique = new Set([...mixIds, ...mixNewIds]).size === mixIds.length + mixNewIds.length;
gate('COPY-6', 'multi-select copy/paste: 3 new elements, all ids unique (no collision)', countAfterMixPaste === countBeforeMixPaste + 3 && mixNewIds.length === 3 && allUnique, { countBeforeMixPaste, countAfterMixPaste, mixIds, mixNewIds });

// ============================================================
console.log('\n===================== Delete (single, and after Preview refresh) =====================');
const [delId] = await buildFixtures([{ type: 'field' }]);
await page.evaluate((id) => DS.selectOnly(id, 'gates'), delId);
const cBefore = await page.evaluate(() => DS.elements.length);
await page.evaluate(() => CommandEngine.delete());
await page.waitForTimeout(100);
const cAfter = await page.evaluate(() => DS.elements.length);
const ghostSingle = await page.evaluate((id) => !!document.querySelector(`.cr-element[data-id="${id}"]`), delId);
gate('DEL-1', 'delete single element: count -1, no DOM ghost', cAfter === cBefore - 1 && !ghostSingle, { cBefore, cAfter, ghostSingle });

const propsAfterDelete = await page.evaluate(() => document.getElementById('props-form').classList.contains('hidden'));
gate('DEL-2', 'Properties panel returns to empty state after delete', propsAfterDelete, { hidden: propsAfterDelete });

console.log('\n--- delete after Preview refresh ---');
const [delId2] = await buildFixtures([{ type: 'field' }]);
await page.locator('#tab-preview').click();
await page.waitForTimeout(1200);
await page.locator('#tab-design').click();
await page.waitForTimeout(400);
await page.evaluate((id) => DS.selectOnly(id, 'gates'), delId2);
const cBefore2 = await page.evaluate(() => DS.elements.length);
await page.evaluate(() => CommandEngine.delete());
await page.waitForTimeout(100);
const cAfter2 = await page.evaluate(() => DS.elements.length);
gate('DEL-3', 'delete after a Design->Preview->Design cycle still works', cAfter2 === cBefore2 - 1, { cBefore2, cAfter2 });

console.log('\n--- delete line h/v ---');
const [lineDelId] = await buildFixtures([{ type: 'line' }]);
await page.evaluate((id) => DS.selectOnly(id, 'gates'), lineDelId);
const cBefore3 = await page.evaluate(() => DS.elements.length);
await page.evaluate(() => CommandEngine.delete());
await page.waitForTimeout(100);
const cAfter3 = await page.evaluate(() => DS.elements.length);
const lineHandlesGone = await page.evaluate(() => document.querySelectorAll('.sel-handle-line').length === 0);
gate('DEL-4', 'delete a line: count -1, its endpoint handles removed too', cAfter3 === cBefore3 - 1 && lineHandlesGone, { cBefore3, cAfter3, lineHandlesGone });

console.log('\n' + '='.repeat(70));
console.log(`RESULT: ${pass} passed, ${fail} failed`);
console.log('Console errors:', consoleErrors.length ? consoleErrors : 'none');

await browser.close();
process.exit(fail > 0 ? 1 : 0);
