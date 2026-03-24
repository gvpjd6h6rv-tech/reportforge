/**
 * TANDA 6 — STABILITY-001..018
 * History / Commands / Stability / Negative paths
 * No mocks. Runtime real en /
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  startRuntimeServer,
  launchRuntimePage,
  reloadRuntime,
  selectSingle,
  selectMulti,
  selectPreviewSingle,
  getSelectionSnapshot,
  getSingleAlignment,
  getMultiBBox,
  assertRectClose,
  setZoom,
  enterPreview,
  exitPreview,
  dragSelectedElement,
  assertNoConsoleErrors,
} from './runtime_harness.mjs';

async function modelOf(page, id) {
  return page.evaluate(elId => {
    const el = DS.getElementById(elId);
    return el ? {
      bold: !!el.bold, italic: !!el.italic, underline: !!el.underline,
      fontSize: el.fontSize, fontFamily: el.fontFamily, align: el.align,
    } : null;
  }, id);
}

test('TANDA 6 — STABILITY-001..018', { timeout: 300000 }, async (t) => {
  const server = await startRuntimeServer();
  const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl);

  try {
    // ── STABILITY-001 ─────────────────────────────────────────────────
    // cubre: design | valida: DS/modelo (undo/redo italic)
    await t.test('STABILITY-001 undo redo italic in design', async () => {
      await reloadRuntime(page, server.baseUrl);
      await selectSingle(page, 1);
      const id = await page.evaluate(() => [...DS.selection][0]);

      await page.click('#btn-italic');
      await page.waitForTimeout(150);
      let m = await modelOf(page, id);
      assert.equal(m.italic, true, 'post-toggle: italic=true');

      await page.evaluate(() => DS.undo());
      await page.waitForTimeout(200);
      m = await modelOf(page, id);
      assert.equal(m.italic, false, 'post-undo: italic=false');

      await page.evaluate(() => DS.redo());
      await page.waitForTimeout(200);
      m = await modelOf(page, id);
      assert.equal(m.italic, true, 'post-redo: italic=true');
    });

    // ── STABILITY-002 ─────────────────────────────────────────────────
    // cubre: design | valida: DS/modelo (undo/redo underline)
    await t.test('STABILITY-002 undo redo underline in design', async () => {
      await reloadRuntime(page, server.baseUrl);
      await selectSingle(page, 1);
      const id = await page.evaluate(() => [...DS.selection][0]);

      await page.click('#btn-underline');
      await page.waitForTimeout(150);
      let m = await modelOf(page, id);
      assert.equal(m.underline, true, 'post-toggle: underline=true');

      await page.evaluate(() => DS.undo());
      await page.waitForTimeout(200);
      m = await modelOf(page, id);
      assert.equal(m.underline, false, 'post-undo: underline=false');

      await page.evaluate(() => DS.redo());
      await page.waitForTimeout(200);
      m = await modelOf(page, id);
      assert.equal(m.underline, true, 'post-redo: underline=true');
    });

    // ── STABILITY-003 ─────────────────────────────────────────────────
    // cubre: design | valida: DS/modelo (undo/redo font-family)
    await t.test('STABILITY-003 undo redo font-family in design', async () => {
      await reloadRuntime(page, server.baseUrl);
      await selectSingle(page, 1);
      const id = await page.evaluate(() => [...DS.selection][0]);
      const original = (await modelOf(page, id)).fontFamily; // Arial

      await page.selectOption('#tb-font-name', 'Courier New');
      await page.waitForTimeout(150);
      let m = await modelOf(page, id);
      assert.equal(m.fontFamily, 'Courier New', 'post-change: fontFamily=Courier New');

      await page.evaluate(() => DS.undo());
      await page.waitForTimeout(200);
      m = await modelOf(page, id);
      assert.equal(m.fontFamily, original, `post-undo: fontFamily=${original}`);

      await page.evaluate(() => DS.redo());
      await page.waitForTimeout(200);
      m = await modelOf(page, id);
      assert.equal(m.fontFamily, 'Courier New', 'post-redo: fontFamily=Courier New');
    });

    // ── STABILITY-004 ─────────────────────────────────────────────────
    // cubre: design | valida: DS/modelo (undo/redo align command)
    await t.test('STABILITY-004 undo redo align command in design when available', async () => {
      await reloadRuntime(page, server.baseUrl);
      await selectSingle(page, 1);
      const id = await page.evaluate(() => [...DS.selection][0]);

      // Cambiar align a center
      await page.click('#btn-ac');
      await page.waitForTimeout(150);
      let m = await modelOf(page, id);
      assert.equal(m.align, 'center', 'post-change: align=center');

      await page.evaluate(() => DS.undo());
      await page.waitForTimeout(200);
      m = await modelOf(page, id);
      assert.equal(m.align, 'left', 'post-undo: align=left (original)');

      await page.evaluate(() => DS.redo());
      await page.waitForTimeout(200);
      m = await modelOf(page, id);
      assert.equal(m.align, 'center', 'post-redo: align=center');
    });

    // ── STABILITY-005 ─────────────────────────────────────────────────
    // cubre: design | valida: DS/modelo (dos commands consecutivos no duplican history)
    await t.test('STABILITY-005 consecutive commands do not duplicate history snapshots', async () => {
      await reloadRuntime(page, server.baseUrl);
      await selectSingle(page, 1);

      const histBefore = await page.evaluate(() => DS.historyIndex);

      // Dos operaciones de formato consecutivas
      await page.click('#btn-bold');
      await page.waitForTimeout(120);
      await page.click('#btn-italic');
      await page.waitForTimeout(120);

      const histAfter = await page.evaluate(() => DS.historyIndex);

      // historyIndex debe avanzar exactamente 2 (una por operación)
      assert.equal(
        histAfter, histBefore + 2,
        `historyIndex debe avanzar en 2 (obtenido: antes=${histBefore}, después=${histAfter})`,
      );
    });

    // ── STABILITY-006 ─────────────────────────────────────────────────
    // cubre: design | valida: DS/modelo + DOM (delete + undo restaura elemento y overlay)
    await t.test('STABILITY-006 delete then undo restores selection and overlay', async () => {
      await reloadRuntime(page, server.baseUrl);
      const countBefore = await page.evaluate(() => DS.elements.length);
      await selectSingle(page, 1);
      const deletedId = await page.evaluate(() => [...DS.selection][0]);

      // Delete
      await page.evaluate(() => CommandEngine.delete());
      await page.waitForTimeout(200);
      let count = await page.evaluate(() => DS.elements.length);
      assert.equal(count, countBefore - 1, 'post-delete: count debe decrementar');

      // Undo
      await page.evaluate(() => DS.undo());
      await page.waitForTimeout(300);
      // Forzar re-render del DOM tras undo
      await page.evaluate(() => _canonicalCanvasWriter().renderAll());
      await page.waitForTimeout(200);

      // DS/modelo: elemento debe estar de vuelta
      count = await page.evaluate(() => DS.elements.length);
      assert.equal(count, countBefore, 'post-undo: elemento debe estar de vuelta en DS.elements');

      const found = await page.evaluate(id => !!DS.getElementById(id), deletedId);
      assert.equal(found, true, `post-undo: DS debe tener el elemento ${deletedId}`);

      // Overlay: re-seleccionar y verificar
      await selectSingle(page, 1);
      const snap = await getSelectionSnapshot(page);
      assert.equal(snap.boxCount, 1, 'post-undo: overlay debe existir tras re-selección');
      assert.equal(snap.handleCount, 8, 'post-undo: handles deben existir');
    });

    // ── STABILITY-007 ─────────────────────────────────────────────────
    // cubre: design | valida: DS/modelo (duplicate + undo restaura estado pre-duplicado)
    await t.test('STABILITY-007 duplicate then undo restores pre-duplicate state when available', async () => {
      await reloadRuntime(page, server.baseUrl);
      const countBefore = await page.evaluate(() => DS.elements.length);
      await selectSingle(page, 1);

      // Duplicate via copy+paste
      await page.evaluate(() => { CommandEngine.copy(); CommandEngine.paste(); });
      await page.waitForTimeout(200);

      let count = await page.evaluate(() => DS.elements.length);
      assert.equal(count, countBefore + 1, 'post-paste: debe haber 1 elemento más');

      // Undo paste
      await page.evaluate(() => DS.undo());
      await page.waitForTimeout(200);

      count = await page.evaluate(() => DS.elements.length);
      assert.equal(count, countBefore, 'post-undo: count debe volver al original');
    });

    // ── STABILITY-008 ─────────────────────────────────────────────────
    // cubre: design | valida: DS/modelo (align command preserva multiselección)
    await t.test('STABILITY-008 align command preserves multiselect state', async () => {
      await reloadRuntime(page, server.baseUrl);
      await selectMulti(page, 0, 1);

      let snap = await getSelectionSnapshot(page);
      assert.equal(snap.dsSelection.length, 2, 'pre: 2 elementos seleccionados');

      // Aplicar alignLefts
      await page.evaluate(() => CommandEngine.alignLefts());
      await page.waitForTimeout(200);

      // DS/modelo: selección debe persistir tras el command
      snap = await getSelectionSnapshot(page);
      assert.equal(snap.dsSelection.length, 2, 'post-align: DS.selection debe mantener 2 elementos');
      assert.equal(snap.boxCount, 1, 'overlay: sel-box debe existir tras align');
    });

    // ── STABILITY-009 ─────────────────────────────────────────────────
    // cubre: design | valida: DS/modelo (multiselect format sobrevive a renderAll)
    await t.test('STABILITY-009 multiselect format survives rerender', async () => {
      await reloadRuntime(page, server.baseUrl);
      await selectMulti(page, 1, 2);
      const ids = await page.evaluate(() => [...DS.selection]);

      // Aplicar bold a la multiselección
      await page.click('#btn-bold');
      await page.waitForTimeout(150);

      // Forzar rerender
      await page.evaluate(() => _canonicalCanvasWriter().renderAll());
      await page.waitForTimeout(200);

      // DS/modelo: ambos elementos deben seguir con bold=true
      for (const id of ids) {
        const m = await modelOf(page, id);
        assert.equal(m.bold, true, `modelo: ${id} debe tener bold=true tras rerender`);
      }
    });

    // ── STABILITY-010 ─────────────────────────────────────────────────
    // cubre: ambos | valida: DS/modelo + DOM (multiselect fontSize sobrevive a preview enter/exit)
    await t.test('STABILITY-010 multiselect font-size survives preview enter exit', async () => {
      await reloadRuntime(page, server.baseUrl);
      await selectMulti(page, 1, 2);
      const ids = await page.evaluate(() => [...DS.selection]);

      // Aplicar fontSize=12 a ambos
      await page.selectOption('#tb-font-size', '12');
      await page.waitForTimeout(150);

      // Entrar preview y verificar pv-els
      await enterPreview(page);
      const pvSizes = await page.evaluate(elIds => {
        return elIds.map(id => {
          const pvEl = document.querySelector(`#preview-content .pv-el[data-origin-id="${id}"]`);
          return pvEl ? { id, fontSize: getComputedStyle(pvEl).fontSize } : { id, missing: true };
        });
      }, ids);

      for (const pv of pvSizes) {
        assert.ok(!pv.missing, `pv-el para ${pv.id} debe existir`);
        const px = parseFloat(pv.fontSize);
        // 12pt ≈ 16px a 96dpi/72pt — debe ser > 12px
        assert.ok(px > 12, `pv-el ${pv.id}: fontSize (${pv.fontSize}) debe reflejar 12pt`);
      }

      await exitPreview(page);

      // DS/modelo: ambos deben seguir con fontSize=12
      for (const id of ids) {
        const m = await modelOf(page, id);
        assert.equal(m.fontSize, 12, `modelo: ${id} debe tener fontSize=12 tras preview`);
      }
    });

    // ── STABILITY-011 ─────────────────────────────────────────────────
    // cubre: design | valida: ausencia de crash (command sin selección no rompe runtime)
    await t.test('STABILITY-011 no-selection command path does not break runtime', async () => {
      await reloadRuntime(page, server.baseUrl);
      // Sin selección
      const emptySel = await page.evaluate(() => [...DS.selection].length);
      assert.equal(emptySel, 0, 'pre: selección vacía');

      const countBefore = await page.evaluate(() => DS.elements.length);

      // Commands que deben ser no-op con selección vacía
      await page.evaluate(() => {
        CommandEngine.delete();   // no debe eliminar nada
        CommandEngine.copy();     // no debe hacer nada
        CommandEngine.selectAll();
        DS.clearSelectionState();
      });
      await page.waitForTimeout(200);

      const countAfter = await page.evaluate(() => DS.elements.length);
      assert.equal(countAfter, countBefore, 'elemento count no debe cambiar');

      // El runtime debe seguir funcional: se puede seleccionar un elemento
      await selectSingle(page, 0);
      const snap = await getSelectionSnapshot(page);
      assert.equal(snap.dsSelection.length, 1, 'runtime sigue funcional: puede seleccionar tras no-op commands');
    });

    // ── STABILITY-012 ─────────────────────────────────────────────────
    // cubre: design | valida: estado visual (toggles rápidos de format no dejan toolbar inconsistente)
    await t.test('STABILITY-012 rapid format toggles keep toolbar state consistent', async () => {
      await reloadRuntime(page, server.baseUrl);
      await selectSingle(page, 1);
      const id = await page.evaluate(() => [...DS.selection][0]);

      // 6 toggles rápidos de bold (par → estado final = false)
      for (let i = 0; i < 6; i++) {
        await page.click('#btn-bold');
        await page.waitForTimeout(60);
      }
      await page.waitForTimeout(150);

      // Estado final: 6 toggles desde false → false
      const m = await modelOf(page, id);
      const toolbar = await page.evaluate(() => ({
        bold: document.getElementById('btn-bold')?.classList.contains('active') || false,
      }));

      // DS/modelo y toolbar deben coincidir (sin desincronización)
      assert.equal(m.bold, false, 'modelo: 6 toggles → bold debe ser false');
      assert.equal(toolbar.bold, false, 'toolbar: debe coincidir con modelo (bold=false)');
    });

    // ── STABILITY-013 ─────────────────────────────────────────────────
    // cubre: design | valida: DS/modelo + overlay/geom (zoom repetido no desincroniza DS y UI)
    await t.test('STABILITY-013 rapid zoom widget changes keep DS and UI in sync', async () => {
      await reloadRuntime(page, server.baseUrl);
      await selectSingle(page, 0);

      // Cambios de zoom repetidos
      const zoomSequence = [0.5, 1.5, 2.0, 0.75, 1.0];
      for (const z of zoomSequence) {
        await setZoom(page, z);
      }
      await page.waitForTimeout(200);

      // DS/modelo: DS.zoom debe coincidir con el último zoom seteado
      const finalZoom = await page.evaluate(() => DS.zoom);
      assert.equal(finalZoom, 1.0, `DS.zoom debe ser 1.0 (último valor), obtenido ${finalZoom}`);

      // overlay/geom: sel-box alineado con el elemento
      const alignment = await getSingleAlignment(page);
      assert.ok(alignment, 'alignment no debe ser null');
      assertRectClose(alignment.box, alignment.element, 0.5, 'rapidZoomSync');
    });

    // ── STABILITY-014 ─────────────────────────────────────────────────
    // cubre: ambos | valida: DOM (preview enter/exit repetido no duplica nodos)
    await t.test('STABILITY-014 repeated preview enter exit does not duplicate nodes', async () => {
      await reloadRuntime(page, server.baseUrl);
      const countBefore = await getSelectionSnapshot(page);
      const elemBefore = countBefore.elementCount;

      // 5 ciclos enter/exit sin selección
      for (let i = 0; i < 5; i++) {
        await enterPreview(page);
        await exitPreview(page);
      }

      const countAfter = await getSelectionSnapshot(page);

      // DOM: elemento count debe ser idéntico (no hay clones)
      assert.equal(
        countAfter.elementCount, elemBefore,
        `DOM: elemento count debe ser ${elemBefore}, obtenido ${countAfter.elementCount}`,
      );
      assert.equal(
        countAfter.uniqueElementIds, elemBefore,
        'DOM: unique IDs debe coincidir (sin duplicados)',
      );
    });

    // ── STABILITY-015 ─────────────────────────────────────────────────
    // cubre: ambos | valida: ausencia de console errors (secuencia larga de commands)
    await t.test('STABILITY-015 no console errors during long command sequence', async () => {
      await reloadRuntime(page, server.baseUrl);
      // Secuencia larga: select → bold → italic → underline → font-size → font-family
      // → align-center → copy → paste → delete-copy → undo → zoom → preview → exit
      await selectSingle(page, 0);
      await page.click('#btn-bold');
      await page.waitForTimeout(80);
      await page.click('#btn-italic');
      await page.waitForTimeout(80);
      await page.click('#btn-underline');
      await page.waitForTimeout(80);
      await page.selectOption('#tb-font-size', '12');
      await page.waitForTimeout(80);
      await page.selectOption('#tb-font-name', 'Verdana');
      await page.waitForTimeout(80);
      await page.click('#btn-ac');
      await page.waitForTimeout(80);

      await page.evaluate(() => { CommandEngine.copy(); CommandEngine.paste(); });
      await page.waitForTimeout(150);
      await page.evaluate(() => CommandEngine.delete());
      await page.waitForTimeout(150);
      await page.evaluate(() => DS.undo());
      await page.waitForTimeout(150);

      await setZoom(page, 1.5);
      await enterPreview(page);
      await exitPreview(page);
      await setZoom(page, 1);

      // La verificación de no-console-errors se hace con assertNoConsoleErrors al final del suite
      // Aquí verificamos que el runtime sigue funcional
      const snap = await getSelectionSnapshot(page);
      assert.ok(snap.elementCount > 0, 'runtime debe seguir funcional con elementos en el canvas');
    });

    // ── STABILITY-016 ─────────────────────────────────────────────────
    // cubre: ambos | valida: DS/modelo + DOM (field explorer insert + format + preview)
    await t.test('STABILITY-016 field explorer insert format preview keeps state consistent', async () => {
      await reloadRuntime(page, server.baseUrl);
      const countBefore = await page.evaluate(() => DS.elements.length);

      // Insertar nuevo campo via FieldExplorerEngine._insertField
      const newId = await page.evaluate(() => {
        const field = { path: 'cliente.email', vtype: 'string', label: 'Email' };
        FieldExplorerEngine._insertField(field);
        return [...DS.selection][0]; // El nuevo elemento queda seleccionado
      });
      await page.waitForTimeout(200);

      assert.ok(newId, 'nuevo elemento debe existir en DS');
      const countAfter = await page.evaluate(() => DS.elements.length);
      assert.equal(countAfter, countBefore + 1, 'DS.elements debe tener 1 elemento más');

      // Aplicar formato al nuevo elemento
      await page.click('#btn-bold');
      await page.waitForTimeout(150);
      await page.selectOption('#tb-font-size', '10');
      await page.waitForTimeout(150);

      const m = await modelOf(page, newId);
      assert.equal(m.bold, true,  `nuevo elemento: bold=true`);
      assert.equal(m.fontSize, 10, `nuevo elemento: fontSize=10`);

      // Entrar preview y verificar que el pv-el refleja el formato
      await enterPreview(page);
      const pvStyle = await page.evaluate(id => {
        const pvEl = document.querySelector(`#preview-content .pv-el[data-origin-id="${id}"]`);
        return pvEl ? { fontWeight: getComputedStyle(pvEl).fontWeight } : null;
      }, newId);
      assert.ok(pvStyle, 'pv-el del nuevo campo debe existir en preview');
      assert.ok(
        pvStyle.fontWeight === '700' || pvStyle.fontWeight === 'bold',
        `pv-el: fontWeight debe ser bold, obtenido '${pvStyle.fontWeight}'`,
      );
      await exitPreview(page);
    });

    // ── STABILITY-017 ─────────────────────────────────────────────────
    // cubre: design | valida: estado visual (properties panel refleja cambio de formato)
    await t.test('STABILITY-017 properties panel reflects formatting change when applicable', async () => {
      await reloadRuntime(page, server.baseUrl);
      await selectSingle(page, 1);

      // Cambiar fontSize → PropertiesEngine.render() debe actualizar #prop-font-size
      await page.selectOption('#tb-font-size', '14');
      await page.waitForTimeout(150);

      // El properties panel (#prop-font-size) debe mostrar 14
      const propFontSize = await page.evaluate(() => {
        const el = document.getElementById('prop-font-size');
        return el ? el.value : null;
      });
      assert.ok(propFontSize !== null, '#prop-font-size debe existir (PropertiesEngine renderizado)');
      assert.equal(propFontSize, '14', `#prop-font-size debe mostrar 14, obtenido '${propFontSize}'`);

      // Cambiar fontFamily → #prop-font-family debe actualizarse
      await page.selectOption('#tb-font-name', 'Verdana');
      await page.waitForTimeout(150);

      const propFontFamily = await page.evaluate(() => {
        const el = document.getElementById('prop-font-family');
        return el ? el.value : null;
      });
      assert.ok(propFontFamily !== null, '#prop-font-family debe existir');
      assert.equal(propFontFamily, 'Verdana', `#prop-font-family debe mostrar Verdana, obtenido '${propFontFamily}'`);
    });

    // ── STABILITY-018 ─────────────────────────────────────────────────
    // cubre: ambos | valida: DS/modelo + overlay/geom (secuencia compuesta larga sin drift)
    await t.test('STABILITY-018 long mixed sequence ends without drift', async () => {
      await reloadRuntime(page, server.baseUrl);
      // e102: x=4, y=22
      await selectSingle(page, 1);
      const id = await page.evaluate(() => [...DS.selection][0]);

      // Aplicar formato
      await page.click('#btn-bold');
      await page.waitForTimeout(100);
      await page.click('#btn-italic');
      await page.waitForTimeout(100);
      await page.selectOption('#tb-font-size', '14');
      await page.waitForTimeout(100);

      // Drag: dx=20, dy=14 → (24, 36) ÷4 ✓ para e102 en y=22
      await dragSelectedElement(page, 20, 14);
      await page.waitForTimeout(100);

      // Zoom
      await setZoom(page, 1.5);

      // Preview enter/exit
      await enterPreview(page);
      await exitPreview(page);

      // Volver a zoom base
      await setZoom(page, 1);

      // Undo del drag (el último cambio en el historial)
      await page.evaluate(() => DS.undo());
      await page.waitForTimeout(200);

      // DS.undo() no dispara re-render de DOM; actualizamos posiciones manualmente
      // y re-seleccionamos vía DS para evitar que e102 (en DOM aún desplazado) se superponga a e103
      await page.evaluate((elId) => {
        ElementLayoutEngine.update();
        DS.selectOnly(elId);
        SelectionEngine.renderHandles();
      }, id);
      await page.waitForTimeout(300);

      // DS/modelo: bold y italic deben seguir activos (sólo el drag fue undone)
      // fontSize=14 también debe permanecer (el drag fue lo último guardado)
      const m = await modelOf(page, id);
      assert.equal(m.bold,   true, 'secuencia: bold debe seguir activo tras undo-drag');
      assert.equal(m.italic, true, 'secuencia: italic debe seguir activo tras undo-drag');
      assert.equal(m.fontSize, 14,  'secuencia: fontSize=14 debe permanecer tras undo-drag');

      // overlay/geom: sel-box alineado sin drift
      const alignment = await getSingleAlignment(page);
      assert.ok(alignment, 'alignment no debe ser null al final de la secuencia');
      assertRectClose(alignment.box, alignment.element, 0.5, 'longSequenceNoDrift');

      // DOM: sin elementos duplicados
      const snap = await getSelectionSnapshot(page);
      assert.equal(snap.uniqueElementIds, snap.elementCount, 'DOM: no hay IDs duplicados');
    });

    await assertNoConsoleErrors(consoleErrors, 'TANDA 6 STABILITY');
  } finally {
    await browser.close();
    await server.stop();
  }
});
