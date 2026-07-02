'use strict';
/**
 * BUG NEW 5 audit — Parte A (read-only, no fixes).
 * Per user refinement: BUG NEW 5 is NOT a universal repro -- it is
 * zoom-dependent, appearing when the document/canvas visually contacts or
 * overlaps the synthetic scrollbar (most likely at 400%). This script:
 *  - repeats every point (A1..A7) at 100/200/400% explicitly, reporting
 *    PASS/REPRO per zoom instead of one aggregate verdict (Gates SC-1/2/3),
 *  - adds Gate SC-4 (force document/scrollbar visual contact),
 *  - adds Gate SC-5 (elementsFromPoint raw stack over the scrollbar,
 *    checking whether scrollbar AND a .cr-element/.pv-el both appear),
 *  - adds Gate SC-6 (bounds diagnostic: is point inside scrollbar rect AND
 *    inside document rect at the same time?).
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

// Grow page-footer tall AND densely populate it with fields every ~30px
// across its FULL width, so that no matter where the scrollbar thumb lands
// on screen (which varies by zoom/scroll), there is guaranteed to be a
// .cr-element/.pv-el directly underneath it -- otherwise a "PASS" at some
// zoom could just mean my 2 sparse probe fields happened not to be there,
// not that the guard actually worked.
await page.evaluate(() => {
  const sec = DS.sections.find(s => s.id === 's-pf');
  sec.height = Math.max(sec.height, 900);
  const secDiv = document.querySelector('.cr-section[data-section-id="s-pf"]');
  if (secDiv) secDiv.style.height = sec.height + 'px';
  const made = [];
  for (let y = 4; y < sec.height - 16; y += 26) {
    for (let x = 4; x < 740; x += 130) {
      made.push(mkEl('field', 's-pf', x, y, 120, 16, { fieldPath: 'x.y', content: '' }));
    }
  }
  DS.setElements([...DS.elements, ...made], 'scrollbar-audit');
  _canonicalCanvasWriter().renderAll();
});
await page.waitForTimeout(200);

async function getGeometry() {
  return page.evaluate(() => {
    const ws = document.getElementById('workspace');
    const trackV = document.querySelector('.rf-scrollbar-track--v');
    const trackH = document.querySelector('.rf-scrollbar-track--h');
    const thumbV = document.querySelector('.rf-scrollbar-thumb--v');
    const thumbH = document.querySelector('.rf-scrollbar-thumb--h');
    const canvasLayer = document.getElementById(DS.previewMode ? 'preview-content' : 'canvas-layer');
    const trackVVisible = trackV && getComputedStyle(trackV).display !== 'none';
    const trackHVisible = trackH && getComputedStyle(trackH).display !== 'none';
    return {
      ws: ws.getBoundingClientRect(),
      trackV: trackVVisible ? trackV.getBoundingClientRect() : null,
      trackH: trackHVisible ? trackH.getBoundingClientRect() : null,
      thumbV: trackVVisible && thumbV ? thumbV.getBoundingClientRect() : null,
      thumbH: trackHVisible && thumbH ? thumbH.getBoundingClientRect() : null,
      canvasLayer: canvasLayer ? canvasLayer.getBoundingClientRect() : null,
      scrollTop: ws.scrollTop, scrollLeft: ws.scrollLeft,
      scrollHeight: ws.scrollHeight, scrollWidth: ws.scrollWidth,
      clientHeight: ws.clientHeight, clientWidth: ws.clientWidth,
      hasV: trackVVisible, hasH: trackHVisible,
    };
  });
}

function pointInRect(pt, rect) {
  if (!pt || !rect) return null;
  return pt.x >= rect.x && pt.x <= rect.x + rect.width && pt.y >= rect.y && pt.y <= rect.y + rect.height;
}

async function captureAtPoint(mode, zoomPct, label, pt, g) {
  await page.mouse.move(pt.x, pt.y);
  await page.waitForTimeout(150);

  const diag = await page.evaluate(({ x, y, isPreview }) => {
    const t = document.elementFromPoint(x, y);
    const stack = document.elementsFromPoint(x, y).map(el => ({
      tag: el.tagName,
      id: el.id || null,
      cls: (el.className && el.className.toString) ? el.className.toString().slice(0, 90) : null,
    }));
    function belongsTo(el, sel) { return !!(el && el.closest && el.closest(sel)); }
    const hoverClass = document.querySelector('.rf-hit-hover');
    const previewBox = document.querySelector('.preview-hover-box');
    return {
      targetTag: t ? t.tagName : null,
      targetId: t ? t.id || null : null,
      targetClass: t ? (t.className && t.className.toString ? t.className.toString().slice(0, 90) : null) : null,
      elementsFromPointStack: stack,
      stackHasScrollbar: stack.some(s => s.cls && (s.cls.includes('rf-scrollbar-track') || s.cls.includes('rf-scrollbar-thumb'))),
      stackHasReportEl: stack.some(s => s.cls && (s.cls.includes('cr-element') || s.cls.includes('pv-el'))),
      isScrollbar: belongsTo(t, '.rf-scrollbar-track, .rf-scrollbar-thumb'),
      isReportCanvas: belongsTo(t, '#canvas-layer, #preview-content'),
      designHoverId: hoverClass ? (hoverClass.dataset.id || null) : null,
      previewHoverBoxVisible: !!previewBox,
    };
  }, { x: pt.x, y: pt.y, isPreview: mode === 'Preview' });

  const selBefore = await page.evaluate(() => [...DS.selection]);
  await page.mouse.down();
  await page.waitForTimeout(60);
  await page.mouse.up();
  await page.waitForTimeout(120);
  const selAfter = await page.evaluate(() => [...DS.selection]);

  const inScrollbarV = pointInRect(pt, g.trackV);
  const inScrollbarH = pointInRect(pt, g.trackH);
  const inDocument = pointInRect(pt, g.canvasLayer);
  const hoverBleed = (mode === 'Design' ? !!diag.designHoverId : diag.previewHoverBoxVisible)
    && (inScrollbarV || inScrollbarH);

  return {
    mode, zoomPct, label, point: pt,
    boundsCheck: { inScrollbarV, inScrollbarH, inDocument, bothTrue: (inScrollbarV || inScrollbarH) && inDocument },
    target: { tag: diag.targetTag, id: diag.targetId, cls: diag.targetClass, isScrollbar: diag.isScrollbar, isReportCanvas: diag.isReportCanvas },
    elementsFromPointStack: diag.elementsFromPointStack,
    stackHasScrollbar: diag.stackHasScrollbar,
    stackHasReportEl: diag.stackHasReportEl,
    hover: { designHoverId: diag.designHoverId, previewHoverBoxVisible: diag.previewHoverBoxVisible },
    selection: { before: selBefore, after: selAfter, changed: JSON.stringify(selBefore) !== JSON.stringify(selAfter) },
    verdict: hoverBleed ? 'REPRO (hover bleed over scrollbar)' : 'PASS (no hover bleed)',
  };
}

const allResults = [];
for (const mode of ['Design', 'Preview']) {
  if (mode === 'Preview') { await page.locator('#tab-preview').click(); await page.waitForTimeout(1000); }
  for (const zoomPct of [100, 200, 400]) {
    await page.evaluate((z) => { if (typeof DesignZoomEngine !== 'undefined') DesignZoomEngine.set(z / 100); else DS.zoom = z / 100; }, zoomPct);
    await page.waitForTimeout(300);
    const g = await getGeometry();

    const points = {};
    if (g.canvasLayer) points.A1_document_center = { x: g.canvasLayer.x + Math.min(60, g.canvasLayer.width / 2), y: g.canvasLayer.y + 30 };
    if (g.canvasLayer) points.A2_document_edge = { x: g.canvasLayer.x + g.canvasLayer.width - 2, y: g.canvasLayer.y + 30 };
    if (g.thumbV) points.A3_scrollbar_v_thumb = { x: g.thumbV.x + g.thumbV.width / 2, y: g.thumbV.y + g.thumbV.height / 2 };
    else if (g.trackV) points.A3_scrollbar_v_track = { x: g.trackV.x + g.trackV.width / 2, y: g.trackV.y + 40 };
    if (g.thumbH) points.A4_scrollbar_h_thumb = { x: g.thumbH.x + g.thumbH.width / 2, y: g.thumbH.y + g.thumbH.height / 2 };
    else if (g.trackH) points.A4_scrollbar_h_track = { x: g.trackH.x + 40, y: g.trackH.y + g.trackH.height / 2 };
    points.A5_gray_area = { x: g.ws.x + g.ws.width - 3, y: g.ws.y + g.ws.height - 3 };

    // Gate SC-4: does the document/canvas visually contact the scrollbar at
    // this zoom? -- compare canvasLayer's right/bottom edge against the
    // scrollbar track's left/top edge.
    const contact = {
      vContact: g.canvasLayer && g.trackV ? (g.canvasLayer.x + g.canvasLayer.width) >= g.trackV.x - 2 : null,
      hContact: g.canvasLayer && g.trackH ? (g.canvasLayer.y + g.canvasLayer.height) >= g.trackH.y - 2 : null,
      canvasRect: g.canvasLayer, trackVRect: g.trackV, trackHRect: g.trackH,
    };

    const zoomResults = [];
    for (const [label, pt] of Object.entries(points)) {
      const r = await captureAtPoint(mode, zoomPct, label, pt, g);
      zoomResults.push(r);
    }
    allResults.push({ mode, zoomPct, contact, points: zoomResults });
  }
}
await page.locator('#tab-design').click().catch(() => {});

console.log(JSON.stringify(allResults, null, 2));
console.error('Console errors:', consoleErrors.length ? JSON.stringify(consoleErrors) : 'none');
await browser.close();
