/**
 * TANDA 1 — 18 browser-based tests: format básico design + preview
 * Corre contra runtime real en /
 * Sin mocks. Sin tests sintéticos aislados.
 *
 * Cada test indica modo: design | preview | ambos
 * Cada test valida al menos uno de: DS/modelo, DOM, overlay/geom, estado visual
 */
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
  await page.waitForFunction(
    () => typeof DS !== 'undefined' && Array.isArray(DS.elements) && DS.elements.length > 0,
  );
  await page.waitForTimeout(800);
}

/**
 * Lee estado completo de formato del elemento seleccionado.
 * Incluye modelo DS, estado visual del toolbar y estilos DOM del elemento de diseño.
 */
async function getFullFormatState(page) {
  return page.evaluate(() => {
    const id = [...DS.selection][0];
    const el = id ? DS.getElementById(id) : null;
    const div = id ? document.querySelector(`.cr-element[data-id="${id}"]`) : null;
    const pvEl = id
      ? document.querySelector(`#preview-content .pv-el[data-origin-id="${id}"]`)
      : null;
    return {
      selection: [...DS.selection],
      model: el
        ? {
            id: el.id,
            bold: !!el.bold,
            italic: !!el.italic,
            underline: !!el.underline,
            fontSize: el.fontSize,
            fontFamily: el.fontFamily,
            align: el.align,
          }
        : null,
      toolbar: {
        bold: document.getElementById('btn-bold')?.classList.contains('active') || false,
        italic: document.getElementById('btn-italic')?.classList.contains('active') || false,
        underline: document.getElementById('btn-underline')?.classList.contains('active') || false,
        alignLeft: document.getElementById('btn-al')?.classList.contains('active') || false,
        alignCenter: document.getElementById('btn-ac')?.classList.contains('active') || false,
        alignRight: document.getElementById('btn-ar')?.classList.contains('active') || false,
        fontSize: document.getElementById('tb-font-size')?.value || null,
        fontFamily: document.getElementById('tb-font-name')?.value || null,
      },
      designDOM: div
        ? {
            fontWeight: div.style.fontWeight,
            fontStyle: div.style.fontStyle,
            textDecoration: div.style.textDecoration,
            fontSize: div.style.fontSize,
            fontFamily: div.style.fontFamily,
            textAlign: div.style.textAlign,
          }
        : null,
      preview: pvEl
        ? {
            fontWeight: getComputedStyle(pvEl).fontWeight,
            fontStyle: getComputedStyle(pvEl).fontStyle,
            textDecorationLine: getComputedStyle(pvEl).textDecorationLine,
            fontSize: getComputedStyle(pvEl).fontSize,
            fontFamily: getComputedStyle(pvEl).fontFamily,
            textAlign: getComputedStyle(pvEl).textAlign,
          }
        : null,
    };
  });
}

