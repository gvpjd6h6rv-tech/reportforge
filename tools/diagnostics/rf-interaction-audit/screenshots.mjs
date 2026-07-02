'use strict';
import { chromium } from 'playwright';
import fs from 'node:fs';

const TARGET = process.env.FLIGHT_URL || 'http://localhost:5001/';
const SHOT_DIR = '/tmp/claude-1000/-home-mimi-Escritorio-Claude/d0ec36be-65be-4e3b-b108-bf76e3f7b3d8/scratchpad/gates-fase1-bugnew4';
fs.mkdirSync(SHOT_DIR, { recursive: true });

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });

async function freshPage() {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(TARGET, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.documentElement?.dataset?.rfRuntimeReady === '1', null, { timeout: 15000 });
  await page.waitForFunction(() => typeof DS !== 'undefined' && DS.elements.length > 0, null, { timeout: 10000 });
  await page.waitForTimeout(500);
  return page;
}
async function insertFresh(page, tool) {
  return page.evaluate((t) => {
    const before = new Set(DS.elements.map(e => e.id));
    InsertEngine.insertAtDefaultPosition(t);
    const el = DS.elements.find(e => !before.has(e.id));
    return { id: el.id, type: el.type };
  }, tool);
}
async function moveToClearArea(page, elId, x, y, w, h) {
  await page.evaluate(({ id, x, y, w, h }) => {
    const e = DS.elements.find(el => el.id === id);
    e.sectionId = 's-pf'; e.x = x; e.y = y; e.w = w; e.h = h;
    document.querySelector(`.cr-element[data-id="${id}"]`)?.remove();
    _canonicalCanvasWriter().renderElement(e);
  }, { id: elId, x, y, w, h });
  await page.waitForTimeout(80);
}
async function selectEl(page, id) {
  await page.evaluate((id) => { DS.selectOnly(id, 'shots'); SelectionEngine.renderHandles(); }, id);
  await page.waitForTimeout(150);
}
async function clipShot(page, elId, name, pad = 30) {
  const rect = await page.evaluate((id) => {
    const div = document.querySelector(`.cr-element[data-id="${id}"]`);
    const r = div.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  }, elId);
  const clip = { x: Math.max(0, rect.x - pad), y: Math.max(0, rect.y - pad), width: rect.width + pad * 2, height: rect.height + pad * 2 };
  await page.screenshot({ path: `${SHOT_DIR}/${name}.png`, clip });
  console.log('saved', name);
}

// 1. Line selected without box
{
  const page = await freshPage();
  const el = await insertFresh(page, 'line');
  await moveToClearArea(page, el.id, 20, 40, 220, 2);
  await selectEl(page, el.id);
  await clipShot(page, el.id, '01_line_selected_no_box');
  await page.close();
}

// 2. Resize line before/after
{
  const page = await freshPage();
  const el = await insertFresh(page, 'line');
  await moveToClearArea(page, el.id, 20, 40, 300, 2);
  await clipShot(page, el.id, '02_resize_line_before_w300');
  await page.evaluate((id) => { const e = DS.elements.find(x => x.id === id); e.w = 100; _canonicalCanvasWriter().updateElementPosition(id); }, el.id);
  await page.waitForTimeout(100);
  await clipShot(page, el.id, '02_resize_line_after_w100');
  await page.close();
}

// 3. Insert line drag (mid-drag ghost + final)
{
  const page = await freshPage();
  await page.evaluate(() => InsertEngine.setTool('line'));
  await page.waitForTimeout(100);
  const pt = await page.evaluate(() => {
    const sec = document.querySelector('.cr-section[data-section-id="s-pf"]');
    const r = sec.getBoundingClientRect();
    return { x: r.left + 30, y: r.top + 30 };
  });
  await page.mouse.move(pt.x, pt.y);
  await page.mouse.down();
  await page.mouse.move(pt.x + 220, pt.y + 25, { steps: 10 }); // horizontal-ish drag with wobble
  await page.screenshot({ path: `${SHOT_DIR}/03_insert_line_drag_ghost.png`, clip: { x: pt.x - 20, y: pt.y - 20, width: 280, height: 80 } });
  await page.mouse.up();
  await page.waitForTimeout(150);
  const newId = await page.evaluate(() => DS.elements[DS.elements.length - 1].id);
  await clipShot(page, newId, '03_insert_line_drag_final', 20);
  await page.close();
}

// 4. External rect + internal field selectable (before/after style: show field selected while inside rect)
{
  const page = await freshPage();
  const fx = await page.evaluate(() => {
    const secId = 's-d1';
    const sec = DS.sections.find(s => s.id === secId);
    sec.height = 90;
    const secDiv = document.querySelector(`.cr-section[data-section-id="${secId}"]`);
    if (secDiv) secDiv.style.height = sec.height + 'px';
    const others = DS.elements.filter(e => e.sectionId !== secId);
    const rect = mkEl('rect', secId, 0, 0, 600, 80, { bgColor: 'transparent', borderColor: '#C0511A', borderWidth: 2 });
    const f1 = mkEl('field', secId, 50, 20, 200, 16, { fieldPath: 'fiscal.numero_documento', content: '' });
    const f2 = mkEl('field', secId, 300, 40, 200, 16, { fieldPath: 'cliente.razon_social', content: '' });
    DS.setElements([...others, f1, f2, rect], 'shots'); // rect AFTER fields -- the failing case pre-fix
    _canonicalCanvasWriter().renderAll();
    return { rectId: rect.id, f1Id: f1.id };
  });
  const f1Rect = await page.evaluate((id) => document.querySelector(`.cr-element[data-id="${id}"]`).getBoundingClientRect(), fx.f1Id);
  const pt = { x: f1Rect.x + f1Rect.width / 2, y: f1Rect.y + f1Rect.height / 2 };
  await page.mouse.move(pt.x, pt.y);
  await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(200);
  const rectFull = await page.evaluate((id) => {
    const r = document.querySelector(`.cr-element[data-id="${id}"]`).getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  }, fx.rectId);
  await page.screenshot({ path: `${SHOT_DIR}/04_rect_frame_field_selected.png`, clip: { x: rectFull.x - 10, y: rectFull.y - 10, width: rectFull.width + 20, height: rectFull.height + 20 } });
  console.log('saved 04_rect_frame_field_selected');
  const selectedType = await page.evaluate(() => document.querySelector('#props-form .prop-row span[style*="font-weight:bold"]')?.textContent);
  console.log('  Properties panel Tipo:', selectedType);
  await page.close();
}

await browser.close();
console.log('done');
