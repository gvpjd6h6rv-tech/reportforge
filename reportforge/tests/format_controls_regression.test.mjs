import test from 'node:test';
import assert from 'node:assert/strict';
import {
  startRuntimeServer,
  launchRuntimePage,
  selectSingle,
  enterPreview,
  exitPreview,
  assertNoConsoleErrors,
} from './runtime_harness.mjs';

async function reloadRuntime(page, baseUrl) {
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => typeof DS !== 'undefined' && Array.isArray(DS.elements) && DS.elements.length > 0);
  await page.waitForTimeout(800);
}

async function getFormatState(page) {
  return page.evaluate(() => {
    const id = [...DS.selection][0];
    const el = id ? DS.getElementById(id) : null;
    const previewEl = id ? document.querySelector(`#preview-content .pv-el[data-origin-id="${id}"]`) : null;
    return {
      selection: [...DS.selection],
      model: el ? {
        id: el.id,
        bold: !!el.bold,
        italic: !!el.italic,
        underline: !!el.underline,
        fontSize: el.fontSize,
      } : null,
      toolbar: {
        bold: document.getElementById('btn-bold')?.classList.contains('active') || false,
        italic: document.getElementById('btn-italic')?.classList.contains('active') || false,
        underline: document.getElementById('btn-underline')?.classList.contains('active') || false,
        fontSize: document.getElementById('tb-font-size')?.value || null,
      },
      preview: previewEl ? {
        fontWeight: getComputedStyle(previewEl).fontWeight,
        fontStyle: getComputedStyle(previewEl).fontStyle,
        textDecoration: getComputedStyle(previewEl).textDecorationLine,
      } : null,
    };
  });
}

test('format controls browser regression suite', { timeout: 120000 }, async (t) => {
  const server = await startRuntimeServer();
  const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl);

  try {
    await t.test('FORMAT-CONTROLS-001 bold desde toolbar', async () => {
      await reloadRuntime(page, server.baseUrl);
      await selectSingle(page, 1);
      let state = await getFormatState(page);
      assert.equal(state.model.id, 'e102');
      assert.equal(state.model.bold, false);
      assert.equal(state.toolbar.bold, false);

      await page.click('#btn-bold');
      await page.waitForTimeout(120);
      state = await getFormatState(page);
      assert.equal(state.model.bold, true);
      assert.equal(state.toolbar.bold, true);

      await page.click('#btn-bold');
      await page.waitForTimeout(120);
      state = await getFormatState(page);
      assert.equal(state.model.bold, false);
      assert.equal(state.toolbar.bold, false);
    });

    await t.test('FORMAT-CONTROLS-002 italic y underline', async () => {
      await reloadRuntime(page, server.baseUrl);
      await selectSingle(page, 1);

      await page.click('#btn-italic');
      await page.waitForTimeout(120);
      let state = await getFormatState(page);
      assert.equal(state.model.italic, true);
      assert.equal(state.toolbar.italic, true);

      await page.click('#btn-underline');
      await page.waitForTimeout(120);
      state = await getFormatState(page);
      assert.equal(state.model.underline, true);
      assert.equal(state.toolbar.underline, true);
    });

    await t.test('FORMAT-CONTROLS-003 font-size baseline', async () => {
      await reloadRuntime(page, server.baseUrl);
      await selectSingle(page, 1);
      await page.selectOption('#tb-font-size', '12');
      await page.waitForTimeout(120);
      const state = await getFormatState(page);
      assert.equal(state.model.fontSize, 12);
      assert.equal(state.toolbar.fontSize, '12');
    });

    await t.test('FORMAT-CONTROLS-004 secuencia select -> bold -> font-size -> rerender', async () => {
      await reloadRuntime(page, server.baseUrl);
      await selectSingle(page, 1);
      await page.click('#btn-bold');
      await page.waitForTimeout(120);
      await page.selectOption('#tb-font-size', '12');
      await page.waitForTimeout(120);
      await page.evaluate(() => _canonicalCanvasWriter().renderAll());
      await page.waitForTimeout(180);
      const state = await getFormatState(page);
      assert.equal(state.model.bold, true);
      assert.equal(state.model.fontSize, 12);
      assert.equal(state.toolbar.bold, true);
      assert.equal(state.toolbar.fontSize, '12');
    });

    await t.test('FORMAT-CONTROLS-005 design preview transition', async () => {
      await reloadRuntime(page, server.baseUrl);
      await selectSingle(page, 1);
      await page.click('#btn-bold');
      await page.waitForTimeout(120);

      await enterPreview(page);
      let state = await getFormatState(page);
      assert.equal(state.model.bold, true);
      assert.ok(state.preview, 'preview element missing');
      assert.ok(
        state.preview.fontWeight === '700' || state.preview.fontWeight === 'bold',
        `unexpected preview fontWeight: ${state.preview.fontWeight}`,
      );

      await exitPreview(page);
      state = await getFormatState(page);
      assert.equal(state.model.bold, true);
      assert.equal(state.toolbar.bold, true);
    });

    await assertNoConsoleErrors(consoleErrors, 'format controls regression');
  } finally {
    await browser.close();
    await server.stop();
  }
});
