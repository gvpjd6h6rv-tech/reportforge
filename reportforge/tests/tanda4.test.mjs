/**
 * TANDA 4 — FORMAT-EDGE-001..018
 * Format edge cases + mixed states
 * No mocks. Runtime real en /
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  startRuntimeServer,
  launchRuntimePage,
  reloadRuntime,
  selectSingle,
  selectPreviewSingle,
  enterPreview,
  exitPreview,
  assertNoConsoleErrors,
} from './runtime_harness.mjs';

async function fullState(page) {
  return page.evaluate(() => {
    const id = [...DS.selection][0];
    const el = id ? DS.getElementById(id) : null;
    const div = id ? document.querySelector(`.cr-element[data-id="${id}"]`) : null;
    const pvEl = id
      ? document.querySelector(`#preview-content .pv-el[data-origin-id="${id}"]`)
      : null;
    return {
      id,
      model: el ? {
        bold: !!el.bold, italic: !!el.italic, underline: !!el.underline,
        fontSize: el.fontSize, fontFamily: el.fontFamily, align: el.align,
      } : null,
      toolbar: {
        bold:      document.getElementById('btn-bold')?.classList.contains('active')      || false,
        italic:    document.getElementById('btn-italic')?.classList.contains('active')    || false,
        underline: document.getElementById('btn-underline')?.classList.contains('active') || false,
        alignLeft:   document.getElementById('btn-al')?.classList.contains('active') || false,
        alignCenter: document.getElementById('btn-ac')?.classList.contains('active') || false,
        alignRight:  document.getElementById('btn-ar')?.classList.contains('active') || false,
        fontSize:   document.getElementById('tb-font-size')?.value  || null,
        fontFamily: document.getElementById('tb-font-name')?.value  || null,
      },
      designDOM: div ? {
        fontWeight:     div.style.fontWeight,
        fontStyle:      div.style.fontStyle,
        textDecoration: div.style.textDecoration,
        fontSize:       div.style.fontSize,
        fontFamily:     div.style.fontFamily,
        textAlign:      div.style.textAlign,
      } : null,
      preview: pvEl ? {
        fontWeight:        getComputedStyle(pvEl).fontWeight,
        fontStyle:         getComputedStyle(pvEl).fontStyle,
        textDecorationLine: getComputedStyle(pvEl).textDecorationLine,
        textAlign:         getComputedStyle(pvEl).textAlign,
        fontSize:          getComputedStyle(pvEl).fontSize,
        fontFamily:        getComputedStyle(pvEl).fontFamily,
      } : null,
    };
  });
}

test('TANDA 4 — FORMAT-EDGE-001..018', { timeout: 240000 }, async (t) => {
  const server = await startRuntimeServer();
  const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl);

  try {
    // ── FORMAT-EDGE-001 ───────────────────────────────────────────────
    // cubre: design | valida: DS/modelo + DOM + estado visual
    await t.test('FORMAT-EDGE-001 bold toggles off from pre-bold state in design', async () => {
      await reloadRuntime(page, server.baseUrl);
      // e101 (índice 0) arranca con bold=true
      await selectSingle(page, 0);
      let s = await fullState(page);
      assert.equal(s.model.bold, true,  'pre: e101 debe tener bold=true');
      assert.equal(s.toolbar.bold, true, 'pre: toolbar debe estar active');

      await page.click('#btn-bold');
      await page.waitForTimeout(150);
      s = await fullState(page);

      assert.equal(s.model.bold, false,   'modelo: bold debe haberse apagado');
      assert.equal(s.toolbar.bold, false,  'toolbar: btn-bold no debe estar active');
      assert.equal(s.designDOM?.fontWeight, 'normal', 'DOM: fontWeight debe ser normal');
    });

    // ── FORMAT-EDGE-002 ───────────────────────────────────────────────
    // cubre: preview | valida: DOM pv-el
    await t.test('FORMAT-EDGE-002 bold toggles off from pre-bold state in preview', async () => {
      await reloadRuntime(page, server.baseUrl);
      // e101 arranca bold=true; entrar preview sin tocar diseño
      await selectSingle(page, 0);
      await enterPreview(page);
      await selectPreviewSingle(page, 0);

      let s = await fullState(page);
      assert.equal(s.model.bold, true, 'pre-preview: bold debe ser true');

      await page.click('#btn-bold');
      await page.waitForTimeout(200);
      s = await fullState(page);

      assert.equal(s.model.bold, false, 'preview: modelo bold debe haberse apagado');
      assert.ok(s.preview, 'pv-el debe existir');
      assert.ok(
        s.preview.fontWeight === 'normal' || s.preview.fontWeight === '400',
        `pv-el: fontWeight debe ser normal, obtenido '${s.preview.fontWeight}'`,
      );
      await exitPreview(page);
    });

    // ── FORMAT-EDGE-003 ───────────────────────────────────────────────
    // cubre: design | valida: DS/modelo + estado visual (ida y vuelta)
    await t.test('FORMAT-EDGE-003 italic roundtrip in design', async () => {
      await reloadRuntime(page, server.baseUrl);
      await selectSingle(page, 1); // e102, italic=false
      let s = await fullState(page);
      assert.equal(s.model.italic, false, 'pre: italic=false');

      // Ida: activar
      await page.click('#btn-italic');
      await page.waitForTimeout(150);
      s = await fullState(page);
      assert.equal(s.model.italic, true,  'ida: italic=true');
      assert.equal(s.toolbar.italic, true, 'ida: toolbar active');
      assert.equal(s.designDOM?.fontStyle, 'italic', 'ida: DOM fontStyle=italic');

      // Vuelta: desactivar
      await page.click('#btn-italic');
      await page.waitForTimeout(150);
      s = await fullState(page);
      assert.equal(s.model.italic, false,  'vuelta: italic=false');
      assert.equal(s.toolbar.italic, false, 'vuelta: toolbar inactivo');
      assert.ok(
        !s.designDOM?.fontStyle || s.designDOM.fontStyle === 'normal',
        `vuelta: DOM fontStyle debe ser normal, obtenido '${s.designDOM?.fontStyle}'`,
      );
    });

    // ── FORMAT-EDGE-004 ───────────────────────────────────────────────
    // cubre: preview | valida: DOM pv-el (ida y vuelta)
    await t.test('FORMAT-EDGE-004 italic roundtrip in preview', async () => {
      await reloadRuntime(page, server.baseUrl);
      await selectSingle(page, 1);
      await enterPreview(page);
      await selectPreviewSingle(page, 1);

      // Ida
      await page.click('#btn-italic');
      await page.waitForTimeout(200);
      let s = await fullState(page);
      assert.ok(s.preview, 'pv-el debe existir');
      assert.equal(s.preview.fontStyle, 'italic', 'ida: pv-el fontStyle=italic');

      // Vuelta
      await page.click('#btn-italic');
      await page.waitForTimeout(200);
      s = await fullState(page);
      assert.ok(
        s.preview.fontStyle === 'normal' || s.preview.fontStyle === '',
        `vuelta: pv-el fontStyle debe ser normal, obtenido '${s.preview.fontStyle}'`,
      );
      await exitPreview(page);
    });

    // ── FORMAT-EDGE-005 ───────────────────────────────────────────────
    // cubre: design | valida: DS/modelo + DOM (ida y vuelta underline)
    await t.test('FORMAT-EDGE-005 underline roundtrip in design', async () => {
      await reloadRuntime(page, server.baseUrl);
      await selectSingle(page, 1);
      let s = await fullState(page);
      assert.equal(s.model.underline, false, 'pre: underline=false');

      // Ida
      await page.click('#btn-underline');
      await page.waitForTimeout(150);
      s = await fullState(page);
      assert.equal(s.model.underline, true, 'ida: underline=true');
      assert.equal(s.toolbar.underline, true, 'ida: toolbar active');
      assert.ok(
        s.designDOM?.textDecoration?.includes('underline'),
        `ida: DOM textDecoration debe incluir underline, obtenido '${s.designDOM?.textDecoration}'`,
      );

      // Vuelta
      await page.click('#btn-underline');
      await page.waitForTimeout(150);
      s = await fullState(page);
      assert.equal(s.model.underline, false, 'vuelta: underline=false');
      assert.equal(s.toolbar.underline, false, 'vuelta: toolbar inactivo');
      assert.ok(
        !s.designDOM?.textDecoration || s.designDOM.textDecoration === 'none',
        `vuelta: DOM textDecoration debe ser none, obtenido '${s.designDOM?.textDecoration}'`,
      );
    });

    // ── FORMAT-EDGE-006 ───────────────────────────────────────────────
    // cubre: preview | valida: DOM pv-el (ida y vuelta underline)
    await t.test('FORMAT-EDGE-006 underline roundtrip in preview', async () => {
      await reloadRuntime(page, server.baseUrl);
      await selectSingle(page, 1);
      await enterPreview(page);
      await selectPreviewSingle(page, 1);

      // Ida
      await page.click('#btn-underline');
      await page.waitForTimeout(200);
      let s = await fullState(page);
      assert.ok(s.preview, 'pv-el debe existir');
      assert.ok(
        s.preview.textDecorationLine?.includes('underline'),
        `ida: pv-el textDecoration debe incluir underline, obtenido '${s.preview.textDecorationLine}'`,
      );

      // Vuelta
      await page.click('#btn-underline');
      await page.waitForTimeout(200);
      s = await fullState(page);
      assert.ok(
        !s.preview.textDecorationLine || s.preview.textDecorationLine === 'none',
        `vuelta: pv-el textDecoration debe ser none, obtenido '${s.preview.textDecorationLine}'`,
      );
      await exitPreview(page);
    });

    // ── FORMAT-EDGE-007 ───────────────────────────────────────────────
    // cubre: design | valida: DS/modelo + toolbar (cambio y restauración de fontSize)
    await t.test('FORMAT-EDGE-007 font-size changes and restores original value in design', async () => {
      await reloadRuntime(page, server.baseUrl);
      await selectSingle(page, 1);
      let s = await fullState(page);
      const original = s.model.fontSize; // 8

      // Cambio
      await page.selectOption('#tb-font-size', '14');
      await page.waitForTimeout(150);
      s = await fullState(page);
      assert.equal(s.model.fontSize, 14, 'cambio: fontSize=14');
      assert.equal(s.toolbar.fontSize, '14', 'cambio: toolbar muestra 14');

      // Restauración al valor original
      await page.selectOption('#tb-font-size', String(original));
      await page.waitForTimeout(150);
      s = await fullState(page);
      assert.equal(s.model.fontSize, original, `restauración: fontSize=${original}`);
      assert.equal(s.toolbar.fontSize, String(original), `restauración: toolbar muestra ${original}`);

      const pxVal = parseFloat(s.designDOM?.fontSize || '0');
      assert.ok(pxVal > 0, `DOM: fontSize en px (${pxVal}) debe ser positivo`);
    });

    // ── FORMAT-EDGE-008 ───────────────────────────────────────────────
    // cubre: preview | valida: DOM pv-el (cambio y restauración de fontSize)
    await t.test('FORMAT-EDGE-008 font-size changes and restores original value in preview', async () => {
      await reloadRuntime(page, server.baseUrl);
      await selectSingle(page, 1);
      const original = await page.evaluate(() => DS.getElementById([...DS.selection][0]).fontSize);

      // Cambio a 14
      await page.selectOption('#tb-font-size', '14');
      await page.waitForTimeout(150);
      await enterPreview(page);
      let s = await fullState(page);
      assert.ok(s.preview, 'pv-el debe existir con fontSize=14');
      const px14 = parseFloat(s.preview.fontSize);
      assert.ok(px14 > 14, `pv-el: fontSize px para 14pt debe ser > 14, obtenido ${px14}`);
      await exitPreview(page);

      // Restauración
      await page.selectOption('#tb-font-size', String(original));
      await page.waitForTimeout(150);
      await enterPreview(page);
      s = await fullState(page);
      assert.ok(s.preview, 'pv-el debe existir con fontSize original');
      const pxOrig = parseFloat(s.preview.fontSize);
      assert.ok(pxOrig < px14, `pv-el: fontSize original (${pxOrig}px) debe ser menor que 14pt (${px14}px)`);
      await exitPreview(page);
    });

    // ── FORMAT-EDGE-009 ───────────────────────────────────────────────
    // cubre: design | valida: DS/modelo + DOM (cambio entre dos familias distintas)
    await t.test('FORMAT-EDGE-009 font-family switches between two families in design', async () => {
      await reloadRuntime(page, server.baseUrl);
      await selectSingle(page, 1);

      // Primera familia
      await page.selectOption('#tb-font-name', 'Courier New');
      await page.waitForTimeout(150);
      let s = await fullState(page);
      assert.equal(s.model.fontFamily, 'Courier New', 'primera familia: modelo=Courier New');
      assert.ok(s.designDOM?.fontFamily?.includes('Courier'), `primera familia: DOM incluye Courier`);

      // Segunda familia (diferente)
      await page.selectOption('#tb-font-name', 'Verdana');
      await page.waitForTimeout(150);
      s = await fullState(page);
      assert.equal(s.model.fontFamily, 'Verdana', 'segunda familia: modelo=Verdana');
      assert.ok(s.designDOM?.fontFamily?.includes('Verdana'), `segunda familia: DOM incluye Verdana`);

      // Las dos familias son distintas entre sí
      assert.notEqual('Courier New', 'Verdana', 'las dos familias deben ser distintas');
    });

    // ── FORMAT-EDGE-010 ───────────────────────────────────────────────
    // cubre: preview | valida: DOM pv-el (cambio entre dos familias)
    await t.test('FORMAT-EDGE-010 font-family switches between two families in preview', async () => {
      await reloadRuntime(page, server.baseUrl);
      await selectSingle(page, 1);

      // Primera familia → entrar preview
      await page.selectOption('#tb-font-name', 'Courier New');
      await page.waitForTimeout(150);
      await enterPreview(page);
      let s = await fullState(page);
      assert.ok(s.preview, 'pv-el debe existir con Courier New');
      assert.ok(s.preview.fontFamily?.includes('Courier'), `pv-el: fontFamily debe incluir Courier`);
      await exitPreview(page);

      // Segunda familia → entrar preview
      await page.selectOption('#tb-font-name', 'Verdana');
      await page.waitForTimeout(150);
      await enterPreview(page);
      s = await fullState(page);
      assert.ok(s.preview, 'pv-el debe existir con Verdana');
      assert.ok(s.preview.fontFamily?.includes('Verdana'), `pv-el: fontFamily debe incluir Verdana`);
      assert.ok(!s.preview.fontFamily?.includes('Courier'), `pv-el: no debe seguir siendo Courier`);
      await exitPreview(page);
    });

    // ── FORMAT-EDGE-011 ───────────────────────────────────────────────
    // cubre: design | valida: DS/modelo + DOM (align-left no-op sobre ya-left)
    await t.test('FORMAT-EDGE-011 align-left no-op on already-left element in design', async () => {
      await reloadRuntime(page, server.baseUrl);
      await selectSingle(page, 1); // e102 tiene align='left' por defecto
      let s = await fullState(page);
      assert.equal(s.model.align, 'left', 'pre: align ya es left');

      // Aplicar align-left sobre elemento ya-left
      await page.click('#btn-al');
      await page.waitForTimeout(150);
      s = await fullState(page);

      assert.equal(s.model.align, 'left',   'modelo: align sigue siendo left');
      assert.equal(s.toolbar.alignLeft, true, 'toolbar: btn-al debe estar active');
      assert.equal(s.designDOM?.textAlign, 'left', 'DOM: textAlign sigue siendo left');
    });

    // ── FORMAT-EDGE-012 ───────────────────────────────────────────────
    // cubre: design | valida: DS/modelo + DOM (align-center no-op sobre ya-centered)
    await t.test('FORMAT-EDGE-012 align-center no-op on already-centered element in design', async () => {
      await reloadRuntime(page, server.baseUrl);
      await selectSingle(page, 1);

      // Primero poner en center
      await page.click('#btn-ac');
      await page.waitForTimeout(120);
      let s = await fullState(page);
      assert.equal(s.model.align, 'center', 'pre: align=center');

      // Aplicar center de nuevo (no-op semántico)
      await page.click('#btn-ac');
      await page.waitForTimeout(150);
      s = await fullState(page);

      assert.equal(s.model.align, 'center',   'modelo: align sigue siendo center');
      assert.equal(s.toolbar.alignCenter, true, 'toolbar: btn-ac sigue active');
      assert.equal(s.designDOM?.textAlign, 'center', 'DOM: textAlign sigue siendo center');
    });

    // ── FORMAT-EDGE-013 ───────────────────────────────────────────────
    // cubre: design | valida: DS/modelo + DOM (align-right no-op sobre ya-right)
    await t.test('FORMAT-EDGE-013 align-right no-op on already-right element in design', async () => {
      await reloadRuntime(page, server.baseUrl);
      await selectSingle(page, 1);

      await page.click('#btn-ar');
      await page.waitForTimeout(120);
      let s = await fullState(page);
      assert.equal(s.model.align, 'right', 'pre: align=right');

      // Aplicar right de nuevo
      await page.click('#btn-ar');
      await page.waitForTimeout(150);
      s = await fullState(page);

      assert.equal(s.model.align, 'right',   'modelo: align sigue siendo right');
      assert.equal(s.toolbar.alignRight, true, 'toolbar: btn-ar sigue active');
      assert.equal(s.designDOM?.textAlign, 'right', 'DOM: textAlign sigue siendo right');
    });

    // ── FORMAT-EDGE-014 ───────────────────────────────────────────────
    // cubre: preview | valida: DOM pv-el (align-left no-op en preview)
    await t.test('FORMAT-EDGE-014 align-left no-op on already-left element in preview', async () => {
      await reloadRuntime(page, server.baseUrl);
      await selectSingle(page, 1); // e102, align=left
      // Asegurar left
      await page.click('#btn-al');
      await page.waitForTimeout(100);
      await enterPreview(page);
      await selectPreviewSingle(page, 1);

      // Aplicar align-left desde preview (no-op)
      await page.click('#btn-al');
      await page.waitForTimeout(200);

      const s = await fullState(page);
      assert.ok(s.preview, 'pv-el debe existir');
      assert.equal(s.preview.textAlign, 'left', `pv-el: textAlign debe seguir siendo left`);
      assert.equal(s.model.align, 'left', 'modelo: align no debe cambiar');
      await exitPreview(page);
    });

    // ── FORMAT-EDGE-015 ───────────────────────────────────────────────
    // cubre: preview | valida: DOM pv-el (align-center no-op en preview)
    await t.test('FORMAT-EDGE-015 align-center no-op on already-centered element in preview', async () => {
      await reloadRuntime(page, server.baseUrl);
      await selectSingle(page, 1);
      await page.click('#btn-ac');
      await page.waitForTimeout(100);
      await enterPreview(page);
      await selectPreviewSingle(page, 1);

      // Aplicar center de nuevo desde preview
      await page.click('#btn-ac');
      await page.waitForTimeout(200);

      const s = await fullState(page);
      assert.ok(s.preview, 'pv-el debe existir');
      assert.equal(s.preview.textAlign, 'center', `pv-el: textAlign debe seguir siendo center`);
      await exitPreview(page);
    });

    // ── FORMAT-EDGE-016 ───────────────────────────────────────────────
    // cubre: preview | valida: DOM pv-el (align-right no-op en preview)
    await t.test('FORMAT-EDGE-016 align-right no-op on already-right element in preview', async () => {
      await reloadRuntime(page, server.baseUrl);
      await selectSingle(page, 1);
      await page.click('#btn-ar');
      await page.waitForTimeout(100);
      await enterPreview(page);
      await selectPreviewSingle(page, 1);

      await page.click('#btn-ar');
      await page.waitForTimeout(200);

      const s = await fullState(page);
      assert.ok(s.preview, 'pv-el debe existir');
      assert.equal(s.preview.textAlign, 'right', `pv-el: textAlign debe seguir siendo right`);
      await exitPreview(page);
    });

    // ── FORMAT-EDGE-017 ───────────────────────────────────────────────
    // cubre: design | valida: DS/modelo + DOM + estado visual (combinación bold+italic+underline)
    await t.test('FORMAT-EDGE-017 bold italic underline combined formatting in design', async () => {
      await reloadRuntime(page, server.baseUrl);
      await selectSingle(page, 1); // e102 arranca sin ninguno

      await page.click('#btn-bold');
      await page.waitForTimeout(120);
      await page.click('#btn-italic');
      await page.waitForTimeout(120);
      await page.click('#btn-underline');
      await page.waitForTimeout(150);

      const s = await fullState(page);

      // DS/modelo: los tres activos
      assert.equal(s.model.bold,      true, 'modelo: bold=true');
      assert.equal(s.model.italic,    true, 'modelo: italic=true');
      assert.equal(s.model.underline, true, 'modelo: underline=true');

      // estado visual toolbar
      assert.equal(s.toolbar.bold,      true, 'toolbar: btn-bold active');
      assert.equal(s.toolbar.italic,    true, 'toolbar: btn-italic active');
      assert.equal(s.toolbar.underline, true, 'toolbar: btn-underline active');

      // DOM
      assert.equal(s.designDOM?.fontWeight, 'bold',   'DOM: fontWeight=bold');
      assert.equal(s.designDOM?.fontStyle,  'italic',  'DOM: fontStyle=italic');
      assert.ok(
        s.designDOM?.textDecoration?.includes('underline'),
        `DOM: textDecoration debe incluir underline`,
      );
    });

    // ── FORMAT-EDGE-018 ───────────────────────────────────────────────
    // cubre: preview | valida: DOM pv-el (combinación bold+italic+underline)
    await t.test('FORMAT-EDGE-018 bold italic underline combined formatting in preview', async () => {
      await reloadRuntime(page, server.baseUrl);
      await selectSingle(page, 1);

      await page.click('#btn-bold');
      await page.waitForTimeout(120);
      await page.click('#btn-italic');
      await page.waitForTimeout(120);
      await page.click('#btn-underline');
      await page.waitForTimeout(150);

      await enterPreview(page);
      const s = await fullState(page);
      assert.ok(s.preview, 'pv-el debe existir con formato combinado');

      assert.ok(
        s.preview.fontWeight === '700' || s.preview.fontWeight === 'bold',
        `pv-el: fontWeight debe ser bold, obtenido '${s.preview.fontWeight}'`,
      );
      assert.equal(s.preview.fontStyle, 'italic', `pv-el: fontStyle debe ser italic`);
      assert.ok(
        s.preview.textDecorationLine?.includes('underline'),
        `pv-el: textDecoration debe incluir underline`,
      );
      await exitPreview(page);
    });

    await assertNoConsoleErrors(consoleErrors, 'TANDA 4 FORMAT-EDGE');
  } finally {
    await browser.close();
    await server.stop();
  }
});
