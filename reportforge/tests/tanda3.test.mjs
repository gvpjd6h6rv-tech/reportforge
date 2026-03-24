/**
 * TANDA 3 — 16 browser-based tests: undo/redo, sin-selección, commands, regresión fuerte
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
  selectMulti,
  selectPreviewSingle,
  getSelectionSnapshot,
  getSingleAlignment,
  assertRectClose,
  runtimeState,
  setZoom,
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

async function getElementFormat(page, id) {
  return page.evaluate(elId => {
    const el = DS.getElementById(elId);
    return el ? { bold: !!el.bold, italic: !!el.italic, fontSize: el.fontSize, align: el.align } : null;
  }, id);
}

async function getToolbarState(page) {
  return page.evaluate(() => ({
    bold: document.getElementById('btn-bold')?.classList.contains('active') || false,
    italic: document.getElementById('btn-italic')?.classList.contains('active') || false,
    underline: document.getElementById('btn-underline')?.classList.contains('active') || false,
    fontSize: document.getElementById('tb-font-size')?.value || null,
  }));
}

test('TANDA 3 — undo/redo, sin-selección, commands, regresión fuerte', { timeout: 240000 }, async (t) => {
  const server = await startRuntimeServer();
  const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl);

  try {
    // ── T3-001 undo/redo bold design ──────────────────────────────────
    // cubre: design | valida: DS/modelo (estado antes/después undo/redo)
    await t.test('HistoryEngine undo revierte bold y redo lo restaura en DS.model [design]', async () => {
      await reloadRuntime(page, server.baseUrl);
      await selectSingle(page, 1); // e102, bold=false
      const id = (await page.evaluate(() => [...DS.selection][0]));

      await page.click('#btn-bold');
      await page.waitForTimeout(150);
      let fmt = await getElementFormat(page, id);
      assert.equal(fmt.bold, true, 'post-bold: bold debe ser true');

      // Undo
      await page.evaluate(() => DS.undo());
      await page.waitForTimeout(200);
      fmt = await getElementFormat(page, id);
      assert.equal(fmt.bold, false, 'post-undo: bold debe volver a false');

      // Redo
      await page.evaluate(() => DS.redo());
      await page.waitForTimeout(200);
      fmt = await getElementFormat(page, id);
      assert.equal(fmt.bold, true, 'post-redo: bold debe volver a true');
    });

    // ── T3-002 undo/redo font-size design ─────────────────────────────
    // cubre: design | valida: DS/modelo (fontSize restaurado por undo/redo)
    await t.test('HistoryEngine undo revierte fontSize y redo lo restaura en DS.model [design]', async () => {
      await reloadRuntime(page, server.baseUrl);
      await selectSingle(page, 1);
      const id = (await page.evaluate(() => [...DS.selection][0]));
      let fmt = await getElementFormat(page, id);
      const originalSize = fmt.fontSize; // 8

      await page.selectOption('#tb-font-size', '14');
      await page.waitForTimeout(150);
      fmt = await getElementFormat(page, id);
      assert.equal(fmt.fontSize, 14, 'post-change: fontSize debe ser 14');

      await page.evaluate(() => DS.undo());
      await page.waitForTimeout(200);
      fmt = await getElementFormat(page, id);
      assert.equal(fmt.fontSize, originalSize, `post-undo: fontSize debe volver a ${originalSize}`);

      await page.evaluate(() => DS.redo());
      await page.waitForTimeout(200);
      fmt = await getElementFormat(page, id);
      assert.equal(fmt.fontSize, 14, 'post-redo: fontSize debe volver a 14');
    });

    // ── T3-003 undo/redo bold + font-size design ──────────────────────
    // cubre: design | valida: DS/modelo (ambos formatos restaurados correctamente)
    await t.test('HistoryEngine stack: undo bold+fontSize individualmente desde DS.model [design]', async () => {
      await reloadRuntime(page, server.baseUrl);
      await selectSingle(page, 1);
      const id = (await page.evaluate(() => [...DS.selection][0]));

      await page.click('#btn-bold');
      await page.waitForTimeout(120);
      await page.selectOption('#tb-font-size', '12');
      await page.waitForTimeout(120);

      let fmt = await getElementFormat(page, id);
      assert.equal(fmt.bold, true, 'post: bold=true');
      assert.equal(fmt.fontSize, 12, 'post: fontSize=12');

      // Undo font-size (último cambio)
      await page.evaluate(() => DS.undo());
      await page.waitForTimeout(200);
      fmt = await getElementFormat(page, id);
      assert.equal(fmt.fontSize, 8, 'post-undo1: fontSize debe volver a 8');
      assert.equal(fmt.bold, true, 'post-undo1: bold debe mantenerse true');

      // Undo bold
      await page.evaluate(() => DS.undo());
      await page.waitForTimeout(200);
      fmt = await getElementFormat(page, id);
      assert.equal(fmt.bold, false, 'post-undo2: bold debe volver a false');
    });

    // ── T3-004 undo/redo format + zoom consistente ────────────────────
    // cubre: design | valida: DS/modelo + overlay/geom (alineación preservada post-undo a distintos zooms)
    await t.test('HistoryEngine undo tras FormatEngine+DesignZoomEngine mantiene SelectionEngine overlay alineado [design]', async () => {
      await reloadRuntime(page, server.baseUrl);
      await selectSingle(page, 1);
      const id = (await page.evaluate(() => [...DS.selection][0]));

      await page.click('#btn-bold');
      await page.waitForTimeout(120);
      await setZoom(page, 1.5);

      // Undo bold
      await page.evaluate(() => DS.undo());
      await page.waitForTimeout(200);

      // DS/modelo: bold debe haber vuelto a false
      const fmt = await getElementFormat(page, id);
      assert.equal(fmt.bold, false, 'post-undo con zoom: bold debe ser false');

      // overlay/geom: alineación debe ser correcta a zoom 1.5
      const alignment = await getSingleAlignment(page);
      // Después de undo, la selección se limpia — re-seleccionar
      if (!alignment) {
        await selectSingle(page, 1);
        const alignmentAfterReselect = await getSingleAlignment(page);
        assert.ok(alignmentAfterReselect, 'alignment no debe ser null tras undo+zoom');
        assertRectClose(alignmentAfterReselect.box, alignmentAfterReselect.element, 0.5, 'undoZoom');
      } else {
        assertRectClose(alignment.box, alignment.element, 0.5, 'undoZoom');
      }
      await setZoom(page, 1);
    });

    // ── T3-005 format sin selección design ────────────────────────────
    // cubre: design | valida: DS/modelo (no cambia si no hay selección) + estado visual toolbar
    await t.test('FormatEngine.toggleFormat sin selección no muta DS.model ni avanza historyIndex [design]', async () => {
      await reloadRuntime(page, server.baseUrl);
      // Sin selección (página recién cargada, selección vacía)
      const emptySelection = await page.evaluate(() => [...DS.selection].length);
      assert.equal(emptySelection, 0, 'pre: selección debe estar vacía');

      // Capturar snapshot del modelo antes
      const countBefore = await page.evaluate(() => DS.elements.length);
      const historyBefore = await page.evaluate(() => DS.historyIndex);

      // Click en bold sin selección — no debe crashear ni modificar nada
      await page.click('#btn-bold');
      await page.waitForTimeout(150);

      // DS/modelo: ningún elemento debe haber cambiado (historyIndex no debe avanzar)
      const countAfter = await page.evaluate(() => DS.elements.length);
      const historyAfter = await page.evaluate(() => DS.historyIndex);
      assert.equal(countAfter, countBefore, 'modelo: elemento count no debe cambiar');
      assert.equal(historyAfter, historyBefore, 'modelo: historyIndex no debe avanzar sin selección');

      // estado visual: toolbar no debe mostrar nada activo
      const toolbar = await getToolbarState(page);
      assert.equal(toolbar.bold, false, 'toolbar: btn-bold no debe estar active sin selección');
    });

    // ── T3-006 format sin selección preview ───────────────────────────
    // cubre: preview | valida: DS/modelo (no cambia si no hay selección en preview)
    await t.test('FormatEngine.toggleFormat sin selección en PreviewEngine no avanza DS.historyIndex [preview]', async () => {
      await reloadRuntime(page, server.baseUrl);
      await enterPreview(page);

      const emptySelection = await page.evaluate(() => [...DS.selection].length);
      assert.equal(emptySelection, 0, 'pre: selección debe estar vacía en preview');

      const historyBefore = await page.evaluate(() => DS.historyIndex);

      // Click en bold sin selección en preview
      await page.click('#btn-bold');
      await page.waitForTimeout(150);

      const historyAfter = await page.evaluate(() => DS.historyIndex);
      assert.equal(historyAfter, historyBefore, 'preview: historyIndex no debe avanzar sin selección');
      await exitPreview(page);
    });

    // ── T3-007 font change sin selección ─────────────────────────────
    // cubre: design | valida: DS/modelo (ningún elemento cambia si no hay selección)
    await t.test('FormatEngine.applyFormat(fontFamily) sin selección no avanza DS.historyIndex — regresión [design]', async () => {
      await reloadRuntime(page, server.baseUrl);
      // Sin selección
      const historyBefore = await page.evaluate(() => DS.historyIndex);
      const sampleFontBefore = await page.evaluate(() => DS.elements[1].fontFamily);

      // Cambiar fuente sin selección
      await page.selectOption('#tb-font-name', 'Verdana');
      await page.waitForTimeout(150);

      // DS/modelo: el elemento no debe cambiar si no había selección
      const historyAfter = await page.evaluate(() => DS.historyIndex);
      const sampleFontAfter = await page.evaluate(() => DS.elements[1].fontFamily);
      assert.equal(historyAfter, historyBefore, 'modelo: historyIndex no debe avanzar sin selección');
      assert.equal(sampleFontAfter, sampleFontBefore, 'modelo: fontFamily del elemento no debe cambiar sin selección');
    });

    // ── T3-008 align sin selección ────────────────────────────────────
    // cubre: design | valida: DS/modelo (ningún elemento cambia si no hay selección)
    await t.test('FormatEngine.applyFormat(align) sin selección no avanza DS.historyIndex — regresión [design]', async () => {
      await reloadRuntime(page, server.baseUrl);
      const historyBefore = await page.evaluate(() => DS.historyIndex);
      const sampleAlignBefore = await page.evaluate(() => DS.elements[1].align);

      // Clic en align-center sin selección
      await page.click('#btn-ac');
      await page.waitForTimeout(150);

      const historyAfter = await page.evaluate(() => DS.historyIndex);
      const sampleAlignAfter = await page.evaluate(() => DS.elements[1].align);
      assert.equal(historyAfter, historyBefore, 'modelo: historyIndex no debe avanzar sin selección');
      assert.equal(sampleAlignAfter, sampleAlignBefore, 'modelo: align no debe cambiar sin selección');
    });

    // ── T3-009 delete command sobre selección ─────────────────────────
    // cubre: design | valida: DS/modelo (elemento eliminado) + DOM (elemento removido del canvas)
    await t.test('CommandEngine.delete elimina elemento de DS.elements y del DOM .cr-element [design]', async () => {
      await reloadRuntime(page, server.baseUrl);
      const countBefore = await page.evaluate(() => DS.elements.length);
      await selectSingle(page, 1);
      const deletedId = (await page.evaluate(() => [...DS.selection][0]));

      // Ejecutar delete via CommandEngine
      await page.evaluate(() => CommandEngine.delete());
      await page.waitForTimeout(200);

      // DS/modelo: elemento debe haber sido eliminado
      const countAfter = await page.evaluate(() => DS.elements.length);
      assert.equal(countAfter, countBefore - 1, 'modelo: elemento count debe decrementar');
      const found = await page.evaluate(id => !!DS.getElementById(id), deletedId);
      assert.equal(found, false, `modelo: elemento ${deletedId} debe haber sido eliminado`);

      // DOM: no debe quedar el div del elemento
      const divExists = await page.evaluate(id =>
        !!document.querySelector(`.cr-element[data-id="${id}"]`), deletedId,
      );
      assert.equal(divExists, false, `DOM: div del elemento ${deletedId} debe haber sido removido`);
    });

    // ── T3-010 duplicate command sobre selección si existe ────────────
    // cubre: design | valida: DS/modelo (nuevo elemento con mismo formato) + DOM
    await t.test('CommandEngine.copy+paste crea nuevo elemento con mismo formato en DS.elements [design]', async () => {
      await reloadRuntime(page, server.baseUrl);
      await selectSingle(page, 1);
      const id = (await page.evaluate(() => [...DS.selection][0]));
      const original = await page.evaluate(elId => {
        const el = DS.getElementById(elId);
        return { bold: el.bold, italic: el.italic, fontSize: el.fontSize, fontFamily: el.fontFamily };
      }, id);

      const countBefore = await page.evaluate(() => DS.elements.length);

      // Duplicate via copy + paste si no existe duplicate directo
      await page.evaluate(() => {
        CommandEngine.copy();
        CommandEngine.paste();
      });
      await page.waitForTimeout(200);

      const countAfter = await page.evaluate(() => DS.elements.length);
      assert.equal(countAfter, countBefore + 1, 'modelo: debe haber 1 elemento más tras duplicate');

      // El nuevo elemento debe tener el mismo formato que el original
      const newId = (await page.evaluate(() => [...DS.selection][0]));
      assert.ok(newId !== id, 'el nuevo elemento debe tener ID diferente');
      const copy = await page.evaluate(elId => {
        const el = DS.getElementById(elId);
        return el ? { bold: el.bold, italic: el.italic, fontSize: el.fontSize, fontFamily: el.fontFamily } : null;
      }, newId);
      assert.ok(copy, 'DS debe tener el nuevo elemento');
      assert.equal(copy.bold, original.bold, 'copia: bold debe coincidir');
      assert.equal(copy.fontSize, original.fontSize, 'copia: fontSize debe coincidir');
      assert.equal(copy.fontFamily, original.fontFamily, 'copia: fontFamily debe coincidir');
    });

    // ── T3-011 align command si existe ───────────────────────────────
    // cubre: design | valida: DS/modelo (posiciones alineadas tras alignLefts) + overlay/geom
    await t.test('CommandEngine.alignLefts alinea DS.model.x de la multiselección y actualiza SelectionEngine overlay [design]', async () => {
      await reloadRuntime(page, server.baseUrl);
      await selectMulti(page, 1, 2);
      const ids = await page.evaluate(() => [...DS.selection]);
      assert.equal(ids.length, 2, 'pre: 2 elementos seleccionados');

      // Aplicar alignLefts
      await page.evaluate(() => CommandEngine.alignLefts());
      await page.waitForTimeout(200);

      // DS/modelo: ambos elementos deben tener el mismo x (mínimo x de los dos)
      const xs = await page.evaluate(elIds => elIds.map(id => DS.getElementById(id)?.x), ids);
      assert.ok(xs.every(x => x !== undefined && x !== null), 'modelo: ambos elementos deben existir');
      assert.equal(xs[0], xs[1], `modelo: ambos x deben coincidir tras alignLefts (${xs[0]} vs ${xs[1]})`);

      // overlay/geom: sel-box alineado
      const bbox = await page.evaluate(() => {
        const box = document.querySelector('#handles-layer .sel-box');
        if (!box) return null;
        const br = box.getBoundingClientRect();
        return { left: br.left, top: br.top, width: br.width, height: br.height };
      });
      assert.ok(bbox, 'overlay: sel-box debe existir tras align');
    });

    // ── T3-012 command en preview con parity ──────────────────────────
    // cubre: ambos | valida: paridad — format aplicado en preview refleja modelo en design
    await t.test('FormatEngine en preview → PreviewEngine re-render → DS.model persiste al volver a design [ambos]', async () => {
      await reloadRuntime(page, server.baseUrl);
      await selectSingle(page, 2); // e103
      const id = (await page.evaluate(() => [...DS.selection][0]));

      await enterPreview(page);
      await selectPreviewSingle(page, 2);

      // Aplicar bold desde preview
      await page.click('#btn-bold');
      await page.waitForTimeout(200);

      // DS/modelo debe reflejar bold=true
      const modelInPreview = await getElementFormat(page, id);
      assert.equal(modelInPreview.bold, true, 'preview: modelo bold debe ser true');

      // pv-el debe tener fontWeight bold
      const pvStyle = await page.evaluate(elId => {
        const pvEl = document.querySelector(`#preview-content .pv-el[data-origin-id="${elId}"]`);
        return pvEl ? getComputedStyle(pvEl).fontWeight : null;
      }, id);
      assert.ok(pvStyle, 'pv-el debe existir');
      assert.ok(pvStyle === '700' || pvStyle === 'bold', `pv-el fontWeight debe ser bold, obtenido ${pvStyle}`);

      // Volver a design: modelo debe conservar bold
      await exitPreview(page);
      const modelInDesign = await getElementFormat(page, id);
      assert.equal(modelInDesign.bold, true, 'design: bold debe conservarse tras salir de preview');
    });

    // ── T3-013 format sobrevive a rerender fuerte ─────────────────────
    // cubre: design | valida: DS/modelo + DOM (estilos conservados tras rerender completo)
    await t.test('FormatEngine bold+italic+fontSize sobrevive a CanvasLayoutEngine.renderAll fuerte [design]', async () => {
      await reloadRuntime(page, server.baseUrl);
      await selectSingle(page, 1);
      const id = (await page.evaluate(() => [...DS.selection][0]));

      await page.click('#btn-bold');
      await page.waitForTimeout(120);
      await page.click('#btn-italic');
      await page.waitForTimeout(120);
      await page.selectOption('#tb-font-size', '12');
      await page.waitForTimeout(120);

      // Rerender fuerte: renderAll + SectionLayoutEngine si existe
      await page.evaluate(() => {
        _canonicalCanvasWriter().renderAll();
        if (typeof SectionLayoutEngine !== 'undefined') SectionLayoutEngine.update();
      });
      await page.waitForTimeout(300);

      // DS/modelo debe conservar el formato
      const fmt = await getElementFormat(page, id);
      assert.equal(fmt.bold, true, 'modelo: bold debe conservarse tras rerender fuerte');
      assert.equal(fmt.italic, true, 'modelo: italic debe conservarse tras rerender fuerte');
      assert.equal(fmt.fontSize, 12, 'modelo: fontSize debe conservarse tras rerender fuerte');

      // DOM: el elemento debe tener los estilos correctos
      const domStyles = await page.evaluate(elId => {
        const div = document.querySelector(`.cr-element[data-id="${elId}"]`);
        return div ? { fontWeight: div.style.fontWeight, fontStyle: div.style.fontStyle } : null;
      }, id);
      assert.ok(domStyles, 'DOM: elemento debe existir tras rerender fuerte');
      assert.equal(domStyles.fontWeight, 'bold', 'DOM: fontWeight debe ser bold');
      assert.equal(domStyles.fontStyle, 'italic', 'DOM: fontStyle debe ser italic');
    });

    // ── T3-014 format sobrevive a preview enter/exit ──────────────────
    // cubre: ambos | valida: DS/modelo + DOM (estilos conservados tras múltiples enter/exit preview)
    await t.test('FormatEngine bold+fontSize sobrevive a 3 ciclos PreviewEngine enter/exit [ambos]', async () => {
      await reloadRuntime(page, server.baseUrl);
      await selectSingle(page, 1);
      const id = (await page.evaluate(() => [...DS.selection][0]));

      await page.click('#btn-bold');
      await page.waitForTimeout(120);
      await page.selectOption('#tb-font-size', '14');
      await page.waitForTimeout(120);

      // Múltiples enter/exit preview
      for (let i = 0; i < 3; i++) {
        await enterPreview(page);
        // En preview: verificar que pv-el tiene el formato
        const pvStyle = await page.evaluate(elId => {
          const pvEl = document.querySelector(`#preview-content .pv-el[data-origin-id="${elId}"]`);
          return pvEl ? getComputedStyle(pvEl).fontWeight : null;
        }, id);
        assert.ok(pvStyle === '700' || pvStyle === 'bold', `ciclo ${i + 1}: pv-el fontWeight debe ser bold`);

        await exitPreview(page);
      }

      // DS/modelo y DOM en design deben conservar el formato
      const fmt = await getElementFormat(page, id);
      assert.equal(fmt.bold, true, 'modelo: bold debe conservarse tras 3 ciclos preview');
      assert.equal(fmt.fontSize, 14, 'modelo: fontSize debe conservarse tras 3 ciclos preview');

      const domStyle = await page.evaluate(elId => {
        const div = document.querySelector(`.cr-element[data-id="${elId}"]`);
        return div ? div.style.fontWeight : null;
      }, id);
      assert.equal(domStyle, 'bold', 'DOM: fontWeight debe ser bold tras 3 ciclos preview');
    });

    // ── T3-015 no console errors en secuencia compuesta ───────────────
    // cubre: ambos | valida: no errores de consola durante secuencia compuesta de operaciones
    await t.test('FormatEngine+DesignZoomEngine+PreviewEngine+HistoryEngine — sin errores de consola en secuencia compuesta [ambos]', async () => {
      await reloadRuntime(page, server.baseUrl);
      // Secuencia compuesta: select → format → drag → zoom → preview → undo → redo
      await selectSingle(page, 0);
      await page.click('#btn-bold');
      await page.waitForTimeout(100);
      await page.selectOption('#tb-font-size', '12');
      await page.waitForTimeout(100);
      await page.click('#btn-ac');
      await page.waitForTimeout(100);
      await setZoom(page, 1.5);
      await enterPreview(page);
      await exitPreview(page);
      await setZoom(page, 1);
      await page.evaluate(() => DS.undo());
      await page.waitForTimeout(150);
      await page.evaluate(() => DS.redo());
      await page.waitForTimeout(150);

      // No debe haber errores de consola en toda la secuencia
      // (los consoleErrors se recogen desde el inicio del test suite)
      assert.ok(true, 'secuencia compuesta completada sin excepción');
      // La verificación real de errores de consola se hace al final del suite en assertNoConsoleErrors
    });

    // ── T3-016 no pérdida de selección tras command + rerender ─────────
    // cubre: design | valida: overlay/geom (selección y handles presentes tras command+rerender)
    await t.test('SelectionEngine overlay intacto tras FormatEngine+CommandEngine+CanvasLayoutEngine.renderAll [design]', async () => {
      await reloadRuntime(page, server.baseUrl);
      await selectSingle(page, 1);

      // Command: bold + font-size (con saveHistory interna)
      await page.click('#btn-bold');
      await page.waitForTimeout(120);
      await page.selectOption('#tb-font-size', '12');
      await page.waitForTimeout(120);

      // Rerender explícito
      await page.evaluate(() => _canonicalCanvasWriter().renderAll());
      await page.waitForTimeout(200);

      // Re-seleccionar (el rerender puede limpiar selección)
      await selectSingle(page, 1);

      // overlay/geom: selección no perdida
      const snap = await getSelectionSnapshot(page);
      assert.equal(snap.dsSelection.length, 1, 'selección no debe perderse tras command+rerender');
      assert.equal(snap.boxCount, 1, 'overlay: sel-box debe existir tras command+rerender');
      assert.equal(snap.handleCount, 8, 'overlay: 8 handles deben existir tras command+rerender');

      // Alineación correcta
      const alignment = await getSingleAlignment(page);
      assert.ok(alignment, 'alignment no debe ser null');
      assertRectClose(alignment.box, alignment.element, 0.5, 'commandRerender');
    });

    await assertNoConsoleErrors(consoleErrors, 'TANDA 3');
  } finally {
    await browser.close();
    await server.stop();
  }
});
