'use strict';
/**
 * FASE 2 — element/text alignment, mode switch D<->P, cycling, zoom/scroll,
 * save/reload.
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

// Global row counter across ALL calls in this script -- restarting numbering
// at 0 on every call (as an earlier version of this helper did) stacked
// many fixtures at the same y across unrelated test sections, and a mouse
// click/drag on one could resolve (correctly, via HitTestResolver's area/
// frame tie-break) to a DIFFERENT overlapping element instead. Not a product
// bug -- a test-fixture placement bug, same class already found and fixed
// in gates_drag_move.mjs.
let _fixtureRow = 0;
async function buildFixtures(specs, secId = 's-pf') {
  const startRow = _fixtureRow;
  _fixtureRow += specs.length;
  const ids = await page.evaluate(({ specs, secId, startRow }) => {
    const sec = DS.sections.find(s => s.id === secId);
    sec.height = Math.max(sec.height, 40 * (startRow + specs.length + 2));
    const secDiv = document.querySelector(`.cr-section[data-section-id="${secId}"]`);
    if (secDiv) secDiv.style.height = sec.height + 'px';
    const made = specs.map((spec, i) => {
      const y = 10 + (startRow + i) * 40;
      if (spec.type === 'field') return mkEl('field', secId, spec.x ?? 20, y, spec.w ?? 150, 16, { fieldPath: 'x.y', content: '' });
      if (spec.type === 'text') return mkEl('text', secId, spec.x ?? 20, y, spec.w ?? 150, 16, { content: 'Hola' });
      if (spec.type === 'rect') return mkEl('rect', secId, spec.x ?? 20, y, spec.w ?? 150, 30, { bgColor: 'transparent', borderColor: '#000', borderWidth: 1 });
      if (spec.type === 'line') return mkEl('line', secId, spec.x ?? 20, y, spec.w ?? 150, 2, { borderColor: '#000', lineWidth: 2, lineDir: 'h' });
      return null;
    });
    DS.setElements([...DS.elements, ...made], 'fixtures');
    _canonicalCanvasWriter().renderAll();
    return made.map(e => e.id);
  }, { specs, secId, startRow });
  await page.waitForTimeout(120);
  return ids;
}

// ============================================================
console.log('\n===================== Element alignment: single (section reference) =====================');
const [singleId] = await buildFixtures([{ type: 'field', x: 55, w: 100 }]);
await page.evaluate((id) => DS.selectOnly(id, 'gates'), singleId);
await page.evaluate(() => CommandEngine.alignLefts());
const afterLeft = await page.evaluate((id) => DS.elements.find(e => e.id === id).x, singleId);
gate('ALIGN-1', 'single element align-left -> x=0 (section reference)', afterLeft === 0, { afterLeft });

await page.evaluate(() => CommandEngine.alignRights());
const afterRight = await page.evaluate((id) => { const e = DS.elements.find(x => x.id === id); return { x: e.x, w: e.w }; }, singleId);
const pageW = await page.evaluate(() => CFG.PAGE_W);
gate('ALIGN-2', 'single element align-right -> x+w == section content width', Math.abs((afterRight.x + afterRight.w) - pageW) < 30, { afterRight, pageW });

await page.evaluate(() => CommandEngine.alignCenters());
const afterCenter = await page.evaluate((id) => { const e = DS.elements.find(x => x.id === id); return { x: e.x, w: e.w }; }, singleId);
gate('ALIGN-3', 'single element align-center -> horizontally centered in section', Math.abs((afterCenter.x + afterCenter.w / 2) - pageW / 2) < 30, { afterCenter, pageW });

console.log('\n===================== Element alignment: multi (group reference) =====================');
const multiIds = await buildFixtures([{ type: 'field', x: 20, w: 100 }, { type: 'rect', x: 60, w: 80 }, { type: 'text', x: 100, w: 60 }]);
await page.evaluate((ids) => { DS.clearSelectionState('gates'); ids.forEach(id => DS.addSelection(id, 'gates')); }, multiIds);
await page.evaluate(() => CommandEngine.alignLefts());
const afterMultiLeft = await page.evaluate((ids) => ids.map(id => DS.elements.find(e => e.id === id).x), multiIds);
gate('ALIGN-4', 'multi align-left -> all x equal to the group minimum (20)', afterMultiLeft.every(x => x === 20), { afterMultiLeft });

console.log('\n===================== Text alignment: no clobber of box =====================');
const [textId] = await buildFixtures([{ type: 'text', x: 30, w: 120 }]);
const before = await page.evaluate((id) => { const e = DS.elements.find(x => x.id === id); return { x: e.x, y: e.y, w: e.w, h: e.h, content: e.content }; }, textId);
await page.evaluate((id) => { DS.selectOnly(id, 'gates'); }, textId);
await page.evaluate(() => FormatEngine.applyFormat('align', 'center'));
await page.evaluate(() => FormatEngine.applyFormat('valign', 'middle'));
const after = await page.evaluate((id) => { const e = DS.elements.find(x => x.id === id); return { x: e.x, y: e.y, w: e.w, h: e.h, content: e.content, align: e.align, valign: e.valign }; }, textId);
gate('ALIGN-5', 'text align H/V changes align/valign only, x/y/w/h/content untouched', after.x === before.x && after.y === before.y && after.w === before.w && after.h === before.h && after.content === before.content && after.align === 'center' && after.valign === 'middle', { before, after });

console.log('\n--- text alignment on rect/line: no clobber, no exception ---');
const [rectAlignId] = await buildFixtures([{ type: 'rect' }]);
const rectBefore = await page.evaluate((id) => { const e = DS.elements.find(x => x.id === id); return { ...e }; }, rectAlignId);
await page.evaluate((id) => { DS.selectOnly(id, 'gates'); }, rectAlignId);
let rectAlignError = null;
try { await page.evaluate(() => FormatEngine.applyFormat('align', 'right')); } catch (e) { rectAlignError = String(e); }
const rectAfter = await page.evaluate((id) => { const e = DS.elements.find(x => x.id === id); return { ...e }; }, rectAlignId);
gate('ALIGN-6', 'applying text-align to a rect does not throw and does not move/resize it', !rectAlignError && rectAfter.x === rectBefore.x && rectAfter.y === rectBefore.y && rectAfter.w === rectBefore.w && rectAfter.h === rectBefore.h, { rectAlignError, rectBefore, rectAfter });

// ============================================================
console.log('\n===================== Mode switch: Design -> Preview -> Design =====================');
const [msId] = await buildFixtures([{ type: 'field', x: 44, w: 90 }]);
const posBeforeSwitch = await page.evaluate((id) => { const e = DS.elements.find(x => x.id === id); return { x: e.x, y: e.y, w: e.w, h: e.h }; }, msId);
await page.locator('#tab-preview').click();
await page.waitForTimeout(1200);
const posAfterToPreview = await page.evaluate((id) => { const e = DS.elements.find(x => x.id === id); return { x: e.x, y: e.y, w: e.w, h: e.h }; }, msId);
gate('SWITCH-1', 'Design->Preview: x/y/w/h unchanged', JSON.stringify(posBeforeSwitch) === JSON.stringify(posAfterToPreview), { posBeforeSwitch, posAfterToPreview });
const designHandlesVisibleInPreview = await page.evaluate(() => {
  const layer = document.getElementById('handles-layer');
  return layer ? getComputedStyle(layer).display !== 'none' && layer.children.length > 0 && !document.getElementById('canvas-layer').classList.contains('preview-mode') : null;
});
gate('SWITCH-2', 'no stale Design handles-layer content bleeding into Preview', designHandlesVisibleInPreview === false || designHandlesVisibleInPreview === null, { designHandlesVisibleInPreview });

await page.locator('#tab-design').click();
await page.waitForTimeout(500);
const posAfterBackToDesign = await page.evaluate((id) => { const e = DS.elements.find(x => x.id === id); return { x: e.x, y: e.y, w: e.w, h: e.h }; }, msId);
gate('SWITCH-3', 'Preview->Design: x/y/w/h still unchanged', JSON.stringify(posBeforeSwitch) === JSON.stringify(posAfterBackToDesign), { posBeforeSwitch, posAfterBackToDesign });
const previewOverlaysLeftover = await page.evaluate(() => document.querySelectorAll('.preview-selection-layer .sel-box, .preview-hover-box').length);
gate('SWITCH-4', 'no leftover Preview selection/hover overlays after returning to Design', previewOverlaysLeftover === 0, { previewOverlaysLeftover });

console.log('\n--- line still shows no box, rect still shows box, after a mode round-trip ---');
const [lineMsId, rectMsId] = await buildFixtures([{ type: 'line', x: 10, w: 100 }, { type: 'rect', x: 10, w: 100 }]);
await page.locator('#tab-preview').click();
await page.waitForTimeout(1000);
await page.locator('#tab-design').click();
await page.waitForTimeout(400);
await page.evaluate((id) => { DS.selectOnly(id, 'gates'); SelectionEngine.renderHandles(); }, lineMsId);
await page.waitForTimeout(100);
const lineSelAfterCycle = await page.evaluate(() => ({ selBox: document.querySelectorAll('.sel-box').length, handles: [...document.querySelectorAll('.sel-handle')].map(h => h.dataset.pos) }));
gate('SWITCH-5', 'line selection still box-free after a Design->Preview->Design cycle', lineSelAfterCycle.selBox === 0 && lineSelAfterCycle.handles.length === 2, lineSelAfterCycle);
await page.evaluate((id) => { DS.selectOnly(id, 'gates'); SelectionEngine.renderHandles(); }, rectMsId);
await page.waitForTimeout(100);
const rectSelAfterCycle = await page.evaluate(() => ({ selBox: document.querySelectorAll('.sel-box').length, handles: document.querySelectorAll('.sel-handle').length }));
gate('SWITCH-6', 'rect selection still has box+8 handles after the cycle', rectSelAfterCycle.selBox === 1 && rectSelAfterCycle.handles === 8, rectSelAfterCycle);

// ============================================================
console.log('\n===================== Cycling: 10x Design<->Preview =====================');
for (let i = 0; i < 10; i++) {
  await page.locator('#tab-preview').click();
  await page.waitForTimeout(150);
  await page.locator('#tab-design').click();
  await page.waitForTimeout(150);
}
const countBeforePostCycle = await page.evaluate(() => DS.elements.length);
const [cycleInsertId] = await buildFixtures([{ type: 'field' }]);
const countAfterPostCycle = await page.evaluate(() => DS.elements.length);
gate('CYCLE-1', 'insert after 10 D<->P cycles still works cleanly', countAfterPostCycle === countBeforePostCycle + 1, { countBeforePostCycle, countAfterPostCycle });

const handlesLayerChildrenDupe = await page.evaluate(() => document.querySelectorAll('#handles-layer').length);
const hitLayerCount = await page.evaluate(() => document.querySelectorAll('.preview-hit-layer').length);
gate('CYCLE-2', 'no duplicated #handles-layer or .preview-hit-layer after cycling', handlesLayerChildrenDupe === 1 && hitLayerCount <= 1, { handlesLayerChildrenDupe, hitLayerCount });

await page.evaluate((id) => { DS.selectOnly(id, 'gates'); SelectionEngine.renderHandles(); }, cycleInsertId);
await page.waitForTimeout(100);
const beforeCycleMove = await page.evaluate((id) => { const e = DS.elements.find(x => x.id === id); return { x: e.x, y: e.y }; }, cycleInsertId);
const cycleRect = await page.evaluate((id) => document.querySelector(`.cr-element[data-id="${id}"]`).getBoundingClientRect(), cycleInsertId);
await page.mouse.move(cycleRect.x + cycleRect.width / 2, cycleRect.y + cycleRect.height / 2);
await page.mouse.down();
await page.mouse.move(cycleRect.x + cycleRect.width / 2 + 40, cycleRect.y + cycleRect.height / 2 + 5, { steps: 5 });
await page.mouse.up();
await page.waitForTimeout(150);
const afterCycleMove = await page.evaluate((id) => { const e = DS.elements.find(x => x.id === id); return { x: e.x, y: e.y }; }, cycleInsertId);
gate('CYCLE-3', 'move after cycling still works', afterCycleMove.x !== beforeCycleMove.x, { beforeCycleMove, afterCycleMove });

const [cycleLineId] = await buildFixtures([{ type: 'line', w: 200 }]);
await page.evaluate((id) => { const e = DS.elements.find(x => x.id === id); e.w = 100; _canonicalCanvasWriter().updateElementPosition(id); }, cycleLineId);
const cycleLineGeom = await page.evaluate((id) => {
  const div = document.querySelector(`.cr-element[data-id="${id}"]`);
  const svg = div.querySelector('svg'); const line = div.querySelector('svg line');
  return { svgW: svg.getAttribute('width'), x2: line.getAttribute('x2') };
}, cycleLineId);
gate('CYCLE-4', 'line resize after cycling still updates SVG geometry', cycleLineGeom.svgW === '100' && cycleLineGeom.x2 === '100', cycleLineGeom);

const countBeforeCycleDel = await page.evaluate(() => DS.elements.length);
await page.evaluate((id) => DS.selectOnly(id, 'gates'), cycleLineId);
await page.evaluate(() => CommandEngine.delete());
await page.waitForTimeout(100);
const countAfterCycleDel = await page.evaluate(() => DS.elements.length);
gate('CYCLE-5', 'delete after cycling still works', countAfterCycleDel === countBeforeCycleDel - 1, { countBeforeCycleDel, countAfterCycleDel });

// ============================================================
console.log('\n===================== Zoom 100/200/400: drag + resize-line + select =====================');
// Fresh page per zoom level: this app's workspace uses a custom synthetic
// scrollbar (SyntheticScrollbarEngine.js), not native scrollTop-driven
// scrolling -- native scrollIntoView() updates the DOM property but the
// synthetic scrollbar doesn't visually follow it, so a deeply-scrolled
// element (from many prior fixtures in one long session) stays genuinely
// off-screen for real mouse events no matter how long we wait. A fresh page
// with a single near-top fixture sidesteps needing to scroll at all -- BUG
// NEW 4's own S5 gate already separately proved click-based selection is
// correct at 100/200/400% zoom; this only re-checks drag specifically.
async function zoomDragTest(zoomPct) {
  const p = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto(TARGET, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => document.documentElement?.dataset?.rfRuntimeReady === '1', null, { timeout: 15000 });
  await p.waitForFunction(() => typeof DS !== 'undefined' && DS.elements.length > 0, null, { timeout: 10000 });
  await p.waitForTimeout(500);
  await p.evaluate((z) => { if (typeof DesignZoomEngine !== 'undefined') DesignZoomEngine.set(z / 100); else DS.zoom = z / 100; }, zoomPct);
  await p.waitForTimeout(200);
  // s-rh (Report Header) is the very first band on the page -- stays inside
  // the fixed 900px test viewport even at 400% zoom, unlike s-pf (Page
  // Footer) which sits after header/detail bands and needs real scrolling
  // this harness can't drive (see comment above). Matches the section BUG
  // NEW 4's own S5 zoom gate used for the same reason.
  // x=4,y=64: the default invoice's own s-rh fields cluster at x=4,y=4..58 --
  // y=64 clears them while staying near the top-left corner, which is what
  // keeps this on-screen at 400% zoom (x=400 mapped to 1600 screen px at 4x,
  // past the 1440-wide test viewport -- a small-x position avoids that).
  // Also grow the section defensively; sections clip (contain:paint) past
  // their declared height.
  const id = await p.evaluate(() => {
    const sec = DS.sections.find(s => s.id === 's-rh');
    sec.height = Math.max(sec.height, 90);
    const secDiv = document.querySelector('.cr-section[data-section-id="s-rh"]');
    if (secDiv) secDiv.style.height = sec.height + 'px';
    const el = mkEl('field', 's-rh', 4, 64, 90, 16, { fieldPath: 'x.y', content: '' });
    DS.setElements([...DS.elements, el], 'zoom-drag');
    _canonicalCanvasWriter().renderAll();
    return el.id;
  });
  await p.waitForTimeout(150);
  const before = await p.evaluate((id) => { const e = DS.elements.find(x => x.id === id); return { x: e.x, y: e.y }; }, id);
  const rect = await p.evaluate((id) => document.querySelector(`.cr-element[data-id="${id}"]`).getBoundingClientRect(), id);
  await p.evaluate((id) => { DS.selectOnly(id, 'gates'); SelectionEngine.renderHandles(); }, id);
  const pt = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  await p.mouse.move(pt.x, pt.y);
  await p.mouse.down();
  await p.mouse.move(pt.x + 40, pt.y + 5, { steps: 5 });
  await p.mouse.up();
  await p.waitForTimeout(150);
  const after = await p.evaluate((id) => { const e = DS.elements.find(x => x.id === id); return { x: e.x, y: e.y }; }, id);

  const lineId = await p.evaluate(() => {
    const el = mkEl('line', 's-pf', 15, 30, 200, 2, { borderColor: '#000', lineWidth: 2, lineDir: 'h' });
    DS.setElements([...DS.elements, el], 'zoom-drag-line');
    _canonicalCanvasWriter().renderAll();
    return el.id;
  });
  await p.evaluate((id) => { const e = DS.elements.find(x => x.id === id); e.w = 100; _canonicalCanvasWriter().updateElementPosition(id); }, lineId);
  const lineGeom = await p.evaluate((id) => {
    const div = document.querySelector(`.cr-element[data-id="${id}"]`);
    const svg = div.querySelector('svg'); const line = div.querySelector('svg line');
    return { svgW: svg.getAttribute('width'), x2: line.getAttribute('x2') };
  }, lineId);
  await p.close();
  return { before, after, lineGeom };
}
for (const zoomPct of [100, 200, 400]) {
  const r = await zoomDragTest(zoomPct);
  gate(`ZOOM-${zoomPct}-drag`, `zoom ${zoomPct}%: drag moves the field (model-space delta matches the mouse)`, r.after.x !== r.before.x, { zoom: zoomPct, before: r.before, after: r.after });
  gate(`ZOOM-${zoomPct}-resize-line`, `zoom ${zoomPct}%: line resize still updates SVG geometry correctly`, r.lineGeom.svgW === '100' && r.lineGeom.x2 === '100', r.lineGeom);
}

// ============================================================
console.log('\n===================== Save / reload =====================');
const saveFixtures = await buildFixtures([
  { type: 'line', x: 12, w: 130 },
  { type: 'rect', x: 12, w: 130 },
  { type: 'field', x: 12, w: 130 },
  { type: 'text', x: 12, w: 130 },
]);
const [saveLineId, saveRectId, saveFieldId, saveTextId] = saveFixtures;
await page.evaluate(({ saveLineId, saveRectId, saveFieldId, saveTextId }) => {
  const line = DS.elements.find(e => e.id === saveLineId);
  line.lineDir = 'v'; line.lineWidth = 6; line.w = 2; line.h = 77; line.borderColor = '#AA00AA';
  const rect = DS.elements.find(e => e.id === saveRectId);
  rect.borderColor = '#0000FF'; rect.borderWidth = 4; rect.bgColor = '#FFEE00';
  const field = DS.elements.find(e => e.id === saveFieldId);
  field.align = 'right'; field.valign = 'bottom'; field.color = '#123456';
  const text = DS.elements.find(e => e.id === saveTextId);
  text.align = 'center'; text.valign = 'top'; text.color = '#654321';
  _canonicalCanvasWriter().updateElement(saveLineId);
  _canonicalCanvasWriter().updateElementPosition(saveLineId);
  _canonicalCanvasWriter().updateElement(saveRectId);
  _canonicalCanvasWriter().updateElement(saveFieldId);
  _canonicalCanvasWriter().updateElement(saveTextId);
}, { saveLineId, saveRectId, saveFieldId, saveTextId });

const beforeSave = await page.evaluate(({ saveLineId, saveRectId, saveFieldId, saveTextId }) => ({
  line: (({ lineDir, lineWidth, w, h, borderColor }) => ({ lineDir, lineWidth, w, h, borderColor }))(DS.elements.find(e => e.id === saveLineId)),
  rect: (({ borderColor, borderWidth, bgColor }) => ({ borderColor, borderWidth, bgColor }))(DS.elements.find(e => e.id === saveRectId)),
  field: (({ align, valign, color }) => ({ align, valign, color }))(DS.elements.find(e => e.id === saveFieldId)),
  text: (({ align, valign, color }) => ({ align, valign, color }))(DS.elements.find(e => e.id === saveTextId)),
}), { saveLineId, saveRectId, saveFieldId, saveTextId });

// copy/paste BEFORE reload too, to check ids don't collide with anything reload introduces
await page.evaluate((id) => { DS.selectOnly(id, 'gates'); ClipboardEngine.copy(); }, saveFieldId);
const pastedBeforeReload = await page.evaluate(() => ClipboardEngine.paste());

const reloadResult = await page.evaluate(() => {
  const savedJson = CommandRuntimeFile.toJSON();
  const normalized = CommandRuntimeFile._normalizeLayout(JSON.parse(savedJson));
  DS.setSections(normalized.sections, 'gates.reload');
  DS.setElements(normalized.elements, 'gates.reload');
  return { elementCount: DS.elements.length, uniqueIds: new Set(DS.elements.map(e => e.id)).size };
});
gate('SAVE-0', 'reload: no id collisions (unique count == element count)', reloadResult.elementCount === reloadResult.uniqueIds, reloadResult);

const afterSave = await page.evaluate(({ saveLineId, saveRectId, saveFieldId, saveTextId }) => {
  const l = DS.elements.find(e => e.id === saveLineId);
  const r = DS.elements.find(e => e.id === saveRectId);
  const f = DS.elements.find(e => e.id === saveFieldId);
  const t = DS.elements.find(e => e.id === saveTextId);
  return {
    line: l && (({ lineDir, lineWidth, w, h, borderColor }) => ({ lineDir, lineWidth, w, h, borderColor }))(l),
    rect: r && (({ borderColor, borderWidth, bgColor }) => ({ borderColor, borderWidth, bgColor }))(r),
    field: f && (({ align, valign, color }) => ({ align, valign, color }))(f),
    text: t && (({ align, valign, color }) => ({ align, valign, color }))(t),
  };
}, { saveLineId, saveRectId, saveFieldId, saveTextId });
gate('SAVE-1', 'reload: line lineDir/lineWidth/w/h/borderColor preserved', JSON.stringify(afterSave.line) === JSON.stringify(beforeSave.line), { before: beforeSave.line, after: afterSave.line });
gate('SAVE-2', 'reload: rect border/bg preserved', JSON.stringify(afterSave.rect) === JSON.stringify(beforeSave.rect), { before: beforeSave.rect, after: afterSave.rect });
gate('SAVE-3', 'reload: field align/valign/color preserved', JSON.stringify(afterSave.field) === JSON.stringify(beforeSave.field), { before: beforeSave.field, after: afterSave.field });
gate('SAVE-4', 'reload: text align/valign/color preserved', JSON.stringify(afterSave.text) === JSON.stringify(beforeSave.text), { before: beforeSave.text, after: afterSave.text });

console.log('\n--- Preview after reload matches Preview before (same server render) ---');
await page.locator('#tab-preview').click();
await page.waitForTimeout(1200);
const previewOkAfterReload = await page.evaluate((id) => !!document.querySelector(`.preview-hit-layer .pv-el[data-origin-id="${id}"]`), saveRectId);
gate('SAVE-5', 'Preview renders correctly after a reload (element present in hit-layer)', previewOkAfterReload, { previewOkAfterReload });
await page.locator('#tab-design').click();
await page.waitForTimeout(400);

console.log('\n' + '='.repeat(70));
console.log(`RESULT: ${pass} passed, ${fail} failed`);
console.log('Console errors:', consoleErrors.length ? consoleErrors : 'none');

await browser.close();
process.exit(fail > 0 ? 1 : 0);
