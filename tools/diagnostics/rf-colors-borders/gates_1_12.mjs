'use strict';
/**
 * RF COLORS & BORDERS — GATES 1-12 (formal before/after evidence)
 * Diagnostic tool. Not CI. Run manually: node tools/diagnostics/rf-colors-borders/gates_1_12.mjs
 */
import { chromium } from 'playwright';
import fs from 'node:fs';

const TARGET = process.env.FLIGHT_URL || 'http://localhost:5001/';
const SHOT_DIR = '/tmp/claude-1000/-home-mimi-Escritorio-Claude/d0ec36be-65be-4e3b-b108-bf76e3f7b3d8/scratchpad/gates-screenshots';
fs.mkdirSync(SHOT_DIR, { recursive: true });

let pass = 0, fail = 0;
function gate(id, label, ok, before, after) {
  if (ok) pass++; else fail++;
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${id} ${label}`);
  console.log(`      before: ${JSON.stringify(before)}`);
  console.log(`      after:  ${JSON.stringify(after)}`);
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

async function insertFresh(tool) {
  return page.evaluate((t) => {
    const before = new Set(DS.elements.map(e => e.id));
    InsertEngine.insertAtDefaultPosition(t);
    const el = DS.elements.find(e => !before.has(e.id));
    return { id: el.id, type: el.type };
  }, tool);
}
async function setBorderPx(px) {
  await page.locator('#prop-border-w').fill(String(px));
  await page.locator('#prop-border-w').dispatchEvent('change');
  await page.waitForTimeout(120);
}

console.log('\n===================== GATE 1: Línea horizontal =====================');
const lineH = await insertFresh('line');
await page.waitForTimeout(100);
const g1_before = await page.evaluate((id) => {
  const div = document.querySelector(`.cr-element[data-id="${id}"]`);
  return { stroke: div.querySelector('svg line').getAttribute('stroke'), strokeWidth: div.querySelector('svg line').getAttribute('stroke-width') };
}, lineH.id);
await setBorderPx(0);
const g1_w0 = await page.evaluate((id) => document.querySelector(`.cr-element[data-id="${id}"] svg line`).getAttribute('stroke-width'), lineH.id);
gate('G1a', 'Borde px=0 -> línea horizontal invisible (stroke-width=0)', g1_w0 === '0', g1_before, { strokeWidth: g1_w0 });
await setBorderPx(1);
const g1_w1 = await page.evaluate((id) => document.querySelector(`.cr-element[data-id="${id}"] svg line`).getAttribute('stroke-width'), lineH.id);
gate('G1b', 'Borde px=1 -> línea horizontal fina (stroke-width=1)', g1_w1 === '1', { strokeWidth: g1_w0 }, { strokeWidth: g1_w1 });
await setBorderPx(10);
const g1_w10 = await page.evaluate((id) => document.querySelector(`.cr-element[data-id="${id}"] svg line`).getAttribute('stroke-width'), lineH.id);
gate('G1c', 'Borde px=10 -> línea horizontal gruesa (stroke-width=10)', g1_w10 === '10', { strokeWidth: g1_w1 }, { strokeWidth: g1_w10 });
await page.evaluate((id) => { const e = DS.elements.find(x => x.id === id); e.borderColor = '#FF0000'; _canonicalCanvasWriter().updateElement(id); }, lineH.id);
const g1_red = await page.evaluate((id) => document.querySelector(`.cr-element[data-id="${id}"] svg line`).getAttribute('stroke'), lineH.id);
gate('G1d', 'color borde rojo -> línea roja', g1_red === '#FF0000', { stroke: g1_before.stroke }, { stroke: g1_red });
await page.evaluate((id) => { const e = DS.elements.find(x => x.id === id); e.borderColor = '#000000'; _canonicalCanvasWriter().updateElement(id); }, lineH.id);
const g1_black = await page.evaluate((id) => document.querySelector(`.cr-element[data-id="${id}"] svg line`).getAttribute('stroke'), lineH.id);
gate('G1e', 'color borde negro -> línea negra', g1_black === '#000000', { stroke: g1_red }, { stroke: g1_black });
// Design vs Python parity for the same lineWidth/color
const g1_py = await page.evaluate(async (id) => {
  const e = DS.elements.find(x => x.id === id);
  const layout = { sections: [{ id: 's-x', stype: 'rh', height: 20 }], elements: [{ ...e, sectionId: 's-x' }] };
  const resp = await fetch('/designer-preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ layout, data: {} }) });
  const html = await resp.text();
  const m = html.match(/border-top:(\d+)px solid (#[0-9A-Fa-f]{6})/);
  return m ? { w: m[1], color: m[2] } : null;
}, lineH.id);
gate('G1f', 'Design y Python coinciden (stroke-width=10, color=#000000)', g1_py && g1_py.w === '10' && g1_py.color.toLowerCase() === '#000000', { design: 'stroke-width=10, stroke=#000000' }, g1_py);

console.log('\n===================== GATE 2: Línea vertical =====================');
const lineV = await insertFresh('line-v');
await page.waitForTimeout(100);
await setBorderPx(0);
const g2_w0 = await page.evaluate((id) => document.querySelector(`.cr-element[data-id="${id}"] svg line`).getAttribute('stroke-width'), lineV.id);
gate('G2a', 'Borde px=0 -> línea vertical invisible', g2_w0 === '0', {}, { strokeWidth: g2_w0 });
await setBorderPx(10);
const g2_w10 = await page.evaluate((id) => document.querySelector(`.cr-element[data-id="${id}"] svg line`).getAttribute('stroke-width'), lineV.id);
gate('G2b', 'Borde px=10 -> línea vertical gruesa', g2_w10 === '10', { strokeWidth: g2_w0 }, { strokeWidth: g2_w10 });
await page.evaluate((id) => { const e = DS.elements.find(x => x.id === id); e.borderColor = '#0080FF'; _canonicalCanvasWriter().updateElement(id); }, lineV.id);
const g2_blue = await page.evaluate((id) => document.querySelector(`.cr-element[data-id="${id}"] svg line`).getAttribute('stroke'), lineV.id);
gate('G2c', 'color borde -> línea vertical refleja el color', g2_blue === '#0080FF', {}, { stroke: g2_blue });

console.log('\n===================== GATE 3: Rectángulo =====================');
const rect = await insertFresh('box');
await page.waitForTimeout(100);
await setBorderPx(0);
const g3_w0 = await page.evaluate((id) => document.querySelector(`.cr-element[data-id="${id}"]`).style.border, rect.id);
gate('G3a', 'Borde px=0 -> sin borde', g3_w0 === '', {}, { border: g3_w0 });
await setBorderPx(1);
const g3_w1 = await page.evaluate((id) => document.querySelector(`.cr-element[data-id="${id}"]`).style.border, rect.id);
gate('G3b', 'Borde px=1 -> borde fino', /^1px/.test(g3_w1), { border: g3_w0 }, { border: g3_w1 });
await setBorderPx(10);
const g3_w10 = await page.evaluate((id) => document.querySelector(`.cr-element[data-id="${id}"]`).style.border, rect.id);
gate('G3c', 'Borde px=10 -> borde grueso', /^10px/.test(g3_w10), { border: g3_w1 }, { border: g3_w10 });
await page.evaluate((id) => { const e = DS.elements.find(x => x.id === id); e.borderColor = '#0080FF'; _canonicalCanvasWriter().updateElement(id); }, rect.id);
const g3_blue = await page.evaluate((id) => document.querySelector(`.cr-element[data-id="${id}"]`).style.border, rect.id);
gate('G3d', 'color borde #0080FF -> borde azul', /rgb\(0, 128, 255\)/.test(g3_blue), {}, { border: g3_blue });
await page.evaluate((id) => { const e = DS.elements.find(x => x.id === id); e.bgColor = '#FFFF00'; _canonicalCanvasWriter().updateElement(id); }, rect.id);
const g3_yellow = await page.evaluate((id) => document.querySelector(`.cr-element[data-id="${id}"]`).style.background, rect.id);
gate('G3e', 'fondo #FFFF00 -> fondo amarillo', /rgb\(255, 255, 0\)/.test(g3_yellow), {}, { background: g3_yellow });
await page.evaluate((id) => { const e = DS.elements.find(x => x.id === id); e.bgColor = 'transparent'; _canonicalCanvasWriter().updateElement(id); }, rect.id);
const g3_transp = await page.evaluate((id) => document.querySelector(`.cr-element[data-id="${id}"]`).style.background, rect.id);
gate('G3f', 'fondo transparent -> fondo transparente (no fallback opaco)', g3_transp === 'transparent', { background: g3_yellow }, { background: g3_transp });
const g3_py = await page.evaluate(async (id) => {
  const e = DS.elements.find(x => x.id === id);
  const layout = { sections: [{ id: 's-x', stype: 'rh', height: 60 }], elements: [{ ...e, sectionId: 's-x' }] };
  const resp = await fetch('/designer-preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ layout, data: {} }) });
  const html = await resp.text();
  const m = html.match(/border:(\d+)px solid (#[0-9A-Fa-f]{6});/);
  return m ? { w: m[1], color: m[2] } : null;
}, rect.id);
gate('G3g', 'Design y Python coinciden (borderWidth=10, borderColor=#0080FF)', g3_py && g3_py.w === '10' && g3_py.color.toLowerCase() === '#0080ff', {}, g3_py);

console.log('\n===================== GATE 4: Campo =====================');
const field = await insertFresh('field');
await page.evaluate((id) => { const e = DS.elements.find(x => x.id === id); e.fieldPath = 'cliente.razon_social'; }, field.id);
const g4_pathBefore = await page.evaluate((id) => DS.elements.find(x => x.id === id).fieldPath, field.id);
await page.evaluate((id) => { const e = DS.elements.find(x => x.id === id); e.color = '#FF0000'; _canonicalCanvasWriter().updateElement(id); }, field.id);
const g4_color = await page.evaluate((id) => document.querySelector(`.cr-element[data-id="${id}"]`).style.color, field.id);
gate('G4a', 'color fuente cambia texto', /rgb\(255, 0, 0\)/.test(g4_color), {}, { color: g4_color });
await page.evaluate((id) => { const e = DS.elements.find(x => x.id === id); e.bgColor = '#00FF00'; _canonicalCanvasWriter().updateElement(id); }, field.id);
const g4_bg = await page.evaluate((id) => document.querySelector(`.cr-element[data-id="${id}"]`).style.background, field.id);
gate('G4b', 'fondo cambia fondo', /rgb\(0, 255, 0\)/.test(g4_bg), {}, { background: g4_bg });
await page.evaluate((id) => { const e = DS.elements.find(x => x.id === id); e.borderColor = '#0000FF'; _canonicalCanvasWriter().updateElement(id); }, field.id);
await setBorderPx(0);
const g4_w0 = await page.evaluate((id) => document.querySelector(`.cr-element[data-id="${id}"]`).style.border, field.id);
await setBorderPx(1);
const g4_w1 = await page.evaluate((id) => document.querySelector(`.cr-element[data-id="${id}"]`).style.border, field.id);
await setBorderPx(10);
const g4_w10 = await page.evaluate((id) => document.querySelector(`.cr-element[data-id="${id}"]`).style.border, field.id);
gate('G4c', 'borde px 0/1/10 funciona', g4_w0 === '' && /^1px/.test(g4_w1) && /^10px/.test(g4_w10), { w0: g4_w0 }, { w1: g4_w1, w10: g4_w10 });
const g4_pathAfter = await page.evaluate((id) => DS.elements.find(x => x.id === id).fieldPath, field.id);
gate('G4d', 'fieldPath no cambia', g4_pathAfter === g4_pathBefore, { fieldPath: g4_pathBefore }, { fieldPath: g4_pathAfter });

console.log('\n===================== GATE 5: Texto =====================');
const text = await insertFresh('text');
// insertAtDefaultPosition('text') schedules a 50ms setTimeout to auto-focus
// the new text for inline editing (SelectionEngine.startTextEdit) -- let it
// settle and blur before driving the panel, or the edit-mode blur/commit can
// race with these evaluate() calls.
await page.waitForTimeout(200);
await page.evaluate(() => { const active = document.activeElement; if (active && active.blur) active.blur(); });
await page.waitForTimeout(100);
await page.evaluate((id) => { DS.selectOnly(id, 'gates'); PropertiesEngine.render(); }, text.id);
await page.waitForTimeout(100);
await page.evaluate((id) => { const e = DS.elements.find(x => x.id === id); e.content = 'Hola Mundo'; }, text.id);
const g5_contentBefore = await page.evaluate((id) => DS.elements.find(x => x.id === id).content, text.id);
await page.evaluate((id) => { const e = DS.elements.find(x => x.id === id); e.color = '#FF0000'; e.bgColor = '#00FF00'; e.borderColor = '#0000FF'; _canonicalCanvasWriter().updateElement(id); }, text.id);
await setBorderPx(0);
const g5_w0 = await page.evaluate((id) => document.querySelector(`.cr-element[data-id="${id}"]`).style.border, text.id);
await setBorderPx(1);
const g5_w1 = await page.evaluate((id) => document.querySelector(`.cr-element[data-id="${id}"]`).style.border, text.id);
await setBorderPx(10);
const g5_w10 = await page.evaluate((id) => document.querySelector(`.cr-element[data-id="${id}"]`).style.border, text.id);
const g5_visual = await page.evaluate((id) => { const d = document.querySelector(`.cr-element[data-id="${id}"]`); return { color: d.style.color, background: d.style.background }; }, text.id);
gate('G5a', 'color fuente / fondo / borde 0-1-10 funcionan', /rgb\(255, 0, 0\)/.test(g5_visual.color) && /rgb\(0, 255, 0\)/.test(g5_visual.background) && g5_w0 === '' && /^1px/.test(g5_w1) && /^10px/.test(g5_w10), {}, { ...g5_visual, w0: g5_w0, w1: g5_w1, w10: g5_w10 });
const g5_contentAfter = await page.evaluate((id) => DS.elements.find(x => x.id === id).content, text.id);
gate('G5b', 'content no cambia', g5_contentAfter === g5_contentBefore, { content: g5_contentBefore }, { content: g5_contentAfter });

console.log('\n===================== GATE 6: Format Editor borders =====================');
const rectFmt = await insertFresh('box');
await page.evaluate((id) => { DS.selectOnly(id, 'gates'); PropertiesEngine.render(); }, rectFmt.id);
await page.waitForTimeout(100);
const g6_warnBefore = await page.evaluate(() => !!document.getElementById('props-form').textContent.includes('Editor de Formato'));
await page.evaluate((id) => { const el = DS.elements.find(x => x.id === id); DS.selectOnly(id, 'gates'); FormatEditorEngine.open(el); }, rectFmt.id);
await page.waitForTimeout(150);
await page.locator('button.fmt-tab-btn', { hasText: 'Bordes' }).click();
await page.waitForTimeout(80);
await page.locator('#fmt-brd-top').check();
await page.waitForTimeout(80);
await page.locator('button:has-text("Aceptar")').click();
await page.waitForTimeout(150);
await page.evaluate((id) => { DS.selectOnly(id, 'gates'); PropertiesEngine.render(); }, rectFmt.id);
await page.waitForTimeout(100);
const g6_warnAfter = await page.evaluate(() => !!document.getElementById('props-form').textContent.includes('Editor de Formato'));
gate('G6', 'Properties Panel muestra aviso cuando format.borders está activo (no queda engañoso)', !g6_warnBefore && g6_warnAfter, { warningShown: g6_warnBefore }, { warningShown: g6_warnAfter });

console.log('\n===================== GATE 7: Python/server render =====================');
gate('G7', 'Python coincide con Design (ver G1f, G3g arriba)', (g1_py && g1_py.w === '10') && (g3_py && g3_py.w === '10'), {}, { lineOk: !!g1_py, rectOk: !!g3_py });

console.log('\n===================== GATE 8: Save/reload =====================');
const lineSave = await insertFresh('line');
await page.evaluate((id) => { const e = DS.elements.find(x => x.id === id); e.lineWidth = 0; e.color = '#ABCDEF'; e.borderColor = '#123456'; }, lineSave.id);
const g8_before = await page.evaluate((id) => { const e = DS.elements.find(x => x.id === id); return { lineWidth: e.lineWidth, borderColor: e.borderColor }; }, lineSave.id);
const g8_after = await page.evaluate((id) => {
  const savedJson = CommandRuntimeFile.toJSON();
  const normalized = CommandRuntimeFile._normalizeLayout(JSON.parse(savedJson));
  DS.setSections(normalized.sections, 'gates.reload');
  DS.setElements(normalized.elements, 'gates.reload');
  const reloaded = DS.elements.find(e => e.id === id);
  return reloaded ? { lineWidth: reloaded.lineWidth, borderColor: reloaded.borderColor } : null;
}, lineSave.id);
gate('G8', 'color fuente/fondo/borde/borde px persisten tras guardar+recargar', g8_after && g8_after.lineWidth === 0 && g8_after.borderColor === '#123456', g8_before, g8_after);

console.log('\n===================== GATE 9: Transparente =====================');
const rectT = await insertFresh('box');
await page.evaluate((id) => { const e = DS.elements.find(x => x.id === id); e.bgColor = 'transparent'; e.borderColor = 'transparent'; e.borderWidth = 5; _canonicalCanvasWriter().updateElement(id); }, rectT.id);
const g9_rect = await page.evaluate((id) => { const d = document.querySelector(`.cr-element[data-id="${id}"]`); return { background: d.style.background, border: d.style.border }; }, rectT.id);
gate('G9a', 'fondo transparent persiste (rect)', g9_rect.background === 'transparent', {}, g9_rect);
gate('G9b', 'borde transparent oculta borde visualmente (rect)', g9_rect.border === '' || /solid transparent$/.test(g9_rect.border), {}, g9_rect);

const lineTG = await insertFresh('line');
await page.evaluate((id) => { const e = DS.elements.find(x => x.id === id); e.borderColor = 'transparent'; e.lineWidth = 5; _canonicalCanvasWriter().updateElement(id); }, lineTG.id);
const g9_line = await page.evaluate((id) => document.querySelector(`.cr-element[data-id="${id}"] svg line`).getAttribute('stroke'), lineTG.id);
gate('G9c', 'line borderColor=transparent -> contrato explícito documentado (fallback negro consistente Design+Python, no aleatorio)', g9_line === '#000', {}, { stroke: g9_line, note: 'documented contract, not fixed -- see report' });

console.log('\n===================== GATE 10: No clobber =====================');
const clobberEl = await insertFresh('field');
await page.evaluate((id) => {
  const e = DS.elements.find(x => x.id === id);
  e.fieldPath = 'cliente.email'; e.content = ''; e.align = 'right'; e.valign = 'bottom';
  e.format = { number: { decimals: 3 } }; e.zIndex = 7;
}, clobberEl.id);
const g10_before = await page.evaluate((id) => {
  const e = DS.elements.find(x => x.id === id);
  return { x: e.x, y: e.y, w: e.w, h: e.h, sectionId: e.sectionId, fieldPath: e.fieldPath, content: e.content, align: e.align, valign: e.valign, format: e.format, zIndex: e.zIndex };
}, clobberEl.id);
await page.evaluate((id) => { const e = DS.elements.find(x => x.id === id); e.color = '#FF00FF'; e.bgColor = '#00FFFF'; e.borderColor = '#FFFF00'; _canonicalCanvasWriter().updateElement(id); }, clobberEl.id);
await setBorderPx(7);
const g10_after = await page.evaluate((id) => {
  const e = DS.elements.find(x => x.id === id);
  return { x: e.x, y: e.y, w: e.w, h: e.h, sectionId: e.sectionId, fieldPath: e.fieldPath, content: e.content, align: e.align, valign: e.valign, format: e.format, zIndex: e.zIndex };
}, clobberEl.id);
gate('G10', 'cambiar color/borde no modifica x/y/w/h/sectionId/fieldPath/content/align/valign/format.number/zIndex', JSON.stringify(g10_before) === JSON.stringify(g10_after), g10_before, g10_after);

console.log('\n===================== GATE 11: UI consistency =====================');
const consistEl = await insertFresh('box');
await page.evaluate((id) => { const e = DS.elements.find(x => x.id === id); e.bgColor = '#AABBCC'; e.borderColor = '#112233'; }, consistEl.id);
await page.evaluate((id) => { DS.selectOnly(id, 'gates'); PropertiesEngine.render(); FormatEngine.updateToolbar(); }, consistEl.id);
await page.waitForTimeout(100);
const g11 = await page.evaluate((id) => {
  const e = DS.elements.find(x => x.id === id);
  const panelBg = document.getElementById('pc-bg')?.style.background;
  const panelBorder = document.getElementById('pc-border')?.style.background;
  const toolbarBg = getComputedStyle(document.documentElement).getPropertyValue('--swatch-bg').trim();
  const toolbarBorder = getComputedStyle(document.documentElement).getPropertyValue('--swatch-border').trim();
  return { effective: { bgColor: e.bgColor, borderColor: e.borderColor }, panelBg, panelBorder, toolbarBg, toolbarBorder };
}, consistEl.id);
gate('G11', 'swatches (panel Y toolbar) muestran exactamente el color efectivo del elemento', g11.toolbarBg.toUpperCase() === g11.effective.bgColor.toUpperCase() && g11.toolbarBorder.toUpperCase() === g11.effective.borderColor.toUpperCase(), {}, g11);

console.log('\n===================== SCREENSHOTS =====================');
async function shot(name) { await page.screenshot({ path: `${SHOT_DIR}/${name}.png` }); console.log('  saved', name); }

// Line 0/1/10 screenshot
const shotLine = await insertFresh('line');
await page.evaluate((id) => { DS.selectOnly(id, 'gates'); PropertiesEngine.render(); }, shotLine.id);
await page.waitForTimeout(100);
await setBorderPx(0); await shot('line_0px');
await setBorderPx(1); await shot('line_1px');
await setBorderPx(10); await shot('line_10px');

// Rect 0/10
const shotRect = await insertFresh('box');
await page.evaluate((id) => { DS.selectOnly(id, 'gates'); PropertiesEngine.render(); }, shotRect.id);
await page.waitForTimeout(100);
await setBorderPx(0); await shot('rect_0px');
await setBorderPx(10); await shot('rect_10px');

// Field/text with color font/bg/border
const shotField = await insertFresh('field');
await page.evaluate((id) => { const e = DS.elements.find(x => x.id === id); e.color = '#CC0000'; e.bgColor = '#FFEECC'; e.borderColor = '#003399'; e.borderWidth = 3; _canonicalCanvasWriter().updateElement(id); }, shotField.id);
await page.evaluate((id) => { DS.selectOnly(id, 'gates'); PropertiesEngine.render(); }, shotField.id);
await page.waitForTimeout(100);
await shot('field_colors');

// Transparent
const shotTransp = await insertFresh('box');
await page.evaluate((id) => { const e = DS.elements.find(x => x.id === id); e.bgColor = 'transparent'; e.borderColor = 'transparent'; e.borderWidth = 4; _canonicalCanvasWriter().updateElement(id); }, shotTransp.id);
await page.evaluate((id) => { DS.selectOnly(id, 'gates'); PropertiesEngine.render(); }, shotTransp.id);
await page.waitForTimeout(100);
await shot('transparent_rect');

console.log('\n' + '='.repeat(70));
console.log(`GATES SUMMARY: ${pass} passed, ${fail} failed`);
console.log('Console errors:', consoleErrors.length ? consoleErrors.slice(0, 10) : 'none');

await browser.close();
process.exit(fail > 0 ? 1 : 0);
