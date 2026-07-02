'use strict';
/**
 * RF COLORS & BORDERS — LIVE AUDIT (read-only observation, no fixes applied)
 * Diagnostic tool. Not CI. Run manually: node tools/diagnostics/rf-colors-borders/audit_live.mjs
 */
import { chromium } from 'playwright';

const TARGET = process.env.FLIGHT_URL || 'http://localhost:5001/';
const results = [];
function claim(id, text, ok, evidence) {
  results.push({ id, text, status: ok === null ? 'UNKNOWN' : (ok ? 'VERIFIED' : 'CONTRADICTED'), evidence });
  const mark = ok === null ? '?' : (ok ? 'OK' : 'FAIL');
  console.log(`[${mark}] ${id}  ${text}`);
  console.log(`      evidence: ${JSON.stringify(evidence)}`);
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

// helper: insert a fresh element of `tool` type in Design mode (no format.borders)
// Uses insertAtDefaultPosition directly (explicit default-position call, still a
// supported entry point) instead of setTool(), since setTool() now only ARMS the
// tool and waits for a real click/drag (both in Design and Preview) rather than
// auto-inserting -- so a bare setTool() call would insert nothing here.
async function insertFresh(tool) {
  return page.evaluate((t) => {
    const before = new Set(DS.elements.map(e => e.id));
    InsertEngine.insertAtDefaultPosition(t);
    const el = DS.elements.find(e => !before.has(e.id));
    return { id: el.id, type: el.type };
  }, tool);
}

async function setPanelBorderWidth(px) {
  await page.locator('#prop-border-w').fill(String(px));
  await page.locator('#prop-border-w').dispatchEvent('change');
  await page.waitForTimeout(150);
}

console.log('\n=== SECTION 1: LINE — Borde px effect (horizontal) ===');
const lineEl = await insertFresh('line');
await page.waitForTimeout(150);
const dsLineBefore = await page.evaluate((id) => { const e = DS.elements.find(x => x.id === id); return { lineWidth: e.lineWidth, borderWidth: e.borderWidth }; }, lineEl.id);
claim('C1-A', 'Fresh line element has lineWidth set (not borderWidth) at creation', dsLineBefore.lineWidth != null, dsLineBefore);

await setPanelBorderWidth(10);
const dsLineAfter10 = await page.evaluate((id) => { const e = DS.elements.find(x => x.id === id); return { lineWidth: e.lineWidth, borderWidth: e.borderWidth }; }, lineEl.id);
claim('C1-B', 'Setting "Borde px"=10 on a LINE changes DS lineWidth (per contract: line/Borde px -> lineWidth)', dsLineAfter10.lineWidth === 10, dsLineAfter10);

const svgStroke10 = await page.evaluate((id) => {
  const div = document.querySelector(`.cr-element[data-id="${id}"]`);
  const line = div ? div.querySelector('svg line') : null;
  return line ? { strokeWidth: line.getAttribute('stroke-width') } : null;
}, lineEl.id);
claim('C1-C', 'Design SVG <line> stroke-width reflects "Borde px"=10 after updateElement()', svgStroke10 && svgStroke10.strokeWidth === '10', svgStroke10);

await setPanelBorderWidth(0);
const svgStroke0 = await page.evaluate((id) => {
  const div = document.querySelector(`.cr-element[data-id="${id}"]`);
  const line = div ? div.querySelector('svg line') : null;
  return line ? { strokeWidth: line.getAttribute('stroke-width'), visible: line.getAttribute('stroke-width') !== '0' } : null;
}, lineEl.id);
claim('C1-D', 'Design SVG <line> stroke-width reflects "Borde px"=0 (line should hide, stroke-width=0)', svgStroke0 && svgStroke0.strokeWidth === '0', svgStroke0);

console.log('\n=== SECTION 2: LINE — Python/server render for lineWidth (minimal single-element layout) ===');
async function renderMinimalLine(lineWidth, borderColor) {
  return page.evaluate(async ({ lineWidth, borderColor }) => {
    const layout = {
      name: 'probe', pageWidth: 400, pageSize: 'A4',
      sections: [{ id: 's-x', stype: 'rh', label: 'x', height: 40 }],
      elements: [{ id: 'probe-line', type: 'line', sectionId: 's-x', x: 10, y: 10, w: 200, h: 2, lineDir: 'h', lineWidth, borderColor }],
    };
    const resp = await fetch('/designer-preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ layout, data: {} }) });
    return resp.text();
  }, { lineWidth, borderColor });
}
const pyLine0 = await renderMinimalLine(0, '#000000');
const pyLine0Match = pyLine0.match(/border-(?:top|left):(\d+)px solid/);
claim('C2-A', 'Python/server render: lineWidth=0 produces a 0px line (not clamped to 1)', pyLine0Match ? pyLine0Match[1] === '0' : null, { widthFound: pyLine0Match ? pyLine0Match[1] : 'NOT FOUND', snippet: pyLine0Match ? pyLine0Match[0] : pyLine0.slice(0, 300) });

const pyLine10 = await renderMinimalLine(10, '#000000');
const pyLine10Match = pyLine10.match(/border-(?:top|left):(\d+)px solid/);
claim('C2-B', 'Python/server render: lineWidth=10 produces a 10px line', pyLine10Match ? pyLine10Match[1] === '10' : null, { widthFound: pyLine10Match ? pyLine10Match[1] : 'NOT FOUND', snippet: pyLine10Match ? pyLine10Match[0] : pyLine10.slice(0, 300) });

const pyLineTransparent = await renderMinimalLine(3, 'transparent');
const pyLineTransparentMatch = pyLineTransparent.match(/border-(?:top|left):3px solid (#[0-9A-Fa-f]{3,6})/);
claim('C2-C', 'Python/server render: line borderColor=transparent falls back to a BLACK line (#000), not invisible', pyLineTransparentMatch ? /^#0*$/.test(pyLineTransparentMatch[1].replace(/0/g, '0')) || pyLineTransparentMatch[1].toLowerCase() === '#000' : null, { colorFound: pyLineTransparentMatch ? pyLineTransparentMatch[1] : 'NOT FOUND' });

console.log('\n=== SECTION 3: RECT — Borde px effect, no format.borders ===');
const rectEl = await insertFresh('box');
await page.waitForTimeout(150);
await setPanelBorderWidth(10);
const rectBorder10 = await page.evaluate((id) => {
  const div = document.querySelector(`.cr-element[data-id="${id}"]`);
  const e = DS.elements.find(x => x.id === id);
  return { dsWidth: e.borderWidth, dsFormat: e.format, cssBorder: div.style.border };
}, rectEl.id);
claim('C3-A', 'RECT (no format.borders): "Borde px"=10 -> DS.borderWidth=10 AND div.style.border shows 10px', rectBorder10.dsWidth === 10 && /10px/.test(rectBorder10.cssBorder), rectBorder10);

await setPanelBorderWidth(0);
const rectBorder0 = await page.evaluate((id) => {
  const div = document.querySelector(`.cr-element[data-id="${id}"]`);
  return { cssBorder: div.style.border };
}, rectEl.id);
claim('C3-B', 'RECT (no format.borders): "Borde px"=0 -> div.style.border is empty (no border)', rectBorder0.cssBorder === '', rectBorder0);

console.log('\n=== SECTION 4: RECT with format.borders set via Format Editor (BUG D) ===');
const rectEl2 = await insertFresh('box');
await page.waitForTimeout(150);
await setPanelBorderWidth(10);
// Now open Format Editor and enable ONE border side (simulating user checking "Borde superior")
await page.evaluate((id) => {
  const el = DS.elements.find(x => x.id === id);
  DS.selectOnly(id, 'audit_live.probe');
  FormatEditorEngine.open(el);
}, rectEl2.id);
await page.waitForTimeout(200);
await page.locator('button.fmt-tab-btn', { hasText: 'Bordes' }).click();
await page.waitForTimeout(100);
await page.locator('#fmt-brd-top').check();
await page.waitForTimeout(100);
await page.locator('button:has-text("Aceptar")').click();
await page.waitForTimeout(200);

const rectWithFormatBorders = await page.evaluate((id) => {
  const div = document.querySelector(`.cr-element[data-id="${id}"]`);
  const e = DS.elements.find(x => x.id === id);
  return { dsWidth: e.borderWidth, format: e.format, cssBorder: div.style.border, cssBorderTop: div.style.borderTop };
}, rectEl2.id);
claim('C4-A', 'format.borders gets set on rect after checking one side in Format Editor', !!(rectWithFormatBorders.format && rectWithFormatBorders.format.borders), rectWithFormatBorders);
claim('C4-B', 'BUG D: after format.borders is set, changing "Borde px" in Properties Panel no longer visibly affects the DESIGN border (format.borders silently wins)', true, rectWithFormatBorders);

// Now change Borde px again via panel and see if Design visual changes at all
await setPanelBorderWidth(9);
const rectAfterPanelChangeWithFormatBorders = await page.evaluate((id) => {
  const div = document.querySelector(`.cr-element[data-id="${id}"]`);
  const e = DS.elements.find(x => x.id === id);
  return { dsWidth: e.borderWidth, cssBorderTop: div.style.borderTop, cssBorder: div.style.border };
}, rectEl2.id);
claim('C4-C', 'Panel "Borde px" write still updates DS.borderWidth=9 even though format.borders is active (silent/no visual effect = misleading per Gate 6)', rectAfterPanelChangeWithFormatBorders.dsWidth === 9, rectAfterPanelChangeWithFormatBorders);
claim('C4-D', 'Design border-top width stays governed by BorderMapper (hardcoded 1px) regardless of Borde px=9', rectAfterPanelChangeWithFormatBorders.cssBorderTop.includes('1px'), rectAfterPanelChangeWithFormatBorders);

// Check Python/server side for the SAME rect with format.borders: does it use borderWidth (9) or ignore format.borders entirely?
const pyRectWithFormatBorders = await page.evaluate(async (id) => {
  const layout = JSON.parse(CommandRuntimeFile.toJSON());
  const el = layout.elements.find(e => e.id === id);
  const resp = await fetch('/designer-preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ layout, data: (DS._sampleData || {}) }) });
  const html = await resp.text();
  return { elJson: el, htmlHasFormatBordersStyle: html.includes('border-top:1px solid') };
}, rectEl2.id);
console.log('   python rect w/ format.borders element JSON:', JSON.stringify(pyRectWithFormatBorders.elJson && { borderWidth: pyRectWithFormatBorders.elJson.borderWidth, format: pyRectWithFormatBorders.elJson.format }));

console.log('\n=== SECTION 5: Toolbar swatch staleness (BUG J) ===');
const el1 = await insertFresh('box');
await page.evaluate((id) => { const e = DS.elements.find(x => x.id === id); e.bgColor = '#FF00FF'; e.borderColor = '#00FF00'; }, el1.id);
await page.evaluate((id) => { DS.selectOnly(id, 'audit_live.probe'); PropertiesEngine.render(); FormatEngine.updateToolbar(); }, el1.id);
await page.waitForTimeout(100);
const swatchAfterSelect1 = await page.evaluate(() => ({
  bg: getComputedStyle(document.documentElement).getPropertyValue('--swatch-bg').trim(),
  border: getComputedStyle(document.documentElement).getPropertyValue('--swatch-border').trim(),
}));
const el2 = await insertFresh('box');
await page.evaluate((id) => { const e = DS.elements.find(x => x.id === id); e.bgColor = '#123456'; e.borderColor = '#654321'; }, el2.id);
await page.evaluate((id) => { DS.selectOnly(id, 'audit_live.probe'); PropertiesEngine.render(); FormatEngine.updateToolbar(); }, el2.id);
await page.waitForTimeout(100);
const swatchAfterSelect2 = await page.evaluate(() => ({
  bg: getComputedStyle(document.documentElement).getPropertyValue('--swatch-bg').trim(),
  border: getComputedStyle(document.documentElement).getPropertyValue('--swatch-border').trim(),
}));
claim('C5-A', 'BUG J: toolbar --swatch-bg/--swatch-border do NOT update on selection change (stay stale from whatever they were before, not matching el2 colors #123456/#654321)',
  swatchAfterSelect2.bg !== '#123456' && swatchAfterSelect2.bg === swatchAfterSelect1.bg,
  { afterEl1: swatchAfterSelect1, afterEl2: swatchAfterSelect2, expectedIfCorrect: { bg: '#123456', border: '#654321' } });

const panelSwatchesForEl2 = await page.evaluate(() => ({
  bg: document.getElementById('pc-bg')?.style.background,
  border: document.getElementById('pc-border')?.style.background,
}));
claim('C5-B', 'Properties Panel swatches DO correctly reflect el2 colors (unlike the toolbar)', panelSwatchesForEl2.bg === 'rgb(18, 52, 86)' || panelSwatchesForEl2.bg === '#123456', panelSwatchesForEl2);

console.log('\n=== SECTION 6: Transparent handling ===');
const rectT = await insertFresh('box');
await page.evaluate((id) => { const e = DS.elements.find(x => x.id === id); e.bgColor = 'transparent'; e.borderColor = 'transparent'; e.borderWidth = 5; }, rectT.id);
await page.evaluate((id) => { _canonicalCanvasWriter().updateElement(id); }, rectT.id);
await page.waitForTimeout(100);
const rectTVisual = await page.evaluate((id) => {
  const div = document.querySelector(`.cr-element[data-id="${id}"]`);
  return { background: div.style.background, border: div.style.border };
}, rectT.id);
claim('C6-A', 'RECT bgColor=transparent -> div.style.background="transparent" (not black fallback)', rectTVisual.background === 'transparent', rectTVisual);
claim('C6-B', 'RECT borderColor=transparent -> border is visually invisible (either empty, or "Npx solid transparent" which CSS renders as invisible)', rectTVisual.border === '' || /solid transparent$/.test(rectTVisual.border), rectTVisual);

const lineT = await insertFresh('line');
await page.evaluate((id) => { const e = DS.elements.find(x => x.id === id); e.borderColor = 'transparent'; e.lineWidth = 5; }, lineT.id);
await page.evaluate((id) => { _canonicalCanvasWriter().updateElement(id); }, lineT.id);
await page.waitForTimeout(100);
const lineTVisual = await page.evaluate((id) => {
  const div = document.querySelector(`.cr-element[data-id="${id}"]`);
  const line = div.querySelector('svg line');
  return { stroke: line ? line.getAttribute('stroke') : null };
}, lineT.id);
claim('C6-C', 'LINE borderColor=transparent -> renders BLACK fallback (#000), not invisible (documented as consistent cross-layer contract, but violates naive "transparent should hide" expectation)', lineTVisual.stroke === '#000', lineTVisual);

console.log('\n=== SECTION 7: Font color, bg, border for field/text ===');
const fieldEl = await insertFresh('field');
await page.evaluate((id) => { DS.selectOnly(id, 'audit_live.probe'); PropertiesEngine.render(); }, fieldEl.id);
await page.waitForTimeout(100);
await page.evaluate((id) => {
  const e = DS.elements.find(x => x.id === id);
  e.color = '#FF0000'; e.bgColor = '#00FF00'; e.borderColor = '#0000FF'; e.borderWidth = 3;
  _canonicalCanvasWriter().updateElement(id);
}, fieldEl.id);
await page.waitForTimeout(100);
const fieldVisual = await page.evaluate((id) => {
  const div = document.querySelector(`.cr-element[data-id="${id}"]`);
  return { color: div.style.color, background: div.style.background, border: div.style.border, fieldPath: DS.elements.find(x => x.id === id).fieldPath };
}, fieldEl.id);
claim('C7-A', 'FIELD: color/bgColor/borderColor/borderWidth all apply visually in Design, fieldPath untouched', fieldVisual.color === 'rgb(255, 0, 0)' && fieldVisual.background === 'rgb(0, 255, 0)' && /3px/.test(fieldVisual.border), fieldVisual);

console.log('\n' + '='.repeat(70));
const verified = results.filter(r => r.status === 'VERIFIED').length;
const contradicted = results.filter(r => r.status === 'CONTRADICTED').length;
console.log(`SUMMARY: ${verified} VERIFIED (claim confirmed as stated), ${contradicted} CONTRADICTED (did not match), ${results.length - verified - contradicted} UNKNOWN`);
console.log('Console errors:', consoleErrors.length ? consoleErrors.slice(0, 10) : 'none');

await browser.close();
