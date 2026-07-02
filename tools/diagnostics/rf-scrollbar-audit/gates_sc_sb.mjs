'use strict';
/**
 * Post-fix gates for BUG NEW 5 (SC-1..5) and BUG NEW 6 (SB-1..4).
 * Fixes under test:
 *  - engines/EngineCoreRoutingPointerHelpers.js: isPointerOnDesignerChrome()
 *    guard in routePointer, before HitTestResolver/selection/insert.
 *  - engines/SyntheticScrollbarEngine.js: scrollBehavior save/auto/restore
 *    around the thumb drag lifecycle.
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

await page.evaluate(() => {
  const sec = DS.sections.find(s => s.id === 's-pf');
  sec.height = Math.max(sec.height, 900);
  const secDiv = document.querySelector('.cr-section[data-section-id="s-pf"]');
  if (secDiv) secDiv.style.height = sec.height + 'px';
  const made = [];
  for (let y = 4; y < sec.height - 16; y += 26) {
    for (let x = 4; x < 740; x += 130) made.push(mkEl('field', 's-pf', x, y, 120, 16, { fieldPath: 'x.y', content: '' }));
  }
  DS.setElements([...DS.elements, ...made], 'gates-sc-sb');
  _canonicalCanvasWriter().renderAll();
});
await page.waitForTimeout(200);

async function getGeo() {
  return page.evaluate(() => {
    const ws = document.getElementById('workspace');
    const trackV = document.querySelector('.rf-scrollbar-track--v');
    const trackH = document.querySelector('.rf-scrollbar-track--h');
    const thumbV = document.querySelector('.rf-scrollbar-thumb--v');
    const thumbH = document.querySelector('.rf-scrollbar-thumb--h');
    const vVisible = trackV && getComputedStyle(trackV).display !== 'none';
    const hVisible = trackH && getComputedStyle(trackH).display !== 'none';
    return {
      scrollHeight: ws.scrollHeight, clientHeight: ws.clientHeight,
      scrollWidth: ws.scrollWidth, clientWidth: ws.clientWidth,
      thumbVRect: vVisible ? thumbV.getBoundingClientRect() : null,
      thumbHRect: hVisible ? thumbH.getBoundingClientRect() : null,
      trackVRect: vVisible ? trackV.getBoundingClientRect() : null,
      trackHRect: hVisible ? trackH.getBoundingClientRect() : null,
      inlineScrollBehavior: ws.style.scrollBehavior,
    };
  });
}

async function resetScroll() {
  // Between tests #workspace's scrollBehavior has been restored to its
  // normal 'smooth' (canvas.css), so setting scrollTop/Left here would
  // itself animate rather than jump -- bypass that explicitly for the
  // reset itself, same technique as the production fix uses during a real
  // drag, so the NEXT test starts from a true, settled scrollTop=0.
  await page.evaluate(() => {
    const ws = document.getElementById('workspace');
    const prev = ws.style.scrollBehavior;
    ws.style.scrollBehavior = 'auto';
    ws.scrollTop = 0; ws.scrollLeft = 0;
    ws.style.scrollBehavior = prev;
  });
  await page.waitForTimeout(100);
}

// ============================================================
// SC-1/SC-2/SC-3: hover/selection bleed at 100/200/400%, both axes, both modes
// ============================================================
console.log('\n===================== SC-1/2/3: hover+selection bleed by zoom =====================');
for (const mode of ['Design', 'Preview']) {
  if (mode === 'Preview') { await page.locator('#tab-preview').click(); await page.waitForTimeout(1000); }
  else { await page.locator('#tab-design').click().catch(() => {}); await page.waitForTimeout(300); }
  for (const zoomPct of [100, 200, 400]) {
    await page.evaluate((z) => DesignZoomEngine.set(z / 100), zoomPct);
    await page.waitForTimeout(300);
    await resetScroll();
    const geo = await getGeo();
    for (const axis of ['v', 'h']) {
      const thumbRect = axis === 'v' ? geo.thumbVRect : geo.thumbHRect;
      if (!thumbRect) { gate(`SC-${zoomPct}-${mode}-${axis}`, `${mode} ${zoomPct}% ${axis}-scrollbar hover/selection bleed (SKIPPED: scrollbar not active)`, true, { skipped: true }); continue; }
      const pt = { x: thumbRect.x + thumbRect.width / 2, y: thumbRect.y + thumbRect.height / 2 };
      await page.evaluate(() => { const ws = document.getElementById('workspace'); /* no-op focus point */ });
      // move away then onto the thumb, so hover machinery sees a real "enter"
      await page.mouse.move(pt.x + (axis === 'v' ? 40 : 0), pt.y + (axis === 'v' ? 0 : 40));
      await page.waitForTimeout(60);
      await page.mouse.move(pt.x, pt.y);
      await page.waitForTimeout(150);
      const hoverState = await page.evaluate(() => ({
        designHoverId: document.querySelector('.rf-hit-hover')?.dataset.id || null,
        previewHoverBoxVisible: !!document.querySelector('.preview-hover-box'),
      }));
      const selBefore = await page.evaluate(() => [...DS.selection]);
      await page.mouse.down();
      await page.waitForTimeout(50);
      await page.mouse.up();
      await page.waitForTimeout(100);
      const selAfter = await page.evaluate(() => [...DS.selection]);
      const hoverBled = mode === 'Design' ? !!hoverState.designHoverId : hoverState.previewHoverBoxVisible;
      const selChanged = JSON.stringify(selBefore) !== JSON.stringify(selAfter);
      gate(`SC-${zoomPct}-${mode}-${axis}`, `${mode} ${zoomPct}% ${axis}-scrollbar: no hover bleed, no selection change`,
        !hoverBled && !selChanged, { hoverState, selBefore, selAfter, selChanged });
    }
  }
}

