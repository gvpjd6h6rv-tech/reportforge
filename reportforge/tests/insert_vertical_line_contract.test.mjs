/**
 * RF: "Insertar > Línea" only ever created a horizontal line — there was
 * no vertical line option in the menu or toolbar, even though the data
 * model (engines/DocumentState.js: lineDir defaults to 'h') and BOTH
 * export/preview renderers (reportforge/core/render/engines/
 * element_renderers.py, html_engine.py) already supported lineDir==='v'.
 * Design mode's own renderer (engines/CanvasLayoutElements.js:_buildLine)
 * also never checked lineDir, so even a programmatically-created vertical
 * line rendered horizontal in Design — a parity gap of its own, fixed
 * alongside adding the menu/toolbar entry point.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startRuntimeServer, launchRuntimePage, enterPreview } from './runtime_harness.mjs';

async function drawVerticalLine(page) {
  await page.click('[data-menu="insertar"]');
  await page.waitForTimeout(150);
  await page.click('#dd-insertar [data-action="insert-line-v"]');
  await page.waitForTimeout(150);
  const canvas = await page.locator('#canvas-layer').boundingBox();
  const startX = canvas.x + 300, startY = canvas.y + 300;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX, startY + 80, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(200);
  return page.evaluate(() => [...DS.selection][0]);
}

test('LIVE: Insertar > Línea vertical creates a model element with lineDir "v"', { timeout: 30000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page } = await launchRuntimePage(server.baseUrl);
  try {
    await page.waitForFunction(() => typeof DS !== 'undefined' && Array.isArray(DS.elements) && DS.elements.length > 0);
    await page.waitForTimeout(800);

    const id = await drawVerticalLine(page);
    const model = await page.evaluate((id) => {
      const el = DS.getElementById(id);
      return { type: el.type, lineDir: el.lineDir, w: el.w, h: el.h };
    }, id);
    assert.equal(model.type, 'line', 'must create a line element');
    assert.equal(model.lineDir, 'v', 'must be tagged vertical');
    assert.ok(model.h > model.w, 'vertical line must be taller than it is wide');
  } finally {
    await browser.close();
    await server.stop();
  }
});

test('LIVE: a vertical line renders as a vertical stroke in Design mode (not horizontal)', { timeout: 30000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page } = await launchRuntimePage(server.baseUrl);
  try {
    await page.waitForFunction(() => typeof DS !== 'undefined' && Array.isArray(DS.elements) && DS.elements.length > 0);
    await page.waitForTimeout(800);

    const id = await drawVerticalLine(page);
    const svg = await page.evaluate((id) => {
      const div = document.querySelector(`.cr-element[data-id="${id}"]`);
      const line = div.querySelector('line');
      return { x1: Number(line.getAttribute('x1')), x2: Number(line.getAttribute('x2')), y1: Number(line.getAttribute('y1')), y2: Number(line.getAttribute('y2')) };
    }, id);
    assert.equal(svg.x1, svg.x2, 'a vertical line must have the same x at both endpoints (no horizontal travel)');
    assert.notEqual(svg.y1, svg.y2, 'a vertical line must travel along y');
  } finally {
    await browser.close();
    await server.stop();
  }
});

test('LIVE: a vertical line renders as a vertical border-left stroke in Preview (design/preview parity)', { timeout: 30000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page } = await launchRuntimePage(server.baseUrl);
  try {
    await page.waitForFunction(() => typeof DS !== 'undefined' && Array.isArray(DS.elements) && DS.elements.length > 0);
    await page.waitForTimeout(800);

    await drawVerticalLine(page);
    await enterPreview(page);
    await page.waitForTimeout(400);

    const found = await page.evaluate(() => {
      const renderLayer = document.querySelector('.preview-render-layer');
      const el = [...renderLayer.querySelectorAll('div')].find((d) => (d.getAttribute('style') || '').includes('border-left'));
      if (!el) return null;
      const cs = getComputedStyle(el);
      return { width: cs.width, height: cs.height, borderLeftWidth: cs.borderLeftWidth };
    });
    assert.ok(found, 'Preview must render the line via border-left (vertical), not border-top');
    assert.ok(parseFloat(found.height) > parseFloat(found.width), 'Preview vertical line must be taller than wide');
  } finally {
    await browser.close();
    await server.stop();
  }
});
