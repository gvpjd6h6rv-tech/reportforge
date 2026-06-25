/**
 * RF-CR-SCROLLBAR-PARITY-1
 *
 * CR's native scrollbars are thick (~17px) and clearly visible in both
 * Design and Preview. A real-window X11 capture (not a headless
 * screenshot — those never paint native overlay scrollbars at all,
 * regardless of engine) showed Chromium's ::-webkit-scrollbar styling
 * does reach ~17px as intended, but Firefox's `scrollbar-width` only
 * accepts auto|thin|none — no numeric control — and measured ~1px on
 * the same desktop. SyntheticScrollbarEngine.js replaces BOTH engines'
 * native scrollbar with one identical custom overlay, so there is a
 * single visual source instead of two inconsistent native ones.
 *
 * This test never accepts "the DOM node exists" as proof — it samples
 * real screenshot pixels for the thumb's declared color, in both
 * Chromium and real Firefox, in both Design and Preview.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startRuntimeServer, launchRuntimePage } from './runtime_harness.mjs';

async function openAndZoom(page) {
  await page.waitForFunction(() => typeof DS !== 'undefined' && DS.elements.length > 0);
  await page.waitForTimeout(600);
  await page.evaluate(() => { delete window.showOpenFilePicker; });
  const fc = page.waitForEvent('filechooser');
  await page.locator('button.tb-icon[data-action="open"]').click();
  await (await fc).setFiles('/home/mimi/Escritorio/sap_b1_linux/reportforge_layouts/factura_fv1.json');
  await page.waitForTimeout(500);
  await page.evaluate(() => { if (typeof DesignZoomEngine !== 'undefined') DesignZoomEngine.set(4); });
  await page.waitForTimeout(400);
}

async function thumbPixelColor(page, selector) {
  const box = await page.locator(selector).boundingBox();
  if (!box || box.width < 1 || box.height < 1) return null;
  const cx = Math.round(box.x + box.width / 2), cy = Math.round(box.y + box.height / 2);
  const buf = await page.screenshot({ clip: { x: cx - 1, y: cy - 1, width: 2, height: 2 } });
  return page.evaluate((b64) => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width; canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      resolve([d[0], d[1], d[2]]);
    };
    img.src = 'data:image/png;base64,' + b64;
  }), buf.toString('base64'));
}

for (const browserName of ['chromium', 'firefox']) {
  test(`LIVE (${browserName}): native scrollbar hidden, synthetic thumb painted at real CR-style color/thickness in Design`, { timeout: 60000 }, async () => {
    const server = await startRuntimeServer();
    const { browser, page } = await launchRuntimePage(server.baseUrl, { browserName });
    try {
      await openAndZoom(page);

      const native = await page.evaluate(() => {
        const ws = document.getElementById('workspace');
        return { reservedWidth: ws.offsetWidth - ws.clientWidth, scrollbarWidthCss: getComputedStyle(ws).scrollbarWidth };
      });
      assert.equal(native.reservedWidth, 0, 'native scrollbar must reserve 0 layout space (fully hidden) in every browser');

      const trackBox = await page.locator('.rf-scrollbar-track--v').boundingBox();
      assert.ok(trackBox, 'vertical synthetic track must exist and be visible when content overflows');
      assert.ok(Math.abs(trackBox.width - 17) <= 1, `synthetic vertical track must be ~17px thick (CR parity), got ${trackBox.width}`);

      const rgb = await thumbPixelColor(page, '.rf-scrollbar-thumb--v');
      assert.ok(rgb, 'must be able to sample a real pixel from the thumb');
      const target = [172, 168, 153]; // --rf-border-mid
      const close = rgb.every((c, i) => Math.abs(c - target[i]) <= 12);
      assert.ok(close, `thumb pixel color must match the declared CR-style color, got rgb(${rgb})`);
    } finally {
      await browser.close();
      await server.stop();
    }
  });

  test(`LIVE (${browserName}): dragging the synthetic thumb actually scrolls #workspace`, { timeout: 60000 }, async () => {
    const server = await startRuntimeServer();
    const { browser, page } = await launchRuntimePage(server.baseUrl, { browserName });
    try {
      await openAndZoom(page);
      const before = await page.evaluate(() => document.getElementById('workspace').scrollTop);
      const thumbBox = await page.locator('.rf-scrollbar-thumb--v').boundingBox();
      const cx = thumbBox.x + thumbBox.width / 2, cy = thumbBox.y + thumbBox.height / 2;
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      await page.waitForTimeout(30);
      await page.mouse.move(cx, cy + 150, { steps: 10 });
      await page.waitForTimeout(30);
      await page.mouse.up();
      const after = await page.evaluate(() => document.getElementById('workspace').scrollTop);
      assert.equal(before, 0, 'fixture assumption: starts unscrolled');
      assert.ok(after > before, `dragging the thumb down must increase scrollTop, got before=${before} after=${after}`);
    } finally {
      await browser.close();
      await server.stop();
    }
  });

  test(`LIVE (${browserName}): clicking the track below the thumb page-scrolls down`, { timeout: 60000 }, async () => {
    const server = await startRuntimeServer();
    const { browser, page } = await launchRuntimePage(server.baseUrl, { browserName });
    try {
      await openAndZoom(page);
      const before = await page.evaluate(() => document.getElementById('workspace').scrollTop);
      const trackBox = await page.locator('.rf-scrollbar-track--v').boundingBox();
      await page.mouse.click(trackBox.x + trackBox.width / 2, trackBox.y + trackBox.height - 10);
      await page.waitForTimeout(100);
      const after = await page.evaluate(() => document.getElementById('workspace').scrollTop);
      assert.ok(after > before, `clicking the track below the thumb must page-scroll down, got before=${before} after=${after}`);
    } finally {
      await browser.close();
      await server.stop();
    }
  });

  test(`LIVE (${browserName}): synthetic scrollbar also renders in Preview mode (same #workspace, real pixel)`, { timeout: 60000 }, async () => {
    const server = await startRuntimeServer();
    const { browser, page } = await launchRuntimePage(server.baseUrl, { browserName });
    try {
      await openAndZoom(page);
      await page.click('#tab-preview');
      await page.waitForTimeout(700);

      const trackBox = await page.locator('.rf-scrollbar-track--v').boundingBox();
      assert.ok(trackBox, 'vertical synthetic track must exist in Preview when content overflows');
      assert.ok(Math.abs(trackBox.width - 17) <= 1, `Preview synthetic track must also be ~17px thick, got ${trackBox.width}`);

      const rgb = await thumbPixelColor(page, '.rf-scrollbar-thumb--v');
      assert.ok(rgb, 'must be able to sample a real pixel from the Preview-mode thumb');
      const target = [172, 168, 153];
      const close = rgb.every((c, i) => Math.abs(c - target[i]) <= 12);
      assert.ok(close, `Preview thumb pixel color must match Design's, got rgb(${rgb})`);
    } finally {
      await browser.close();
      await server.stop();
    }
  });
}