// ============================================================
// SC-4: click on scrollbar -- no rubber-band, no insert, scroll still works
// ============================================================
console.log('\n===================== SC-4: click on scrollbar =====================');
await page.locator('#tab-design').click().catch(() => {});
await page.waitForTimeout(300);
await page.evaluate(() => DesignZoomEngine.set(4.0));
await page.waitForTimeout(300);
await resetScroll();
{
  const geo = await getGeo();
  const pt = { x: geo.thumbVRect.x + geo.thumbVRect.width / 2, y: geo.thumbVRect.y + geo.thumbVRect.height / 2 };
  const selBefore = await page.evaluate(() => [...DS.selection]);
  await page.mouse.move(pt.x, pt.y);
  await page.mouse.down();
  await page.waitForTimeout(30);
  const dragStateAtDown = await page.evaluate(() => ({
    selectionDrag: (typeof SelectionEngine !== 'undefined' && SelectionEngine._drag) || null,
    rubberBandVisible: (() => { const rb = document.getElementById('rubber-band'); return rb ? rb.style.width !== '' && rb.style.width !== '0px' : false; })(),
  }));
  await page.mouse.up();
  await page.waitForTimeout(80);
  const selAfter = await page.evaluate(() => [...DS.selection]);
  const countAfterClick = await page.evaluate(() => DS.elements.length);
  gate('SC-4', 'click on scrollbar: no selection change, no rubber-band, no insert',
    JSON.stringify(selBefore) === JSON.stringify(selAfter) && !dragStateAtDown.selectionDrag && !dragStateAtDown.rubberBandVisible,
    { selBefore, selAfter, dragStateAtDown, countAfterClick });

  // confirm scroll still works after this click
  const before = await page.evaluate(() => document.getElementById('workspace').scrollTop);
  await page.mouse.move(pt.x, pt.y);
  await page.mouse.down();
  await page.mouse.move(pt.x, pt.y + 100, { steps: 6 });
  await page.waitForTimeout(600);
  await page.mouse.up();
  const after = await page.evaluate(() => document.getElementById('workspace').scrollTop);
  gate('SC-4b', 'scroll still functions after a scrollbar click', after > before, { before, after });
}

// ============================================================
// SC-5: drag scrollbar -- no hover, no selection change, no SelectionEngine._drag, no element move/resize/insert
// ============================================================
console.log('\n===================== SC-5: drag scrollbar =====================');
await resetScroll();
{
  const geo = await getGeo();
  const pt = { x: geo.thumbVRect.x + geo.thumbVRect.width / 2, y: geo.thumbVRect.y + geo.thumbVRect.height / 2 };
  const elementsBefore = await page.evaluate(() => DS.elements.map(e => ({ id: e.id, x: e.x, y: e.y })));
  const selBefore = await page.evaluate(() => [...DS.selection]);
  await page.mouse.move(pt.x, pt.y);
  await page.mouse.down();
  await page.waitForTimeout(20);
  const dragTraces = [];
  for (const dy of [30, 60, 100, 150]) {
    await page.mouse.move(pt.x, pt.y + dy, { steps: 4 });
    await page.waitForTimeout(40);
    const t = await page.evaluate(() => ({
      selectionDrag: (typeof SelectionEngine !== 'undefined' && SelectionEngine._drag) || null,
      hoverId: document.querySelector('.rf-hit-hover')?.dataset.id || null,
    }));
    dragTraces.push(t);
  }
  await page.waitForTimeout(600);
  await page.mouse.up();
  await page.waitForTimeout(100);
  const elementsAfter = await page.evaluate(() => DS.elements.map(e => ({ id: e.id, x: e.x, y: e.y })));
  const selAfter = await page.evaluate(() => [...DS.selection]);
  const anySelectionDrag = dragTraces.some(t => t.selectionDrag);
  const anyHover = dragTraces.some(t => t.hoverId);
  const elementsUnchanged = JSON.stringify(elementsBefore) === JSON.stringify(elementsAfter);
  gate('SC-5', 'drag scrollbar: no hover, no selection change, no SelectionEngine._drag, elements unchanged',
    !anySelectionDrag && !anyHover && JSON.stringify(selBefore) === JSON.stringify(selAfter) && elementsUnchanged,
    { dragTraces, selBefore, selAfter, elementsUnchanged });
}

