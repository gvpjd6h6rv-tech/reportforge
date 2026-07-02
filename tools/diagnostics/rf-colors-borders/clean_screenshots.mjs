'use strict';
import { chromium } from 'playwright';
import fs from 'node:fs';

const TARGET = process.env.FLIGHT_URL || 'http://localhost:5001/';
const SHOT_DIR = '/tmp/claude-1000/-home-mimi-Escritorio-Claude/d0ec36be-65be-4e3b-b108-bf76e3f7b3d8/scratchpad/gates-screenshots';
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

// Page footer (s-pf) has open, uncluttered space in the default invoice
// layout -- move the freshly-inserted test element there for a legible shot.
async function moveToClearArea(page, elId, x = 20, y = 60) {
  await page.evaluate(({ id, x, y }) => {
    const e = DS.elements.find(el => el.id === id);
    e.sectionId = 's-pf'; e.x = x; e.y = y;
    document.querySelector(`.cr-element[data-id="${id}"]`)?.remove();
    _canonicalCanvasWriter().renderElement(e);
    // Deliberately NOT selecting the element -- the blue selection overlay
    // box would otherwise be mistaken for the element's own border/stroke
    // in the screenshot.
    SelectionEngine.clearSelection();
  }, { id: elId, x, y });
  await page.waitForTimeout(100);
  const div = await page.evaluate((id) => {
    const d = document.querySelector(`.cr-element[data-id="${id}"]`);
    d.scrollIntoView({ block: 'center', inline: 'center' });
    return true;
  }, elId);
  await page.waitForTimeout(150);
}

async function clipShot(page, elId, name, pad = 40) {
  await page.evaluate(() => SelectionEngine.clearSelection());
  await page.waitForTimeout(150);
  const rect = await page.evaluate((id) => {
    const div = document.querySelector(`.cr-element[data-id="${id}"]`);
    const r = div.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  }, elId);
  const clip = {
    x: Math.max(0, rect.x - pad),
    y: Math.max(0, rect.y - pad),
    width: rect.width + pad * 2,
    height: rect.height + pad * 2,
  };
  await page.screenshot({ path: `${SHOT_DIR}/${name}.png`, clip });
  console.log('saved', name, clip);
}

// --- Line 0 / 1 / 10 ---
{
  const page = await freshPage();
  const el = await insertFresh(page, 'line');
  await moveToClearArea(page, el.id, 20, 60);
  await page.evaluate((id) => { const e = DS.elements.find(x => x.id === id); e.w = 200; e.h = 2; _canonicalCanvasWriter().updateElementPosition(id); e.lineWidth = 0; _canonicalCanvasWriter().updateElement(id); }, el.id);
  await clipShot(page, el.id, 'clean_line_0px');
  await page.evaluate((id) => { const e = DS.elements.find(x => x.id === id); e.lineWidth = 1; _canonicalCanvasWriter().updateElement(id); }, el.id);
  await clipShot(page, el.id, 'clean_line_1px');
  await page.evaluate((id) => { const e = DS.elements.find(x => x.id === id); e.lineWidth = 10; _canonicalCanvasWriter().updateElement(id); }, el.id);
  await clipShot(page, el.id, 'clean_line_10px');
  await page.close();
}

// --- Rect 0 / 10 ---
{
  const page = await freshPage();
  const el = await insertFresh(page, 'box');
  await moveToClearArea(page, el.id, 20, 10);
  await page.evaluate((id) => { const e = DS.elements.find(x => x.id === id); e.borderWidth = 0; e.w = 120; e.h = 60; _canonicalCanvasWriter().updateElementPosition(id); _canonicalCanvasWriter().updateElement(id); }, el.id);
  await clipShot(page, el.id, 'clean_rect_0px');
  await page.evaluate((id) => { const e = DS.elements.find(x => x.id === id); e.borderWidth = 10; e.borderColor = '#0080FF'; _canonicalCanvasWriter().updateElement(id); }, el.id);
  await clipShot(page, el.id, 'clean_rect_10px');
  await page.close();
}

// --- Field: font color / bg / border ---
{
  const page = await freshPage();
  const el = await insertFresh(page, 'field');
  await moveToClearArea(page, el.id, 20, 10);
  await page.evaluate((id) => {
    const e = DS.elements.find(x => x.id === id);
    e.fieldPath = 'cliente.razon_social'; e.content = '';
    e.color = '#CC0000'; e.bgColor = '#FFEECC'; e.borderColor = '#003399'; e.borderWidth = 3;
    e.w = 220; e.h = 20;
    _canonicalCanvasWriter().updateElementPosition(id);
    _canonicalCanvasWriter().updateElement(id);
  }, el.id);
  await clipShot(page, el.id, 'clean_field_colors');
  await page.close();
}

// --- Text: font color / bg / border ---
{
  const page = await freshPage();
  const el = await insertFresh(page, 'text');
  await page.waitForTimeout(200);
  await page.evaluate(() => { const a = document.activeElement; if (a && a.blur) a.blur(); });
  await moveToClearArea(page, el.id, 20, 35);
  await page.evaluate((id) => {
    const e = DS.elements.find(x => x.id === id);
    e.content = 'Texto de ejemplo';
    e.color = '#006600'; e.bgColor = '#E0F0FF'; e.borderColor = '#990099'; e.borderWidth = 2;
    e.w = 200; e.h = 20;
    _canonicalCanvasWriter().updateElementPosition(id);
    _canonicalCanvasWriter().updateElement(id);
  }, el.id);
  await clipShot(page, el.id, 'clean_text_colors');
  await page.close();
}

// --- Transparent bg + border (rect) ---
{
  const page = await freshPage();
  const el = await insertFresh(page, 'box');
  await moveToClearArea(page, el.id, 20, 10);
  await page.evaluate((id) => {
    const e = DS.elements.find(x => x.id === id);
    e.bgColor = 'transparent'; e.borderColor = 'transparent'; e.borderWidth = 4;
    e.w = 150; e.h = 70;
    _canonicalCanvasWriter().updateElementPosition(id);
    _canonicalCanvasWriter().updateElement(id);
  }, el.id);
  await clipShot(page, el.id, 'clean_transparent_rect', 60);
  await page.close();
}

await browser.close();
console.log('done');
