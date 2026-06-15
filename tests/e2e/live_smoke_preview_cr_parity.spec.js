/**
 * LIVE SMOKE — ReportForge Preview CR parity.
 *
 * Corre contra la app REAL en http://127.0.0.1:8080/classic.
 * No usa mocks. Captura geometría forense de preview, hoja A4, viewport y reglas.
 *
 * Uso:
 *   RF_LIVE_URL="http://127.0.0.1:8080" \
 *   npx playwright test tests/e2e/live_smoke_preview_cr_parity.spec.js -c pw.rf-live.config.mjs --reporter=line
 */

import { test, expect } from '@playwright/test';

const A4_RATIO = Math.SQRT2;
const MAX_CENTER_DELTA_PX = Number(process.env.RF_PREVIEW_CENTER_TOLERANCE_PX || 12);
const MAX_RATIO_DELTA = Number(process.env.RF_PREVIEW_A4_RATIO_TOLERANCE || 0.03);
const MIN_WORKSPACE_WIDTH = Number(process.env.RF_PREVIEW_MIN_WORKSPACE_WIDTH || 1100);


async function collectPreviewGeometry(page, tag) {
  const geometry = await page.evaluate((label) => {
    const pick = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return { sel, found: false };
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        sel,
        found: true,
        left: +r.left.toFixed(2),
        top: +r.top.toFixed(2),
        width: +r.width.toFixed(2),
        height: +r.height.toFixed(2),
        right: +r.right.toFixed(2),
        bottom: +r.bottom.toFixed(2),
        position: cs.position,
        display: cs.display,
        overflow: cs.overflow,
        transform: cs.transform,
        marginLeft: cs.marginLeft,
        marginTop: cs.marginTop,
        paddingLeft: cs.paddingLeft,
        paddingTop: cs.paddingTop,
        backgroundColor: cs.backgroundColor,
      scrollTop: +(Number(el.scrollTop || 0).toFixed(2)),
      scrollLeft: +(Number(el.scrollLeft || 0).toFixed(2)),
      clientHeight: +(Number(el.clientHeight || 0).toFixed(2)),
      scrollHeight: +(Number(el.scrollHeight || 0).toFixed(2)),
      clientWidth: +(Number(el.clientWidth || 0).toFixed(2)),
      scrollWidth: +(Number(el.scrollWidth || 0).toFixed(2)),
      };
    };

    const workspace = pick('#workspace');
    const pageRect = pick('#preview-content .preview-render-layer .rpt-page');
    const expectedPageLeft = workspace.found && pageRect.found
      ? workspace.left + ((workspace.width - pageRect.width) / 2)
      : null;

    return {
      tag: label,
      meta: {
        href: location.href,
        DS_zoom: window.DS?.zoom,
        DS_previewZoom: window.DS?.previewZoom,
        previewMode: window.DS?.previewMode,
        CFG_PAGE_W: window.CFG?.PAGE_W,
        CFG_RULER_W: window.CFG?.RULER_W,
        CFG_RULER_H: window.CFG?.RULER_H,
        devicePixelRatio: window.devicePixelRatio,
      },
      rects: {
        workspace,
        canvasLayer: pick('#canvas-layer'),
        previewLayer: pick('#preview-layer'),
        previewContent: pick('#preview-content'),
        renderLayer: pick('#preview-content .preview-render-layer'),
        rptPage: pageRect,
        hitLayer: pick('#preview-content .preview-hit-layer'),
        rulerH: pick('#ruler-h'),
        rulerV: pick('#ruler-v'),
      },
      derived: {
        expectedPageLeft: expectedPageLeft === null ? null : +expectedPageLeft.toFixed(2),
        centerDeltaPx: expectedPageLeft === null ? null : +(pageRect.left - expectedPageLeft).toFixed(2),
        pageRatio: pageRect.found ? +(pageRect.height / pageRect.width).toFixed(4) : null,
      },
    };
  }, tag);

  console.log(`RF-PREVIEW-GEOMETRY[${tag}]`, JSON.stringify(geometry, null, 2));
  return geometry;
}

async function enterPreview(page) {
  await page.goto('/classic', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.DS && !!window.PreviewEngineMode, null, { timeout: 30000 });

  await page.evaluate(() => {
    const previewTab =
      document.getElementById('tab-preview') ||
      Array.from(document.querySelectorAll('button, a, [role="tab"], .tab'))
        .find((el) => /preview|vista previa/i.test(String(el.textContent || '')));

    if (previewTab) previewTab.click();
    else window.PreviewEngineMode?.show?.();
  });

  await page.waitForFunction(() => window.DS?.previewMode === true, null, { timeout: 30000 });
  await page.waitForSelector('#preview-content .preview-render-layer .rpt-page', { timeout: 30000 });
  await page.waitForTimeout(500);
}

