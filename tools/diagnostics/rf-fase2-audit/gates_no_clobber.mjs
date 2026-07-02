'use strict';
/**
 * FASE 2 — Gate 20: global no-clobber sweep.
 * Property edits (color/border/position/section) must not touch unrelated
 * fields: fieldPath, content, sectionId (unless explicit), x/y/w/h (unless
 * explicit move/resize), lineDir, lineWidth, borderWidth, borderColor,
 * bgColor, color, format.number, format.borders, align/valign, zIndex, data.
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

const ALL_KEYS = ['fieldPath', 'content', 'sectionId', 'x', 'y', 'w', 'h', 'lineDir', 'lineWidth',
  'borderWidth', 'borderColor', 'bgColor', 'color', 'align', 'valign', 'zIndex'];

const fieldId = await page.evaluate(() => {
  const sec = DS.sections.find(s => s.id === 's-pf');
  sec.height = Math.max(sec.height, 80);
  const secDiv = document.querySelector('.cr-section[data-section-id="s-pf"]');
  if (secDiv) secDiv.style.height = sec.height + 'px';
  const el = mkEl('field', 's-pf', 4, 4, 150, 16, {
    fieldPath: 'cliente.email', content: '', align: 'left', valign: 'middle', zIndex: 3,
    format: { number: { decimals: 2 } },
  });
  DS.setElements([...DS.elements, el], 'noclobber');
  _canonicalCanvasWriter().renderAll();
  return el.id;
});
await page.waitForTimeout(120);

function snapshot(el) {
  const s = {};
  for (const k of ALL_KEYS) s[k] = el[k];
  s.format = JSON.parse(JSON.stringify(el.format || null));
  return s;
}

console.log('\n===================== No-clobber: color/border edits =====================');
const before1 = await page.evaluate((id) => { const e = DS.elements.find(x => x.id === id); return e; }, fieldId);
await page.evaluate((id) => {
  const e = DS.elements.find(x => x.id === id);
  e.color = '#FF00FF'; e.bgColor = '#00FFAA'; e.borderColor = '#123123'; e.borderWidth = 3;
  _canonicalCanvasWriter().updateElement(id);
}, fieldId);
const after1 = await page.evaluate((id) => { const e = DS.elements.find(x => x.id === id); return e; }, fieldId);
const unrelatedUnchanged1 = ['fieldPath', 'content', 'sectionId', 'x', 'y', 'w', 'h', 'lineDir', 'lineWidth', 'align', 'valign', 'zIndex']
  .every(k => JSON.stringify(before1[k]) === JSON.stringify(after1[k]))
  && JSON.stringify(before1.format) === JSON.stringify(after1.format);
gate('NOCLOB-1', 'color/border edit only changes color/bgColor/borderColor/borderWidth, nothing else', unrelatedUnchanged1 && after1.color === '#FF00FF' && after1.bgColor === '#00FFAA', { before: snapshot(before1), after: snapshot(after1) });

console.log('\n===================== No-clobber: position edit =====================');
const before2 = await page.evaluate((id) => DS.elements.find(x => x.id === id), fieldId);
await page.evaluate((id) => { const e = DS.elements.find(x => x.id === id); e.x = 44; e.y = 12; _canonicalCanvasWriter().updateElementPosition(id); }, fieldId);
const after2 = await page.evaluate((id) => DS.elements.find(x => x.id === id), fieldId);
const unrelatedUnchanged2 = ['fieldPath', 'content', 'sectionId', 'w', 'h', 'color', 'bgColor', 'borderColor', 'borderWidth', 'align', 'valign', 'zIndex']
  .every(k => JSON.stringify(before2[k]) === JSON.stringify(after2[k]));
gate('NOCLOB-2', 'x/y move only changes x/y, nothing else', unrelatedUnchanged2 && after2.x === 44 && after2.y === 12, { before: snapshot(before2), after: snapshot(after2) });

console.log('\n===================== No-clobber: format.number preserved through unrelated edits =====================');
const formatBefore = await page.evaluate((id) => DS.elements.find(x => x.id === id).format, fieldId);
await page.evaluate((id) => { const e = DS.elements.find(x => x.id === id); e.color = '#000000'; _canonicalCanvasWriter().updateElement(id); }, fieldId);
const formatAfter = await page.evaluate((id) => DS.elements.find(x => x.id === id).format, fieldId);
gate('NOCLOB-3', 'format.number survives an unrelated color edit', JSON.stringify(formatBefore) === JSON.stringify(formatAfter), { formatBefore, formatAfter });

console.log('\n===================== No-clobber: line width/color edit does not touch lineDir/x/y/w/h =====================');
const lineId = await page.evaluate(() => {
  const el = mkEl('line', 's-pf', 4, 30, 120, 2, { borderColor: '#000', lineWidth: 2, lineDir: 'v' });
  DS.setElements([...DS.elements, el], 'noclobber-line');
  _canonicalCanvasWriter().renderAll();
  return el.id;
});
const lineBefore = await page.evaluate((id) => DS.elements.find(x => x.id === id), lineId);
await page.evaluate((id) => { const e = DS.elements.find(x => x.id === id); e.lineWidth = 9; e.borderColor = '#ABCDEF'; _canonicalCanvasWriter().updateElement(id); }, lineId);
const lineAfter = await page.evaluate((id) => DS.elements.find(x => x.id === id), lineId);
const lineUnchanged = ['x', 'y', 'w', 'h', 'lineDir', 'sectionId'].every(k => JSON.stringify(lineBefore[k]) === JSON.stringify(lineAfter[k]));
gate('NOCLOB-4', 'line lineWidth/color edit does not touch lineDir/x/y/w/h', lineUnchanged && lineAfter.lineWidth === 9 && lineAfter.borderColor === '#ABCDEF', { before: lineBefore, after: lineAfter });

console.log('\n===================== No-clobber: sectionId edit via Properties panel path (explicit only) =====================');
const secEditId = await page.evaluate(() => {
  const el = mkEl('field', 's-pf', 4, 50, 100, 16, { fieldPath: 'a.b', content: '' });
  DS.setElements([...DS.elements, el], 'noclobber-sec');
  _canonicalCanvasWriter().renderAll();
  return el.id;
});
const secBefore = await page.evaluate((id) => DS.elements.find(x => x.id === id), secEditId);
// non-section edits should NOT touch sectionId
await page.evaluate((id) => { const e = DS.elements.find(x => x.id === id); e.color = '#111111'; _canonicalCanvasWriter().updateElement(id); }, secEditId);
const secAfterColorEdit = await page.evaluate((id) => DS.elements.find(x => x.id === id).sectionId, secEditId);
gate('NOCLOB-5', 'sectionId unchanged by a color edit', secAfterColorEdit === secBefore.sectionId, { before: secBefore.sectionId, after: secAfterColorEdit });

console.log('\n===================== No-clobber: document data untouched by element edits =====================');
const sampleDataBefore = await page.evaluate(() => JSON.stringify(DS._sampleData || null));
await page.evaluate((id) => { const e = DS.elements.find(x => x.id === id); e.color = '#222222'; _canonicalCanvasWriter().updateElement(id); }, secEditId);
const sampleDataAfter = await page.evaluate(() => JSON.stringify(DS._sampleData || null));
gate('NOCLOB-6', 'DS._sampleData (document data) untouched by element property edits', sampleDataBefore === sampleDataAfter, { unchanged: sampleDataBefore === sampleDataAfter });

console.log('\n' + '='.repeat(70));
console.log(`RESULT: ${pass} passed, ${fail} failed`);
console.log('Console errors:', consoleErrors.length ? consoleErrors : 'none');

await browser.close();
process.exit(fail > 0 ? 1 : 0);
