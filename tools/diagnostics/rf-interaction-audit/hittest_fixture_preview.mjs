'use strict';
/**
 * BUG NEW 4 — hit-test fixture, PREVIEW MODE. Observation only, no fixes applied.
 * Same fixture as Design (Detail rect blocking inner fields), verified against
 * the .pv-el hit-layer instead of .cr-element, including a REPEATED detail row
 * (Hypothesis D: does row repetition change the effective stacking order?).
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

async function buildFixture(rectOrder, rectZ) {
  return page.evaluate(({ rectOrder, rectZ }) => {
    const secId = 's-d1';
    const sec = DS.sections.find(s => s.id === secId);
    sec.height = 90;
    const others = DS.elements.filter(e => e.sectionId !== secId);
    const rect = mkEl('rect', secId, 0, 0, 600, 80, { bgColor: 'transparent', borderColor: '#C0511A', borderWidth: 2, zIndex: rectZ || 0 });
    const f1 = mkEl('field', secId, 50, 20, 200, 16, { fieldPath: 'fiscal.numero_documento', content: '' });
    const f2 = mkEl('field', secId, 300, 20, 200, 16, { fieldPath: 'cliente.razon_social', content: '' });
    const ordered = rectOrder === 'before' ? [rect, f1, f2] : [f1, f2, rect];
    DS.setElements([...others, ...ordered], 'hittest_fixture_preview');
    if (typeof SectionLayoutEngine !== 'undefined') SectionLayoutEngine.update();
    _canonicalCanvasWriter().renderAll();
    return { rectId: rect.id, f1Id: f1.id, f2Id: f2.id, secId };
  }, { rectOrder, rectZ });
}

async function enterPreview() {
  await page.locator('#tab-preview').click();
  await page.waitForTimeout(1500);
}
async function backToDesign() {
  await page.locator('#tab-design').click();
  await page.waitForTimeout(500);
}

async function capturePreviewCandidates(clientX, clientY) {
  return page.evaluate(({ x, y }) => {
    const stack = document.elementsFromPoint(x, y).slice(0, 6).map(el => ({
      tag: el.tagName, cls: el.className, dataId: el.dataset ? (el.dataset.originId || el.dataset.id) : undefined,
      dataType: el.dataset ? el.dataset.type : undefined,
      pointerEvents: getComputedStyle(el).pointerEvents,
      zIndexComputed: getComputedStyle(el).zIndex,
    }));
    const topTarget = document.elementFromPoint(x, y);
    const closestEl = topTarget && topTarget.closest ? topTarget.closest('.pv-el') : null;
    return {
      stack,
      routerWouldResolveTo: closestEl ? { dataId: closestEl.dataset.originId || closestEl.dataset.id, dataType: closestEl.dataset.type } : null,
    };
  }, { x: clientX, y: clientY });
}

console.log('\n===== PREVIEW VARIANT 1: rect AFTER fields (the failing Design case) =====');
const fx1 = await buildFixture('after', 0);
await enterPreview();
const rowRect1 = await page.evaluate((id) => {
  const node = document.querySelector(`.preview-hit-layer .pv-el[data-origin-id="${id}"]`);
  return node ? node.getBoundingClientRect() : null;
}, fx1.f1Id);
console.log('field-1 hit-layer rect:', JSON.stringify(rowRect1));
if (rowRect1) {
  const pt = { x: rowRect1.x + rowRect1.width / 2, y: rowRect1.y + rowRect1.height / 2 };
  const cand1 = await capturePreviewCandidates(pt.x, pt.y);
  console.log(JSON.stringify(cand1, null, 1));
  await page.mouse.move(pt.x, pt.y);
  await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(200);
  const sel1 = await page.evaluate(() => [...DS.selection]);
  console.log('DS.selection after click on field-1 center (Preview, rect AFTER):', JSON.stringify(sel1),
    sel1[0] === fx1.f1Id ? '=> CORRECTLY selected the field' : `=> selected ${JSON.stringify(sel1)} instead of field ${fx1.f1Id} (BUG reproduces in Preview)`);
} else {
  console.log('field-1 hit-layer node not found -- investigate');
}
await backToDesign();

console.log('\n===== PREVIEW VARIANT 2: rect BEFORE fields (the working Design case) =====');
const fx2 = await buildFixture('before', 0);
await enterPreview();
const rowRect2 = await page.evaluate((id) => {
  const node = document.querySelector(`.preview-hit-layer .pv-el[data-origin-id="${id}"]`);
  return node ? node.getBoundingClientRect() : null;
}, fx2.f1Id);
if (rowRect2) {
  const pt2 = { x: rowRect2.x + rowRect2.width / 2, y: rowRect2.y + rowRect2.height / 2 };
  await page.mouse.move(pt2.x, pt2.y);
  await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(200);
  const sel2 = await page.evaluate(() => [...DS.selection]);
  console.log('DS.selection after click on field-1 center (Preview, rect BEFORE):', JSON.stringify(sel2),
    sel2[0] === fx2.f1Id ? '=> CORRECTLY selected the field' : `=> selected ${JSON.stringify(sel2)} instead of field ${fx2.f1Id}`);
}
await backToDesign();

console.log('\n===== HYPOTHESIS D: repeated detail rows -- does row N (not row 0) behave differently? =====');
const fx3 = await buildFixture('after', 0);
await enterPreview();
const rows = await page.evaluate((id) => [...document.querySelectorAll(`.preview-hit-layer .pv-el[data-origin-id="${id}"]`)].map(n => n.getBoundingClientRect()), fx3.f1Id);
console.log('field-1 hit-layer instances (one per detail row):', rows.length);
if (rows.length > 1) {
  const rowIdx = Math.min(4, rows.length - 1);
  const r = rows[rowIdx];
  const pt3 = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  await page.mouse.move(pt3.x, pt3.y);
  await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(200);
  const sel3 = await page.evaluate(() => [...DS.selection]);
  console.log(`DS.selection after click on field-1 in row ${rowIdx}:`, JSON.stringify(sel3),
    sel3[0] === fx3.f1Id ? '=> same bug reproduces on non-first rows too (order is consistent per row)' : `=> different: ${JSON.stringify(sel3)}`);
} else {
  console.log('only 1 row rendered -- cannot test row-index variance');
}
await backToDesign();

console.log('\nConsole errors:', consoleErrors.length ? consoleErrors : 'none');
await browser.close();