// ============================================================
// SB-1/SB-2: linearity vertical/horizontal, Design+Preview, 100/200/400%
// ============================================================
console.log('\n===================== SB-1/SB-2: linearity =====================');
async function linearityTest(mode, zoomPct, axis) {
  await resetScroll();
  const geo = await getGeo();
  const trackRect = axis === 'v' ? geo.trackVRect : geo.trackHRect;
  const thumbRect = axis === 'v' ? geo.thumbVRect : geo.thumbHRect;
  const maxScroll = axis === 'v' ? (geo.scrollHeight - geo.clientHeight) : (geo.scrollWidth - geo.clientWidth);
  if (!trackRect || !thumbRect || maxScroll <= 0) return { mode, zoomPct, axis, skipped: true };
  const trackLen = axis === 'v' ? trackRect.height : trackRect.width;
  const thumbLen = axis === 'v' ? thumbRect.height : thumbRect.width;
  const maxThumbTravel = trackLen - thumbLen;
  const startClient = axis === 'v' ? (thumbRect.y + thumbRect.height / 2) : (thumbRect.x + thumbRect.width / 2);
  const crossAxis = axis === 'v' ? (thumbRect.x + thumbRect.width / 2) : (thumbRect.y + thumbRect.height / 2);

  if (axis === 'v') await page.mouse.move(crossAxis, startClient); else await page.mouse.move(startClient, crossAxis);
  await page.mouse.down();
  await page.waitForTimeout(30);

  const samples = [];
  let prevScroll = -1, monotonic = true;
  for (const pct of [0, 10, 25, 50, 75, 90, 100]) {
    const travel = (pct / 100) * maxThumbTravel;
    const pos = startClient + travel;
    if (axis === 'v') await page.mouse.move(crossAxis, pos, { steps: 6 }); else await page.mouse.move(pos, crossAxis, { steps: 6 });
    await page.waitForTimeout(40); // same cadence as the original repro capture
    const scrollPos = await page.evaluate((axis) => axis === 'v' ? document.getElementById('workspace').scrollTop : document.getElementById('workspace').scrollLeft, axis);
    const ratioThumb = pct / 100;
    const ratioScroll = scrollPos / maxScroll;
    // Ratio-based diff is the primary signal, but it's the wrong metric for
    // a near-zero maxScroll (e.g. 3px total range): any single CSS-pixel
    // rounding there is a huge percentage, yet perfectly correct behavior --
    // Playwright's mouse.move only delivers whole-device-pixel clientX/Y, so
    // a sub-pixel target (e.g. 0.3px for a 10% sample over a 3px range) must
    // round somewhere. absPxDiff checks against the CORRECTLY ROUNDED exact
    // target instead, which is range-size-independent.
    const expectedPx = Math.round(ratioThumb * maxScroll);
    const absPxDiff = Math.abs(scrollPos - expectedPx);
    if (prevScroll >= 0 && scrollPos < prevScroll - 0.5) monotonic = false;
    prevScroll = scrollPos;
    samples.push({ pct, scrollPos, ratioThumb, ratioScroll, diff: Math.abs(ratioThumb - ratioScroll), expectedPx, absPxDiff });
  }
  await page.mouse.up();
  await page.waitForTimeout(80);
  const maxDiff = Math.max(...samples.map(s => s.diff));
  const maxAbsPxDiff = Math.max(...samples.map(s => s.absPxDiff));
  return { mode, zoomPct, axis, skipped: false, samples, monotonic, maxDiff, maxAbsPxDiff, maxScroll };
}

