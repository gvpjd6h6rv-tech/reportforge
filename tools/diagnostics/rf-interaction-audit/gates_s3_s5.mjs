'use strict';
/**
 * BUG NEW 4 — Gates S3 (Preview), S4 (repeated detail row), S5 (zoom).
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

async function buildFixture(rectOrder) {
  return page.evaluate((rectOrder) => {
    const secId = 's-d1';
    const sec = DS.sections.find(s => s.id === secId);
    sec.height = 90;
    const others = DS.elements.filter(e => e.sectionId !== secId);
    const rect = mkEl('rect', secId, 0, 0, 600, 80, { bgColor: 'transparent', borderColor: '#C0511A', borderWidth: 2 });
    const f1 = mkEl('field', secId, 50, 20, 200, 16, { fieldPath: 'fiscal.numero_documento', content: '' });
    const f2 = mkEl('field', secId, 300, 40, 200, 16, { fieldPath: 'cliente.razon_social', content: '' });
    const ordered = rectOrder === 'before' ? [rect, f1, f2] : [f1, f2, rect];
    DS.setElements([...others, ...ordered], 'gates_s3');
    if (typeof SectionLayoutEngine !== 'undefined') SectionLayoutEngine.update();
    _canonicalCanvasWriter().renderAll();
    return { rectId: rect.id, f1Id: f1.id, f2Id: f2.id };
  }, rectOrder);
}

console.log('\n===================== GATE S3: Preview mode =====================');
const fx = await buildFixture('after');
await page.locator('#tab-preview').click();
await page.waitForTimeout(1200);
const f1Node = await page.evaluate((id) => {
  const n = document.querySelector(`.preview-hit-layer .pv-el[data-origin-id="${id}"]`);
  return n ? n.getBoundingClientRect() : null;
}, fx.f1Id);
gate('S3-setup', 'field hit-layer node found in Preview', !!f1Node, f1Node);
if (f1Node) {
  const pt = { x: f1Node.x + f1Node.width / 2, y: f1Node.y + f1Node.height / 2 };
  await page.mouse.move(pt.x, pt.y);
  await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(200);
  const sel = await page.evaluate(() => [...DS.selection]);
  gate('S3a', 'Preview click on inner field selects the field, not the rect', sel[0] === fx.f1Id, { selected: sel, expected: fx.f1Id });

  // Hover-on-a-selected-element is a no-op by design (PreviewHoverOutline._show:
  // "selected wins over hover" -- the blue selection box already marks it, no
  // redundant orange box). Test hover on the OTHER, still-unselected field instead.
  await page.evaluate(() => SelectionEngine.clearSelection());
  await page.waitForTimeout(100);
  await page.mouse.move(pt.x + 1, pt.y + 1);
  await page.waitForTimeout(200);
  const hoverBox = await page.evaluate(() => {
    const box = document.querySelector('.preview-hover-box');
    if (!box) return null;
    const r = box.getBoundingClientRect();
    return { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) };
  });
  const expectedBoxArea = { width: Math.round(f1Node.width), height: Math.round(f1Node.height) };
  gate('S3b', 'Preview hover overlay box sized to the field (not the big rect)', hoverBox && Math.abs(hoverBox.width - expectedBoxArea.width) < 3 && Math.abs(hoverBox.height - expectedBoxArea.height) < 3, { hoverBox, expectedBoxArea });

  const previewStillActive = await page.evaluate(() => !!DS.previewMode);
  gate('S3c', 'Preview stays active after selection', previewStillActive);
}
await page.locator('#tab-design').click();
await page.waitForTimeout(500);

console.log('\n===================== GATE S4: repeated detail row =====================');
const fx2 = await buildFixture('after');
await page.locator('#tab-preview').click();
await page.waitForTimeout(1200);
const rows = await page.evaluate((id) => [...document.querySelectorAll(`.preview-hit-layer .pv-el[data-origin-id="${id}"]`)].map(n => n.getBoundingClientRect()), fx2.f1Id);
gate('S4-setup', 'multiple detail rows rendered', rows.length > 1, { rowCount: rows.length });
if (rows.length > 1) {
  const rowIdx = Math.min(4, rows.length - 1);
  const r = rows[rowIdx];
  const pt = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  await page.mouse.move(pt.x, pt.y);
  await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(200);
  const sel = await page.evaluate(() => [...DS.selection]);
  gate('S4a', `row ${rowIdx} inner field click selects field (same contract as row 0)`, sel[0] === fx2.f1Id, { selected: sel, expected: fx2.f1Id, rowIndex: rowIdx });
}
await page.locator('#tab-design').click();
await page.waitForTimeout(500);

console.log('\n===================== GATE S5: zoom 100/200/400 =====================');
for (const zoomPct of [100, 200, 400]) {
  const fxZ = await buildFixture('after');
  await page.evaluate((z) => { if (typeof DesignZoomEngine !== 'undefined') DesignZoomEngine.set(z / 100); else DS.zoom = z / 100; }, zoomPct);
  await page.waitForTimeout(200);
  const f1Rect = await page.evaluate((id) => {
    const n = document.querySelector(`.cr-element[data-id="${id}"]`);
    return n ? n.getBoundingClientRect() : null;
  }, fxZ.f1Id);
  if (!f1Rect || f1Rect.width < 1) { gate(`S5-${zoomPct}`, `zoom ${zoomPct}%: field visible/measurable`, false, f1Rect); continue; }
  const pt = { x: f1Rect.x + f1Rect.width / 2, y: f1Rect.y + f1Rect.height / 2 };
  await page.mouse.move(pt.x, pt.y);
  await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(150);
  const sel = await page.evaluate(() => [...DS.selection]);
  gate(`S5-${zoomPct}`, `zoom ${zoomPct}%: click on inner field selects field, no offset`, sel[0] === fxZ.f1Id, { selected: sel, expected: fxZ.f1Id, zoom: zoomPct });
}
await page.evaluate(() => { if (typeof DesignZoomEngine !== 'undefined') DesignZoomEngine.set(1); else DS.zoom = 1; });

console.log('\n' + '='.repeat(70));
console.log(`RESULT: ${pass} passed, ${fail} failed`);
console.log('Console errors:', consoleErrors.length ? consoleErrors : 'none');

await browser.close();
process.exit(fail > 0 ? 1 : 0);