test('LIVE: Preview CR parity geometry at 100%', async ({ page }) => {
  test.setTimeout(90000);

  const browserErrors = [];
  const httpErrors = [];

  page.on('pageerror', (err) => browserErrors.push(`PAGEERROR: ${err.message}`));

  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text().slice(0, 300);
    const isGenericResource404 = /Failed to load resource: the server responded with a status of 404/i.test(text);
    if (!isGenericResource404) browserErrors.push(`console.error: ${text}`);
  });

  page.on('response', (response) => {
    const status = response.status();
    if (status < 400) return;

    const url = response.url();
    const isBenignFavicon404 = status === 404 && /\/favicon\.ico(?:[?#].*)?$/.test(url);
    if (!isBenignFavicon404) httpErrors.push(`${status}: ${url}`);
  });

  await enterPreview(page);

  await page.evaluate(() => {
    if (window.PreviewZoomEngine?.set) window.PreviewZoomEngine.set(1);
    else if (window.DS?.setZoomPreview) window.DS.setZoomPreview(1, 'live-smoke-preview-cr-parity');
    else if (window.DS) window.DS.zoom = 1;
  });

  await page.waitForTimeout(800);

  const g = await collectPreviewGeometry(page, 'preview-100');

  expect(g.meta.previewMode, 'Preview mode must be active').toBe(true);
  expect(g.meta.DS_zoom, 'Preview zoom must be 100%').toBe(1);

  expect(g.rects.workspace.found, '#workspace must exist').toBe(true);
  expect(
    g.rects.workspace.width,
    `live smoke must run with a wide CR-like workspace. Actual=${g.rects.workspace.width}`
  ).toBeGreaterThanOrEqual(MIN_WORKSPACE_WIDTH);
  expect(g.rects.previewContent.found, '#preview-content must exist').toBe(true);
  expect(g.rects.renderLayer.found, '.preview-render-layer must exist').toBe(true);
  expect(g.rects.rptPage.found, '.rpt-page must exist').toBe(true);

  expect(g.rects.rptPage.width, 'A4 page width must be positive').toBeGreaterThan(300);
  expect(g.rects.rptPage.height, 'A4 page height must be positive').toBeGreaterThan(g.rects.rptPage.width);

  expect(
    Math.abs(g.derived.pageRatio - A4_RATIO),
    `A4 ratio must be close to sqrt(2). Actual=${g.derived.pageRatio}`
  ).toBeLessThanOrEqual(MAX_RATIO_DELTA);

  expect(
    Math.abs(g.derived.centerDeltaPx),
    `A4 page must be horizontally centered in workspace. Delta=${g.derived.centerDeltaPx}px`
  ).toBeLessThanOrEqual(MAX_CENTER_DELTA_PX);

  expect(
    g.rects.previewLayer.height,
    `preview stage must be at least as tall as the A4 page. stage=${g.rects.previewLayer.height} page=${g.rects.rptPage.height}`
  ).toBeGreaterThanOrEqual(g.rects.rptPage.height);

  expect(
    g.rects.canvasLayer.height,
    `canvas stage must be at least as tall as the A4 page. stage=${g.rects.canvasLayer.height} page=${g.rects.rptPage.height}`
  ).toBeGreaterThanOrEqual(g.rects.rptPage.height);

  console.log('RF-PREVIEW-BROWSER-ERRORS', JSON.stringify(browserErrors));
  console.log('RF-PREVIEW-HTTP-ERRORS', JSON.stringify(httpErrors));

  expect.soft(browserErrors, 'browser errors during live smoke').toEqual([]);
  await page.evaluate(() => {
    const workspace = document.getElementById('workspace');
    if (!workspace) return;
    const maxScrollTop = Math.max(0, workspace.scrollHeight - workspace.clientHeight);
    workspace.scrollTop = Math.min(420, maxScrollTop);
    workspace.dispatchEvent(new Event('scroll', { bubbles: true }));
  });

  await page.waitForTimeout(500);

  const afterScroll = await collectPreviewGeometry(page, 'preview-100-after-manual-scroll-y');

  expect(
    afterScroll.rects.workspace.scrollTop,
    `manual scroll smoke must actually move workspace.scrollTop. Actual=${afterScroll.rects.workspace.scrollTop}`
  ).toBeGreaterThan(0);

  expect(
    Math.abs(afterScroll.derived.centerDeltaPx),
    `A4 page must remain horizontally centered after manual vertical scroll. Delta=${afterScroll.derived.centerDeltaPx}px`
  ).toBeLessThanOrEqual(MAX_CENTER_DELTA_PX);

  expect(
    Math.abs(afterScroll.derived.pageRatio - A4_RATIO),
    `A4 ratio must survive manual vertical scroll. Actual=${afterScroll.derived.pageRatio}`
  ).toBeLessThanOrEqual(MAX_RATIO_DELTA);

  expect(
    afterScroll.rects.previewLayer.height,
    `preview stage must still cover A4 after manual scroll. stage=${afterScroll.rects.previewLayer.height} page=${afterScroll.rects.rptPage.height}`
  ).toBeGreaterThanOrEqual(afterScroll.rects.rptPage.height);

  expect(
    afterScroll.rects.canvasLayer.height,
    `canvas stage must still cover A4 after manual scroll. stage=${afterScroll.rects.canvasLayer.height} page=${afterScroll.rects.rptPage.height}`
  ).toBeGreaterThanOrEqual(afterScroll.rects.rptPage.height);

  expect.soft(browserErrors, 'browser errors during live smoke after manual scroll').toEqual([]);
  expect.soft(httpErrors, 'HTTP errors during live smoke after manual scroll').toEqual([]);
});