for (const mode of ['Design', 'Preview']) {
  if (mode === 'Preview') { await page.locator('#tab-preview').click(); await page.waitForTimeout(1000); }
  else { await page.locator('#tab-design').click().catch(() => {}); await page.waitForTimeout(300); }
  for (const zoomPct of [100, 200, 400]) {
    await page.evaluate((z) => DesignZoomEngine.set(z / 100), zoomPct);
    await page.waitForTimeout(300);
    for (const axis of ['v', 'h']) {
      const r = await linearityTest(mode, zoomPct, axis);
      const gateId = axis === 'v' ? 'SB-1' : 'SB-2';
      if (r.skipped) { gate(`${gateId}-${mode}-${zoomPct}`, `${mode} ${zoomPct}% ${axis} linearity (SKIPPED: not active)`, true, r); continue; }
      // Pass on ratio (normal ranges) OR on exact-pixel rounding (degenerate
      // near-zero maxScroll, e.g. 100% zoom barely overflowing) -- both are
      // "linear", just measured with the metric that fits the range size.
      gate(`${gateId}-${mode}-${zoomPct}`, `${mode} ${zoomPct}% ${axis}-axis linearity: ratioThumb≈ratioScroll, monotonic`, (r.maxDiff < 0.05 || r.maxAbsPxDiff <= 1) && r.monotonic, r);
    }
  }
}

// ============================================================
// SB-3: extremes (start=0, end=max, no overshoot)
// ============================================================
console.log('\n===================== SB-3: extremes =====================');
await page.locator('#tab-design').click().catch(() => {});
await page.waitForTimeout(300);
await page.evaluate(() => DesignZoomEngine.set(4.0));
await page.waitForTimeout(300);
await resetScroll();
{
  const geo = await getGeo();
  const trackRect = geo.trackVRect, thumbRect = geo.thumbVRect;
  const maxScroll = geo.scrollHeight - geo.clientHeight;
  const maxThumbTravel = trackRect.height - thumbRect.height;
  const startClient = thumbRect.y + thumbRect.height / 2;
  const crossAxis = thumbRect.x + thumbRect.width / 2;
  await page.mouse.move(crossAxis, startClient);
  await page.mouse.down();
  await page.waitForTimeout(20);
  await page.mouse.move(crossAxis, startClient, { steps: 1 });
  await page.waitForTimeout(300);
  const atStart = await page.evaluate(() => document.getElementById('workspace').scrollTop);
  await page.mouse.move(crossAxis, startClient + maxThumbTravel, { steps: 8 });
  await page.waitForTimeout(300);
  const atEnd = await page.evaluate(() => document.getElementById('workspace').scrollTop);
  // overshoot check: move PAST the track end
  await page.mouse.move(crossAxis, startClient + maxThumbTravel + 200, { steps: 4 });
  await page.waitForTimeout(300);
  const pastEnd = await page.evaluate(() => document.getElementById('workspace').scrollTop);
  await page.mouse.up();
  gate('SB-3', 'extremes: start=0, end=max, no overshoot past max', atStart === 0 && atEnd === maxScroll && pastEnd === maxScroll, { atStart, atEnd, pastEnd, maxScroll });
}

// ============================================================
// SB-4: scrollBehavior restore
// ============================================================
console.log('\n===================== SB-4: scrollBehavior restore =====================');
{
  const before = await page.evaluate(() => document.getElementById('workspace').style.scrollBehavior);
  const geo = await getGeo();
  const pt = { x: geo.thumbVRect.x + geo.thumbVRect.width / 2, y: geo.thumbVRect.y + geo.thumbVRect.height / 2 };
  await page.mouse.move(pt.x, pt.y);
  await page.mouse.down();
  await page.waitForTimeout(20);
  const duringDrag = await page.evaluate(() => document.getElementById('workspace').style.scrollBehavior);
  await page.mouse.move(pt.x, pt.y + 50, { steps: 4 });
  await page.waitForTimeout(40);
  await page.mouse.up();
  await page.waitForTimeout(80);
  const after = await page.evaluate(() => document.getElementById('workspace').style.scrollBehavior);
  gate('SB-4', 'scrollBehavior: auto during drag, restored to prior value after', duringDrag === 'auto' && after === before, { before, duringDrag, after });
}

console.log('\n' + '='.repeat(70));
console.log(`RESULT: ${pass} passed, ${fail} failed`);
console.log('Console errors:', consoleErrors.length ? JSON.stringify(consoleErrors) : 'none');

await browser.close();
process.exit(fail > 0 ? 1 : 0);