test('TANDA 1 — format básico design y preview', { timeout: 180000 }, async (t) => {
  const server = await startRuntimeServer();
  const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl);

  try {
    // ── T1-001 bold design ────────────────────────────────────────────
    // cubre: design | valida: DS/modelo + DOM (fontWeight)
    await t.test('FormatEngine.toggleFormat(bold) persiste en DS.model y DOM fontWeight [design]', async () => {
      await reloadRuntime(page, server.baseUrl);
      // e102 (índice 1) arranca con bold=false
      await selectSingle(page, 1);
      let state = await getFullFormatState(page);
      assert.equal(state.model.bold, false, 'pre: bold debe ser false');
      assert.equal(state.toolbar.bold, false, 'pre: toolbar bold debe estar inactivo');

      await page.click('#btn-bold');
      await page.waitForTimeout(150);
      state = await getFullFormatState(page);

      // DS/modelo
      assert.equal(state.model.bold, true, 'modelo: bold debe ser true');
      // estado visual toolbar
      assert.equal(state.toolbar.bold, true, 'toolbar: btn-bold debe tener clase active');
      // DOM elemento de diseño
      assert.equal(state.designDOM?.fontWeight, 'bold', 'DOM: fontWeight debe ser bold');
    });

    // ── T1-002 bold preview ───────────────────────────────────────────
    // cubre: preview | valida: DOM (fontWeight en pv-el)
    await t.test('FormatEngine.toggleFormat(bold) refleja fontWeight:bold en PreviewEngine pv-el [preview]', async () => {
      await reloadRuntime(page, server.baseUrl);
      await selectSingle(page, 1);
      await page.click('#btn-bold');
      await page.waitForTimeout(150);

      await enterPreview(page);
      const state = await getFullFormatState(page);

      assert.ok(state.preview, 'preview element debe existir');
      assert.ok(
        state.preview.fontWeight === '700' || state.preview.fontWeight === 'bold',
        `DOM pv-el: fontWeight esperado '700' o 'bold', obtenido '${state.preview.fontWeight}'`,
      );
      await exitPreview(page);
    });

    // ── T1-003 italic design ──────────────────────────────────────────
    // cubre: design | valida: DS/modelo + DOM (fontStyle)
    await t.test('FormatEngine.toggleFormat(italic) persiste en DS.model y activa btn-italic [design]', async () => {
      await reloadRuntime(page, server.baseUrl);
      await selectSingle(page, 1);
      let state = await getFullFormatState(page);
      assert.equal(state.model.italic, false, 'pre: italic debe ser false');

      await page.click('#btn-italic');
      await page.waitForTimeout(150);
      state = await getFullFormatState(page);

      // DS/modelo
      assert.equal(state.model.italic, true, 'modelo: italic debe ser true');
      // estado visual toolbar
      assert.equal(state.toolbar.italic, true, 'toolbar: btn-italic debe tener clase active');
      // DOM
      assert.equal(state.designDOM?.fontStyle, 'italic', 'DOM: fontStyle debe ser italic');
    });

    // ── T1-004 italic preview ─────────────────────────────────────────
    // cubre: preview | valida: DOM (fontStyle en pv-el)
    await t.test('FormatEngine.toggleFormat(italic) refleja fontStyle:italic en PreviewEngine pv-el [preview]', async () => {
      await reloadRuntime(page, server.baseUrl);
      await selectSingle(page, 1);
      await page.click('#btn-italic');
      await page.waitForTimeout(150);

      await enterPreview(page);
      const state = await getFullFormatState(page);

      assert.ok(state.preview, 'preview element debe existir');
      assert.equal(
        state.preview.fontStyle, 'italic',
        `DOM pv-el: fontStyle esperado 'italic', obtenido '${state.preview.fontStyle}'`,
      );
      await exitPreview(page);
    });

    // ── T1-005 underline design ───────────────────────────────────────
    // cubre: design | valida: DS/modelo + DOM (textDecoration)
    await t.test('FormatEngine.toggleFormat(underline) persiste en DS.model y aplica textDecoration [design]', async () => {
      await reloadRuntime(page, server.baseUrl);
      await selectSingle(page, 1);
      let state = await getFullFormatState(page);
      assert.equal(state.model.underline, false, 'pre: underline debe ser false');

      await page.click('#btn-underline');
      await page.waitForTimeout(150);
      state = await getFullFormatState(page);

      // DS/modelo
      assert.equal(state.model.underline, true, 'modelo: underline debe ser true');
      // estado visual toolbar
      assert.equal(state.toolbar.underline, true, 'toolbar: btn-underline debe tener clase active');
      // DOM
      assert.ok(
        state.designDOM?.textDecoration?.includes('underline'),
        `DOM: textDecoration debe incluir 'underline', obtenido '${state.designDOM?.textDecoration}'`,
      );
    });

    // ── T1-006 underline preview ──────────────────────────────────────
    // cubre: preview | valida: DOM (textDecoration en pv-el)
    await t.test('FormatEngine.toggleFormat(underline) refleja textDecoration:underline en PreviewEngine pv-el [preview]', async () => {
      await reloadRuntime(page, server.baseUrl);
      await selectSingle(page, 1);
      await page.click('#btn-underline');
      await page.waitForTimeout(150);

      await enterPreview(page);
      const state = await getFullFormatState(page);

      assert.ok(state.preview, 'preview element debe existir');
      assert.ok(
        state.preview.textDecorationLine?.includes('underline'),
        `DOM pv-el: textDecoration debe incluir 'underline', obtenido '${state.preview.textDecorationLine}'`,
      );
      await exitPreview(page);
    });

    // ── T1-007 font-size design ───────────────────────────────────────
    // cubre: design | valida: DS/modelo + estado visual toolbar + DOM
    await t.test('FormatEngine.applyFormat(fontSize) actualiza DS.model, toolbar y DOM fontSize [design]', async () => {
      await reloadRuntime(page, server.baseUrl);
      await selectSingle(page, 1);
      let state = await getFullFormatState(page);
      assert.equal(state.model.fontSize, 8, 'pre: fontSize debe ser 8');

      await page.selectOption('#tb-font-size', '14');
      await page.waitForTimeout(150);
      state = await getFullFormatState(page);

      // DS/modelo
      assert.equal(state.model.fontSize, 14, 'modelo: fontSize debe ser 14');
      // estado visual toolbar
      assert.equal(state.toolbar.fontSize, '14', 'toolbar: tb-font-size debe mostrar 14');
      // DOM: la fuente en px debe ser mayor que la original (8pt)
      const pxVal = parseFloat(state.designDOM?.fontSize || '0');
      assert.ok(pxVal > 14, `DOM: fontSize en px (${pxVal}px) debe ser > 14 (14pt ≈ 18.67px)`);
    });

    // ── T1-008 font-size preview ──────────────────────────────────────
    // cubre: preview | valida: DOM (fontSize en pv-el mayor que valor original)
    await t.test('FormatEngine.applyFormat(fontSize) refleja fontSize escalado en PreviewEngine pv-el [preview]', async () => {
      await reloadRuntime(page, server.baseUrl);
      await selectSingle(page, 1);
      await page.selectOption('#tb-font-size', '14');
      await page.waitForTimeout(150);

      await enterPreview(page);
      const state = await getFullFormatState(page);

      assert.ok(state.preview, 'preview element debe existir');
      const pxVal = parseFloat(state.preview.fontSize || '0');
      // 14pt @ 96dpi/72 = ~18.67px; original 8pt ≈ 10.67px — esperamos > 14px
      assert.ok(pxVal > 14, `DOM pv-el: fontSize (${pxVal}px) debe ser > 14px (refleja 14pt)`);
      await exitPreview(page);
    });

    // ── T1-009 font-family design ─────────────────────────────────────
    // cubre: design | valida: DS/modelo (fontFamily) + DOM (fontFamily en elemento)
    await t.test('FormatEngine.applyFormat(fontFamily) actualiza DS.model y DOM fontFamily [design]', async () => {
      await reloadRuntime(page, server.baseUrl);
      await selectSingle(page, 1);
      let state = await getFullFormatState(page);
      assert.equal(state.model.fontFamily, 'Arial', 'pre: fontFamily debe ser Arial');

      await page.selectOption('#tb-font-name', 'Courier New');
      await page.waitForTimeout(150);
      state = await getFullFormatState(page);

      // DS/modelo
      assert.equal(state.model.fontFamily, 'Courier New', 'modelo: fontFamily debe ser Courier New');
      // DOM elemento de diseño
      assert.ok(
        state.designDOM?.fontFamily?.includes('Courier'),
        `DOM: fontFamily debe incluir 'Courier', obtenido '${state.designDOM?.fontFamily}'`,
      );
    });

    // ── T1-010 font-family preview ────────────────────────────────────
    // cubre: preview | valida: DOM (fontFamily en pv-el)
    await t.test('FormatEngine.applyFormat(fontFamily) refleja fontFamily en PreviewEngine pv-el [preview]', async () => {
      await reloadRuntime(page, server.baseUrl);
      await selectSingle(page, 1);
      await page.selectOption('#tb-font-name', 'Courier New');
      await page.waitForTimeout(150);

      await enterPreview(page);
      const state = await getFullFormatState(page);

      assert.ok(state.preview, 'preview element debe existir');
      assert.ok(
        state.preview.fontFamily?.includes('Courier'),
        `DOM pv-el: fontFamily debe incluir 'Courier', obtenido '${state.preview.fontFamily}'`,
      );
      await exitPreview(page);
    });

    // ── T1-011 align-left design ──────────────────────────────────────
    // cubre: design | valida: DS/modelo (align) + estado visual (btn-al active) + DOM (textAlign)
    await t.test('FormatEngine.applyFormat(align:left) actualiza DS.model, btn-al activo y textAlign DOM [design]', async () => {
      await reloadRuntime(page, server.baseUrl);
      await selectSingle(page, 1);
      // Primero poner en center para poder verificar la vuelta a left
      await page.click('#btn-ac');
      await page.waitForTimeout(100);
      await page.click('#btn-al');
      await page.waitForTimeout(150);
      const state = await getFullFormatState(page);

      // DS/modelo
      assert.equal(state.model.align, 'left', 'modelo: align debe ser left');
      // estado visual toolbar
      assert.equal(state.toolbar.alignLeft, true, 'toolbar: btn-al debe tener clase active');
      assert.equal(state.toolbar.alignCenter, false, 'toolbar: btn-ac no debe estar active');
      // DOM
      assert.equal(state.designDOM?.textAlign, 'left', 'DOM: textAlign debe ser left');
    });

    // ── T1-012 align-center design ────────────────────────────────────
    // cubre: design | valida: DS/modelo (align) + estado visual (btn-ac active) + DOM (textAlign)
    await t.test('FormatEngine.applyFormat(align:center) actualiza DS.model, btn-ac activo y textAlign DOM [design]', async () => {
      await reloadRuntime(page, server.baseUrl);
      await selectSingle(page, 1);
      await page.click('#btn-ac');
      await page.waitForTimeout(150);
      const state = await getFullFormatState(page);

      assert.equal(state.model.align, 'center', 'modelo: align debe ser center');
      assert.equal(state.toolbar.alignCenter, true, 'toolbar: btn-ac debe tener clase active');
      assert.equal(state.toolbar.alignLeft, false, 'toolbar: btn-al no debe estar active');
      assert.equal(state.designDOM?.textAlign, 'center', 'DOM: textAlign debe ser center');
    });

    // ── T1-013 align-right design ─────────────────────────────────────
    // cubre: design | valida: DS/modelo (align) + estado visual (btn-ar active) + DOM (textAlign)
    await t.test('FormatEngine.applyFormat(align:right) actualiza DS.model, btn-ar activo y textAlign DOM [design]', async () => {
      await reloadRuntime(page, server.baseUrl);
      await selectSingle(page, 1);
      await page.click('#btn-ar');
      await page.waitForTimeout(150);
      const state = await getFullFormatState(page);

      assert.equal(state.model.align, 'right', 'modelo: align debe ser right');
      assert.equal(state.toolbar.alignRight, true, 'toolbar: btn-ar debe tener clase active');
      assert.equal(state.toolbar.alignLeft, false, 'toolbar: btn-al no debe estar active');
      assert.equal(state.designDOM?.textAlign, 'right', 'DOM: textAlign debe ser right');
    });

    // ── T1-014 align-left preview ─────────────────────────────────────
    // cubre: preview | valida: DOM (textAlign en pv-el)
    await t.test('FormatEngine.applyFormat(align:left) refleja textAlign:left en PreviewEngine pv-el [preview]', async () => {
      await reloadRuntime(page, server.baseUrl);
      await selectSingle(page, 1);
      // Asegurar align=left (el defecto es left, pero lo forzamos)
      await page.click('#btn-ac');
      await page.waitForTimeout(80);
      await page.click('#btn-al');
      await page.waitForTimeout(100);

      await enterPreview(page);
      const state = await getFullFormatState(page);

      assert.ok(state.preview, 'preview element debe existir');
      assert.equal(state.preview.textAlign, 'left', `DOM pv-el: textAlign debe ser left, obtenido '${state.preview.textAlign}'`);
      await exitPreview(page);
    });

    // ── T1-015 align-center preview ───────────────────────────────────
    // cubre: preview | valida: DOM (textAlign en pv-el)
    await t.test('FormatEngine.applyFormat(align:center) refleja textAlign:center en PreviewEngine pv-el [preview]', async () => {
      await reloadRuntime(page, server.baseUrl);
      await selectSingle(page, 1);
      await page.click('#btn-ac');
      await page.waitForTimeout(100);

      await enterPreview(page);
      const state = await getFullFormatState(page);

      assert.ok(state.preview, 'preview element debe existir');
      assert.equal(state.preview.textAlign, 'center', `DOM pv-el: textAlign debe ser center, obtenido '${state.preview.textAlign}'`);
      await exitPreview(page);
    });

    // ── T1-016 align-right preview ────────────────────────────────────
    // cubre: preview | valida: DOM (textAlign en pv-el)
    await t.test('FormatEngine.applyFormat(align:right) refleja textAlign:right en PreviewEngine pv-el [preview]', async () => {
      await reloadRuntime(page, server.baseUrl);
      await selectSingle(page, 1);
      await page.click('#btn-ar');
      await page.waitForTimeout(100);

      await enterPreview(page);
      const state = await getFullFormatState(page);

      assert.ok(state.preview, 'preview element debe existir');
      assert.equal(state.preview.textAlign, 'right', `DOM pv-el: textAlign debe ser right, obtenido '${state.preview.textAlign}'`);
      await exitPreview(page);
    });

    // ── T1-017 secuencia select→bold→font-size→rerender design ────────
    // cubre: design | valida: DS/modelo + DOM + estado visual (toolbar) tras rerender explícito
    await t.test('FormatEngine bold+fontSize → CanvasLayoutEngine.renderAll conserva DS.model y DOM [design]', async () => {
      await reloadRuntime(page, server.baseUrl);
      await selectSingle(page, 1);

      await page.click('#btn-bold');
      await page.waitForTimeout(120);
      await page.selectOption('#tb-font-size', '16');
      await page.waitForTimeout(120);

      // Rerender explícito
      await page.evaluate(() => _canonicalCanvasWriter().renderAll());
      await page.waitForTimeout(200);

      const state = await getFullFormatState(page);

      // DS/modelo
      assert.equal(state.model.bold, true, 'modelo: bold debe ser true');
      assert.equal(state.model.fontSize, 16, 'modelo: fontSize debe ser 16');
      // estado visual toolbar
      assert.equal(state.toolbar.bold, true, 'toolbar: btn-bold debe estar active');
      assert.equal(state.toolbar.fontSize, '16', 'toolbar: tb-font-size debe mostrar 16');
      // DOM
      assert.equal(state.designDOM?.fontWeight, 'bold', 'DOM: fontWeight debe ser bold');
      const pxVal = parseFloat(state.designDOM?.fontSize || '0');
      assert.ok(pxVal > 16, `DOM: fontSize (${pxVal}px) debe reflejar 16pt`);
    });

    // ── T1-018 secuencia select→bold→font-size→rerender preview ───────
    // cubre: preview | valida: DOM preview tras secuencia completa en design
    await t.test('FormatEngine bold+fontSize → CanvasLayoutEngine.renderAll → PreviewEngine refleja formato [preview]', async () => {
      await reloadRuntime(page, server.baseUrl);
      await selectSingle(page, 1);

      await page.click('#btn-bold');
      await page.waitForTimeout(120);
      await page.selectOption('#tb-font-size', '16');
      await page.waitForTimeout(120);

      await page.evaluate(() => _canonicalCanvasWriter().renderAll());
      await page.waitForTimeout(200);

      await enterPreview(page);
      const state = await getFullFormatState(page);

      assert.ok(state.preview, 'preview element debe existir tras secuencia');
      // DOM preview: bold
      assert.ok(
        state.preview.fontWeight === '700' || state.preview.fontWeight === 'bold',
        `DOM pv-el: fontWeight esperado bold, obtenido '${state.preview.fontWeight}'`,
      );
      // DOM preview: font-size mayor que defecto (8pt ≈ 10.67px) → 16pt ≈ 21.33px
      const pxVal = parseFloat(state.preview.fontSize || '0');
      assert.ok(pxVal > 16, `DOM pv-el: fontSize (${pxVal}px) debe reflejar 16pt`);
      await exitPreview(page);
    });

    await assertNoConsoleErrors(consoleErrors, 'TANDA 1');
  } finally {
    await browser.close();
    await server.stop();
  }
});
