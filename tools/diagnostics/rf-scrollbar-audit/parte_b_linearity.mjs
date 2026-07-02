'use strict';
/**
 * BUG NEW 6 audit — Parte B (read-only, no fixes).
 * Drags each scrollbar thumb continuously from scroll=0, sampling at
 * 0/10/25/50/75/90/100% of maxThumbTravel, and compares ratioThumb (mouse
 * position along the track, as a fraction of maxThumbTravel) against
 * ratioScroll (workspace.scrollTop|Left / maxScroll). A linear scrollbar
 * should keep these two ratios within a small epsilon at every sample.
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

// Grow content so both axes definitely have scroll range at every zoom.
await page.evaluate(() => {
  const sec = DS.sections.find(s => s.id === 's-pf');
  sec.height = Math.max(sec.height, 900);
  const secDiv = document.querySelector('.cr-section[data-section-id="s-pf"]');
  if (secDiv) secDiv.style.height = sec.height + 'px';
  const made = [];
  for (let y = 4; y < sec.height - 16; y += 100) made.push(mkEl('field', 's-pf', 4, y, 120, 16, { fieldPath: 'x.y', content: '' }));
  made.push(mkEl('field', 's-pf', 700, 4, 120, 16, { fieldPath: 'x.y', content: '' }));
  DS.setElements([...DS.elements, ...made], 'scrollbar-audit-b');
  _canonicalCanvasWriter().renderAll();
});
await page.waitForTimeout(200);

async function getTrackThumb(axis) {
  return page.evaluate((axis) => {
    const ws = document.getElementById('workspace');
    const track = document.querySelector(`.rf-scrollbar-track--${axis}`);
    const thumb = document.querySelector(`.rf-scrollbar-thumb--${axis}`);
    const visible = track && getComputedStyle(track).display !== 'none';
    if (!visible) return { visible: false };
    const trackRect = track.getBoundingClientRect();
    const thumbRect = thumb.getBoundingClientRect();
    const trackLen = axis === 'v' ? trackRect.height : trackRect.width;
    const thumbLen = axis === 'v' ? thumbRect.height : thumbRect.width;
    const maxScroll = axis === 'v' ? (ws.scrollHeight - ws.clientHeight) : (ws.scrollWidth - ws.clientWidth);
    return {
      visible: true,
      trackRect, thumbRect, trackLen, thumbLen,
      maxThumbTravel: trackLen - thumbLen,
      maxScroll,
    };
  }, axis);
}

async function resetScroll() {
  await page.evaluate(() => { const ws = document.getElementById('workspace'); ws.scrollTop = 0; ws.scrollLeft = 0; });
  await page.waitForTimeout(150);
}

async function dragLinearityTest(mode, zoomPct, axis) {
  await resetScroll();
  const geo = await getTrackThumb(axis);
  if (!geo.visible || geo.maxScroll <= 0 || geo.maxThumbTravel <= 0) {
    return { mode, zoomPct, axis, skipped: true, reason: 'scrollbar not active at this zoom/mode', geo };
  }

  const thumbStartClient = axis === 'v'
    ? geo.thumbRect.y + geo.thumbRect.height / 2
    : geo.thumbRect.x + geo.thumbRect.width / 2;
  const crossAxisClient = axis === 'v'
    ? geo.thumbRect.x + geo.thumbRect.width / 2
    : geo.thumbRect.y + geo.thumbRect.height / 2;

  // Drag start: mousedown right on the thumb's current (scroll=0) position.
  if (axis === 'v') await page.mouse.move(crossAxisClient, thumbStartClient);
  else await page.mouse.move(thumbStartClient, crossAxisClient);
  await page.mouse.down();
  await page.waitForTimeout(40);

  const samples = [];
  const targets = [0, 10, 25, 50, 75, 90, 100];
  let prevScroll = -1;
  let monotonic = true;
  for (const pct of targets) {
    const travelPx = (pct / 100) * geo.maxThumbTravel;
    const pos = thumbStartClient + travelPx;
    if (axis === 'v') await page.mouse.move(crossAxisClient, pos, { steps: 8 });
    else await page.mouse.move(pos, crossAxisClient, { steps: 8 });
    await page.waitForTimeout(40);

    const state = await page.evaluate((axis) => {
      const ws = document.getElementById('workspace');
      const thumb = document.querySelector(`.rf-scrollbar-thumb--${axis}`);
      const style = getComputedStyle(thumb);
      return {
        scrollTop: ws.scrollTop, scrollLeft: ws.scrollLeft,
        thumbTransform: style.transform,
      };
    }, axis);
    const scrollPos = axis === 'v' ? state.scrollTop : state.scrollLeft;
    const ratioThumb = pct / 100;
    const ratioScroll = geo.maxScroll > 0 ? scrollPos / geo.maxScroll : 0;
    if (prevScroll >= 0 && scrollPos < prevScroll - 0.5) monotonic = false;
    prevScroll = scrollPos;
    samples.push({
      targetPct: pct, mouseDeltaPx: travelPx,
      scrollPos, ratioThumb, ratioScroll,
      diff: Math.abs(ratioThumb - ratioScroll),
      thumbTransform: state.thumbTransform,
    });
  }
  await page.mouse.up();
  await page.waitForTimeout(60);

  const maxDiff = Math.max(...samples.map(s => s.diff));
  return {
    mode, zoomPct, axis, skipped: false,
    geo: { trackLen: geo.trackLen, thumbLen: geo.thumbLen, maxThumbTravel: geo.maxThumbTravel, maxScroll: geo.maxScroll },
    samples, monotonic, maxDiff,
    verdict: (maxDiff < 0.05 && monotonic) ? 'PASS (linear, monotonic)' : 'REPRO (non-linear or non-monotonic)',
  };
}

const allResults = [];
for (const mode of ['Design', 'Preview']) {
  if (mode === 'Preview') { await page.locator('#tab-preview').click(); await page.waitForTimeout(1000); }
  for (const zoomPct of [100, 200, 400]) {
    await page.evaluate((z) => { if (typeof DesignZoomEngine !== 'undefined') DesignZoomEngine.set(z / 100); else DS.zoom = z / 100; }, zoomPct);
    await page.waitForTimeout(300);
    for (const axis of ['v', 'h']) {
      const r = await dragLinearityTest(mode, zoomPct, axis);
      allResults.push(r);
    }
  }
}
await page.locator('#tab-design').click().catch(() => {});

console.log(JSON.stringify(allResults, null, 2));
console.error('Console errors:', consoleErrors.length ? JSON.stringify(consoleErrors) : 'none');
await browser.close();
