'use strict';
/**
 * BUG NEW 4 — hit-test fixture. Observation only, no fixes applied.
 * Builds: Detail-section big transparent rect (x0,y0,600x80) + 2 inner fields.
 * Captures full candidate list under a click point for each DOM-order/zIndex variant.
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

// Build the fixture: replace Detail section's elements with rect + 2 fields.
// rectOrder: 'before' | 'after' -- position of the rect in DS.elements relative to the fields.
// rectZ: zIndex for the rect (0 = none/default).
async function buildFixture(rectOrder, rectZ) {
  return page.evaluate(({ rectOrder, rectZ }) => {
    const secId = 's-d1';
    // Sections clip their content (contain:paint) to the declared section
    // height -- InsertEngine.insertAtDefaultPosition grows the section before
    // rendering for the same reason. The fixture's rect/fields (up to y=36)
    // need the section grown past that or they're clipped out of existence
    // (not just visually, but for hit-testing too).
    const sec = DS.sections.find(s => s.id === secId);
    sec.height = 90;
    const secDiv = document.querySelector(`.cr-section[data-section-id="${secId}"]`);
    if (secDiv) secDiv.style.height = sec.height + 'px';
    if (typeof SectionLayoutEngine !== 'undefined') SectionLayoutEngine.update();

    const others = DS.elements.filter(e => e.sectionId !== secId);
    const rect = mkEl('rect', secId, 0, 0, 600, 80, { bgColor: 'transparent', borderColor: '#C0511A', borderWidth: 2, zIndex: rectZ || 0 });
    const f1 = mkEl('field', secId, 50, 20, 200, 16, { fieldPath: 'fiscal.numero_documento', content: '' });
    const f2 = mkEl('field', secId, 300, 20, 200, 16, { fieldPath: 'cliente.razon_social', content: '' });
    const ordered = rectOrder === 'before' ? [rect, f1, f2] : [f1, f2, rect];
    DS.setElements([...others, ...ordered], 'hittest_fixture');
    _canonicalCanvasWriter().renderAll();
    return { rectId: rect.id, f1Id: f1.id, f2Id: f2.id, secId };
  }, { rectOrder, rectZ });
}

// Capture every DOM candidate under a screen point: elementFromPoint stack,
// event.target the router would see, closest('.cr-element'), and for each
// .cr-element on the page whether the point falls inside its geometric rect.
async function captureCandidates(clientX, clientY) {
  return page.evaluate(({ x, y }) => {
    const stack = document.elementsFromPoint(x, y).map(el => ({
      tag: el.tagName, cls: el.className, dataId: el.dataset ? el.dataset.id : undefined,
      dataType: el.dataset ? el.dataset.type : undefined,
      pointerEvents: getComputedStyle(el).pointerEvents,
      zIndexStyle: el.style.zIndex || null,
      zIndexComputed: getComputedStyle(el).zIndex,
    }));
    const topTarget = document.elementFromPoint(x, y);
    const closestEl = topTarget && topTarget.closest ? topTarget.closest('.cr-element') : null;
    const geometric = [...document.querySelectorAll('.cr-element')].map(div => {
      const r = div.getBoundingClientRect();
      const inside = x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
      return {
        dataId: div.dataset.id, dataType: div.dataset.type, inside,
        area: Math.round(r.width * r.height),
        domIndex: [...div.parentElement.children].indexOf(div),
        zIndexStyle: div.style.zIndex || null,
        background: getComputedStyle(div).backgroundColor,
      };
    }).filter(c => c.inside);
    return {
      elementFromPointStack_top3: stack.slice(0, 6),
      nativeTarget: topTarget ? { tag: topTarget.tagName, cls: topTarget.className, dataId: topTarget.dataset ? topTarget.dataset.id : null } : null,
      routerWouldResolveTo: closestEl ? { dataId: closestEl.dataset.id, dataType: closestEl.dataset.type } : null,
      geometricCandidatesUnderPoint: geometric,
    };
  }, { x: clientX, y: clientY });
}

console.log('\n===== VARIANT 1: rect BEFORE fields in DS.elements, zIndex=0 =====');
const fx1 = await buildFixture('before', 0);
await page.waitForTimeout(150);
const f1Rect = await page.evaluate((id) => document.querySelector(`.cr-element[data-id="${id}"]`).getBoundingClientRect(), fx1.f1Id);
const clickPt = { x: f1Rect.x + f1Rect.width / 2, y: f1Rect.y + f1Rect.height / 2 };
console.log('click point (center of field 1):', JSON.stringify(clickPt));
const cand1 = await captureCandidates(clickPt.x, clickPt.y);
console.log(JSON.stringify(cand1, null, 1));
await page.mouse.move(clickPt.x, clickPt.y);
await page.mouse.down(); await page.mouse.up();
await page.waitForTimeout(150);
const sel1 = await page.evaluate(() => [...DS.selection]);
console.log('DS.selection after click on field-1 center:', JSON.stringify(sel1), sel1[0] === fx1.f1Id ? '=> CORRECTLY selected the field' : `=> selected ${JSON.stringify(sel1)} instead of field ${fx1.f1Id} (BUG)`);

console.log('\n===== VARIANT 2: rect AFTER fields in DS.elements, zIndex=0 =====');
const fx2 = await buildFixture('after', 0);
await page.waitForTimeout(150);
const f1Rect2 = await page.evaluate((id) => document.querySelector(`.cr-element[data-id="${id}"]`).getBoundingClientRect(), fx2.f1Id);
const clickPt2 = { x: f1Rect2.x + f1Rect2.width / 2, y: f1Rect2.y + f1Rect2.height / 2 };
const cand2 = await captureCandidates(clickPt2.x, clickPt2.y);
console.log(JSON.stringify(cand2, null, 1));
await page.mouse.move(clickPt2.x, clickPt2.y);
await page.mouse.down(); await page.mouse.up();
await page.waitForTimeout(150);
const sel2 = await page.evaluate(() => [...DS.selection]);
console.log('DS.selection after click on field-1 center (rect AFTER in array):', JSON.stringify(sel2), sel2[0] === fx2.f1Id ? '=> CORRECTLY selected the field' : `=> selected ${JSON.stringify(sel2)} instead of field ${fx2.f1Id} (BUG)`);

console.log('\n===== VARIANT 3: rect BEFORE fields, rect zIndex=5 (higher) =====');
const fx3 = await buildFixture('before', 5);
await page.waitForTimeout(150);
const f1Rect3 = await page.evaluate((id) => document.querySelector(`.cr-element[data-id="${id}"]`).getBoundingClientRect(), fx3.f1Id);
const clickPt3 = { x: f1Rect3.x + f1Rect3.width / 2, y: f1Rect3.y + f1Rect3.height / 2 };
const cand3 = await captureCandidates(clickPt3.x, clickPt3.y);
console.log(JSON.stringify(cand3, null, 1));
await page.mouse.move(clickPt3.x, clickPt3.y);
await page.mouse.down(); await page.mouse.up();
await page.waitForTimeout(150);
const sel3 = await page.evaluate(() => [...DS.selection]);
console.log('DS.selection after click on field-1 center (rect zIndex=5):', JSON.stringify(sel3), sel3[0] === fx3.f1Id ? '=> CORRECTLY selected the field' : `=> selected ${JSON.stringify(sel3)} instead of field ${fx3.f1Id} (BUG)`);

console.log('\n===== VARIANT 4: hover test (CSS :hover), rect AFTER fields =====');
const fx4 = await buildFixture('after', 0);
await page.waitForTimeout(150);
const f1Rect4 = await page.evaluate((id) => document.querySelector(`.cr-element[data-id="${id}"]`).getBoundingClientRect(), fx4.f1Id);
const hoverPt = { x: f1Rect4.x + f1Rect4.width / 2, y: f1Rect4.y + f1Rect4.height / 2 };
await page.mouse.move(hoverPt.x, hoverPt.y);
await page.waitForTimeout(150);
const hoverTarget = await page.evaluate(({ x, y }) => {
  const el = document.elementFromPoint(x, y);
  const closestCr = el.closest('.cr-element');
  return { dataId: closestCr ? closestCr.dataset.id : null, matches: closestCr ? closestCr.matches(':hover') : null };
}, hoverPt);
console.log('hover resolves to:', JSON.stringify(hoverTarget), hoverTarget.dataId === fx4.f1Id ? '=> hover correctly on field' : `=> hover stuck on ${hoverTarget.dataId} instead of field ${fx4.f1Id}`);

console.log('\n===== VARIANT 5: click on the RECT border itself (should select the rect) =====');
const fx5 = await buildFixture('after', 0);
await page.waitForTimeout(150);
const rectRect5 = await page.evaluate((id) => document.querySelector(`.cr-element[data-id="${id}"]`).getBoundingClientRect(), fx5.rectId);
const borderPt = { x: rectRect5.x + 1, y: rectRect5.y + rectRect5.height / 2 }; // near left edge, away from fields
const cand5 = await captureCandidates(borderPt.x, borderPt.y);
await page.mouse.move(borderPt.x, borderPt.y);
await page.mouse.down(); await page.mouse.up();
await page.waitForTimeout(150);
const sel5 = await page.evaluate(() => [...DS.selection]);
console.log('click near rect left border (away from fields):', JSON.stringify(sel5), sel5[0] === fx5.rectId ? '=> rect still selectable via its own area' : `=> selected ${JSON.stringify(sel5)}`);

console.log('\nConsole errors:', consoleErrors.length ? consoleErrors : 'none');
await browser.close();
