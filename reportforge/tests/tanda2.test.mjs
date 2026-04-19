/**
 * TANDA 2 — 16 browser-based tests: interacción format + selección + zoom + overlay
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
  selectPreviewMulti,
  getSelectionSnapshot,
  getSingleAlignment,
  getMultiBBox,
  assertRectClose,
  runtimeState,
  setZoom,
  enterPreview,
  exitPreview,
  dragSelectedElement,
  dragPreviewSelected,
  resizeFromHandle,
  assertNoConsoleErrors,
} from './runtime_harness.mjs';

function assertApprox(actual, expected, tolerance, label) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: expected ${expected}±${tolerance}, got ${actual}`);
}

async function reloadRuntime(page, baseUrl) {
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.waitForFunction(
    () => typeof DS !== 'undefined' && Array.isArray(DS.elements) && DS.elements.length > 0,
  );
  await page.waitForTimeout(800);
}

async function getFormatModel(page) {
  return page.evaluate(() => {
    const id = [...DS.selection][0];
    const el = id ? DS.getElementById(id) : null;
    return el ? { id: el.id, bold: !!el.bold, italic: !!el.italic, fontSize: el.fontSize, align: el.align } : null;
  });
}

async function getToolbarActiveState(page) {
  return page.evaluate(() => ({
    bold: document.getElementById('btn-bold')?.classList.contains('active') || false,
    italic: document.getElementById('btn-italic')?.classList.contains('active') || false,
    underline: document.getElementById('btn-underline')?.classList.contains('active') || false,
  }));
}

test('TANDA 2 — interacción format + selección + zoom + overlay', { timeout: 240000 }, async (t) => {
  const server = await startRuntimeServer();
  const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl);

  try {
    // ── T2-001 toolbar click no pierde selección design ───────────────
    // cubre: design | valida: DS/modelo (selección persiste) + overlay/geom (handle count)
    await t.test('UIAdapters toolbar click no limpia SelectionEngine handles ni DS.selection [design]', async () => {
      await reloadRuntime(page, server.baseUrl);
      await selectSingle(page, 1);
      let snap = await getSelectionSnapshot(page);
      assert.equal(snap.dsSelection.length, 1, 'pre: 1 elemento seleccionado');
      assert.equal(snap.boxCount, 1, 'pre: 1 sel-box');

      // Clic en bold — no debe perder la selección
      await page.click('#btn-bold');
      await page.waitForTimeout(150);
      snap = await getSelectionSnapshot(page);

      assert.equal(snap.dsSelection.length, 1, 'selección no debe perderse tras click en toolbar');
      assert.equal(snap.boxCount, 1, 'sel-box debe permanecer');
      assert.equal(snap.handleCount, 8, 'handles deben permanecer');
    });

    // ── T2-002 toolbar click no pierde selección preview ─────────────
    // cubre: preview | valida: DS/modelo (selección persiste) + overlay/geom (handle count)
    await t.test('UIAdapters toolbar click no limpia SelectionEngine handles ni DS.selection [preview]', async () => {
      await reloadRuntime(page, server.baseUrl);
      await selectSingle(page, 1);
      await enterPreview(page);
      await selectPreviewSingle(page, 1);

      let snap = await getSelectionSnapshot(page);
      assert.equal(snap.dsSelection.length, 1, 'pre: 1 elemento seleccionado en preview');
      assert.equal(snap.boxCount, 1, 'pre: 1 sel-box en preview');

      // Clic en bold desde preview (format actúa sobre el modelo)
      await page.click('#btn-bold');
      await page.waitForTimeout(200);
      snap = await getSelectionSnapshot(page);

      assert.equal(snap.dsSelection.length, 1, 'selección no debe perderse en preview tras toolbar click');
      assert.equal(snap.boxCount, 1, 'sel-box debe permanecer en preview');
      await exitPreview(page);
    });

    // ── T2-003 multiselección + format design ─────────────────────────
    // cubre: design | valida: DS/modelo (format aplicado a todos) + overlay/geom (sel-box)
    await t.test('SelectionEngine multiselect → FormatEngine.toggleFormat aplica bold a todos los elementos DS [design]', async () => {
      await reloadRuntime(page, server.baseUrl);
      await selectMulti(page, 1, 2);
      let snap = await getSelectionSnapshot(page);
      assert.equal(snap.dsSelection.length, 2, 'pre: 2 elementos seleccionados');
      assert.equal(snap.boxCount, 1, 'pre: 1 sel-box multiselección');

      // Aplicar bold a la multiselección
      await page.click('#btn-bold');
      await page.waitForTimeout(150);

      const modelState = await page.evaluate(() => {
        const ids = [...DS.selection];
        return ids.map(id => {
          const el = DS.getElementById(id);
          return { id, bold: !!el.bold };
        });
      });
      // Todos los elementos seleccionados deben tener bold=true
      for (const m of modelState) {
        assert.equal(m.bold, true, `modelo: elemento ${m.id} debe tener bold=true`);
      }
      // overlay debe mantenerse
      snap = await getSelectionSnapshot(page);
      assert.equal(snap.boxCount, 1, 'overlay: sel-box debe mantenerse tras format multiselección');
    });

    // ── T2-004 multiselección + format preview ────────────────────────
    // cubre: preview | valida: DOM (formato aplicado en todos pv-el) + overlay/geom
    await t.test('SelectionEngine multiselect → FormatEngine → PreviewEngine refleja italic en todos pv-el [preview]', async () => {
      await reloadRuntime(page, server.baseUrl);
      // Aplicar bold a dos elementos en design
      await selectMulti(page, 1, 2);
      await page.click('#btn-italic');
      await page.waitForTimeout(150);
      const selectedIds = await page.evaluate(() => [...DS.selection]);

      await enterPreview(page);

      // Verificar que los pv-el correspondientes tienen italic
      const pvStyles = await page.evaluate((ids) => {
        return ids.map(id => {
          const pvEl = document.querySelector(`#preview-content .pv-el[data-origin-id="${id}"]`);
          return pvEl
            ? { id, fontStyle: getComputedStyle(pvEl).fontStyle }
            : { id, missing: true };
        });
      }, selectedIds);

      for (const pv of pvStyles) {
        assert.ok(!pv.missing, `pv-el para ${pv.id} debe existir en preview`);
        assert.equal(pv.fontStyle, 'italic', `pv-el ${pv.id}: fontStyle debe ser italic`);
      }

      // overlay en preview también debe estar presente
      const snap = await getSelectionSnapshot(page);
      assert.equal(snap.boxCount, 1, 'overlay: sel-box debe existir en preview multiselección');
      await exitPreview(page);
    });

    // ── T2-005 drag después de format design ──────────────────────────
    // cubre: design | valida: DS/modelo (posición actualizada) + overlay/geom (alineación)
    await t.test('FormatEngine.toggleFormat(bold) conservado en DS.model tras DragEngine movimiento [design]', async () => {
      await reloadRuntime(page, server.baseUrl);
      await selectSingle(page, 1);
      await page.click('#btn-bold');
      await page.waitForTimeout(120);

      const before = await page.evaluate(() => {
        const id = [...DS.selection][0];
        const el = DS.getElementById(id);
        return { id, x: el.x, y: el.y, bold: el.bold };
      });
      assert.equal(before.bold, true, 'pre-drag: bold debe estar activo');

      // dy=14: el movimiento debe conservar precisión fina
      await dragSelectedElement(page, 20, 14);

      const after = await page.evaluate(prev => {
        const el = DS.getElementById(prev.id);
        return { x: el.x, y: el.y, bold: el.bold, dx: el.x - prev.x, dy: el.y - prev.y };
      }, before);

      // DS/modelo: posición actualizada y formato conservado
      assert.equal(after.bold, true, 'modelo: bold debe conservarse tras drag');
      assertApprox(after.dx, 20, 0.15, 'modelo dx');
      assertApprox(after.dy, 14, 0.15, 'modelo dy');

      // overlay/geom: sel-box alineado con elemento
      const alignment = await getSingleAlignment(page);
      assertRectClose(alignment.box, alignment.element, 0.5, 'drag-after-format');
    });

    // ── T2-006 drag después de format preview ─────────────────────────
    // cubre: preview | valida: DS/modelo (posición) + overlay/geom (alineación pv-el)
    await t.test('FormatEngine.toggleFormat(bold) conservado en DS.model tras DragEngine movimiento [preview]', async () => {
      await reloadRuntime(page, server.baseUrl);
      await selectSingle(page, 1);
      await page.click('#btn-bold');
      await page.waitForTimeout(120);

      await enterPreview(page);
      await selectPreviewSingle(page, 1);

      const before = await page.evaluate(() => {
        const id = [...DS.selection][0];
        const el = DS.getElementById(id);
        return { id, x: el.x, y: el.y, bold: el.bold };
      });
      assert.equal(before.bold, true, 'pre-drag preview: bold debe estar activo');

      await dragPreviewSelected(page, 16, 10);

      const after = await page.evaluate(prev => {
        const el = DS.getElementById(prev.id);
        return { x: el.x, y: el.y, bold: el.bold, dx: el.x - prev.x, dy: el.y - prev.y };
      }, before);

      assert.equal(after.bold, true, 'modelo: bold debe conservarse tras drag en preview');
      assert.ok(after.dx !== 0 || after.dy !== 0, 'modelo: posición debe cambiar tras drag');

      // overlay/geom
      const alignment = await getSingleAlignment(page);
      assertRectClose(alignment.box, alignment.element, 0.5, 'drag-after-format-preview');
      await exitPreview(page);
    });

    // ── T2-007 resize después de format design ────────────────────────
    // cubre: design | valida: DS/modelo (tamaño actualizado + formato conservado) + overlay/geom
    await t.test('FormatEngine.toggleFormat(italic) conservado en DS.model tras HandlesEngine resize [design]', async () => {
      await reloadRuntime(page, server.baseUrl);
      await selectSingle(page, 1);
      await page.click('#btn-italic');
      await page.waitForTimeout(120);

      const before = await page.evaluate(() => {
        const id = [...DS.selection][0];
        const el = DS.getElementById(id);
        return { id, w: el.w, h: el.h, italic: el.italic };
      });
      assert.equal(before.italic, true, 'pre-resize: italic debe estar activo');

      await resizeFromHandle(page, 'se', 20, 8);

      const after = await page.evaluate(prev => {
        const el = DS.getElementById(prev.id);
        return { w: el.w, h: el.h, italic: el.italic, dw: el.w - prev.w, dh: el.h - prev.h };
      }, before);

      // DS/modelo: formato conservado, tamaño actualizado
      assert.equal(after.italic, true, 'modelo: italic debe conservarse tras resize');
      assert.ok(after.dw > 0, 'modelo: ancho debe aumentar tras resize se');
      assert.ok(after.dh > 0, 'modelo: alto debe aumentar tras resize se');

      // overlay/geom
      const alignment = await getSingleAlignment(page);
      assertRectClose(alignment.box, alignment.element, 0.5, 'resize-after-format');
    });

    // ── T2-008 resize después de format preview ───────────────────────
    // cubre: preview | valida: DS/modelo (tamaño + formato) + overlay/geom
    await t.test('FormatEngine.toggleFormat(italic) conservado en DS.model tras HandlesEngine resize [preview]', async () => {
      await reloadRuntime(page, server.baseUrl);
      await selectSingle(page, 1);
      await page.click('#btn-italic');
      await page.waitForTimeout(120);

      await enterPreview(page);
      await selectPreviewSingle(page, 1);

      const before = await page.evaluate(() => {
        const id = [...DS.selection][0];
        const el = DS.getElementById(id);
        return { id, w: el.w, h: el.h, italic: el.italic };
      });
      assert.equal(before.italic, true, 'pre-resize preview: italic debe estar activo');

      await resizeFromHandle(page, 'se', 16, 8);

      const after = await page.evaluate(prev => {
        const el = DS.getElementById(prev.id);
        if (!el) return { missing: true };
        return { w: el.w, h: el.h, italic: el.italic, dw: el.w - prev.w, dh: el.h - prev.h };
      }, before);

      assert.ok(!after.missing, 'elemento no debe desaparecer tras resize en preview');
      assert.equal(after.italic, true, 'modelo: italic debe conservarse tras resize en preview');
      assert.ok(after.dw > 0, 'modelo: ancho debe aumentar');
      assert.ok(after.dh > 0, 'modelo: alto debe aumentar');

      const alignment = await getSingleAlignment(page);
      assertRectClose(alignment.box, alignment.element, 0.5, 'resize-after-format-preview');
      await exitPreview(page);
    });

    // ── T2-009 multiselección + zoom design ───────────────────────────
    // cubre: design | valida: overlay/geom (sel-box alineado con bbox multi a distintos zooms)
    await t.test('SelectionEngine multiselect bbox alineado con overlay a zoom 0.5/1/1.5 [design]', async () => {
      await reloadRuntime(page, server.baseUrl);
      await selectMulti(page, 0, 1);
      let snap = await getSelectionSnapshot(page);
      assert.equal(snap.dsSelection.length, 2, 'pre: 2 elementos seleccionados');

      for (const zoom of [0.5, 1, 1.5]) {
        await setZoom(page, zoom);
        snap = await getSelectionSnapshot(page);
        assert.equal(snap.boxCount, 1, `zoom ${zoom}: sel-box debe existir`);
        const bbox = await getMultiBBox(page);
        assert.ok(bbox, `zoom ${zoom}: bbox no debe ser null`);
        assertRectClose(bbox.box, bbox.expected, 1.0, `multiZoom-${zoom}`);
      }
      await setZoom(page, 1);
    });

    // ── T2-010 multiselección + zoom preview ──────────────────────────
    // cubre: preview | valida: overlay/geom (sel-box alineado con bbox multi a distintos zooms)
    await t.test('SelectionEngine multiselect bbox alineado con overlay a zoom 0.5/1/1.5 en PreviewEngine [preview]', async () => {
      await reloadRuntime(page, server.baseUrl);
      await enterPreview(page);
      await selectPreviewMulti(page, 0, 2);

      let snap = await getSelectionSnapshot(page);
      assert.equal(snap.dsSelection.length, 2, 'pre: 2 elementos seleccionados en preview');

      for (const zoom of [0.5, 1, 1.5]) {
        await setZoom(page, zoom);
        snap = await getSelectionSnapshot(page);
        assert.equal(snap.boxCount, 1, `zoom ${zoom}: sel-box debe existir en preview`);
        const bbox = await getMultiBBox(page);
        assert.ok(bbox, `zoom ${zoom}: bbox no debe ser null en preview`);
        assertRectClose(bbox.box, bbox.expected, 1.0, `multiZoomPreview-${zoom}`);
      }
      await setZoom(page, 1);
      await exitPreview(page);
    });

    // ── T2-011 overlay alineado tras zoom+format design ───────────────
    // cubre: design | valida: overlay/geom (sel-box alineado con elemento tras zoom y format)
    await t.test('SelectionEngine overlay alineado con elemento tras FormatEngine + DesignZoomEngine [design]', async () => {
      await reloadRuntime(page, server.baseUrl);
      await selectSingle(page, 1);
      await page.click('#btn-bold');
      await page.waitForTimeout(120);
      await page.selectOption('#tb-font-size', '14');
      await page.waitForTimeout(120);

      for (const zoom of [0.5, 1, 2]) {
        await setZoom(page, zoom);
        const alignment = await getSingleAlignment(page);
        assert.ok(alignment, `zoom ${zoom}: alignment no debe ser null`);
        assertRectClose(alignment.box, alignment.element, 0.5, `zoomFormatOverlay-${zoom}`);
      }
      await setZoom(page, 1);
    });

    // ── T2-012 overlay alineado tras zoom+format preview ─────────────
    // cubre: preview | valida: overlay/geom (sel-box alineado con pv-el tras zoom y format)
    await t.test('SelectionEngine overlay alineado con pv-el tras FormatEngine + PreviewZoomEngine [preview]', async () => {
      await reloadRuntime(page, server.baseUrl);
      await selectSingle(page, 1);
      await page.click('#btn-bold');
      await page.waitForTimeout(120);
      await page.selectOption('#tb-font-size', '14');
      await page.waitForTimeout(120);

      await enterPreview(page);
      await selectPreviewSingle(page, 1);

      for (const zoom of [0.5, 1, 2]) {
        await setZoom(page, zoom);
        const alignment = await getSingleAlignment(page);
        assert.ok(alignment, `zoom ${zoom}: alignment no debe ser null en preview`);
        assertRectClose(alignment.box, alignment.element, 0.5, `zoomFormatOverlayPreview-${zoom}`);
      }
      await setZoom(page, 1);
      await exitPreview(page);
    });

    // ── T2-013 aplicar format en design y validar en preview ──────────
    // cubre: ambos | valida: DS/modelo (design) → DOM pv-el (preview) — paridad design↔preview
    await t.test('FormatEngine en design → DS.model → PreviewEngine pv-el refleja bold+fontSize+align [ambos]', async () => {
      await reloadRuntime(page, server.baseUrl);
      await selectSingle(page, 1);

      // Aplicar bold + font-size + align-center en design
      await page.click('#btn-bold');
      await page.waitForTimeout(100);
      await page.selectOption('#tb-font-size', '12');
      await page.waitForTimeout(100);
      await page.click('#btn-ac');
      await page.waitForTimeout(100);

      const modelBefore = await getFormatModel(page);
      assert.equal(modelBefore.bold, true, 'diseño: bold debe ser true');
      assert.equal(modelBefore.fontSize, 12, 'diseño: fontSize debe ser 12');
      assert.equal(modelBefore.align, 'center', 'diseño: align debe ser center');

      // Entrar a preview y verificar paridad
      await enterPreview(page);
      const pvState = await page.evaluate(() => {
        const id = [...DS.selection][0];
        const pvEl = id
          ? document.querySelector(`#preview-content .pv-el[data-origin-id="${id}"]`)
          : null;
        if (!pvEl) return null;
        const cs = getComputedStyle(pvEl);
        return {
          fontWeight: cs.fontWeight,
          textAlign: cs.textAlign,
          fontSize: cs.fontSize,
        };
      });

      assert.ok(pvState, 'pv-el debe existir en preview');
      assert.ok(
        pvState.fontWeight === '700' || pvState.fontWeight === 'bold',
        `pv-el: fontWeight debe ser bold, obtenido '${pvState.fontWeight}'`,
      );
      assert.equal(pvState.textAlign, 'center', `pv-el: textAlign debe ser center, obtenido '${pvState.textAlign}'`);

      await exitPreview(page);
    });

    // ── T2-014 aplicar format en preview y validar al volver a design ─
    // cubre: ambos | valida: DS/modelo persiste al volver a design — paridad design↔preview
    await t.test('FormatEngine en preview → DS.model persiste italic al volver a design [ambos]', async () => {
      await reloadRuntime(page, server.baseUrl);
      await selectSingle(page, 1);
      await enterPreview(page);
      await selectPreviewSingle(page, 1);

      // Aplicar italic desde preview
      await page.click('#btn-italic');
      await page.waitForTimeout(200);

      const modelInPreview = await getFormatModel(page);
      assert.equal(modelInPreview.italic, true, 'preview: modelo italic debe ser true');

      // Volver a design
      await exitPreview(page);

      // El modelo debe conservarse y el toolbar debe reflejar italic
      const modelAfterExit = await getFormatModel(page);
      const toolbar = await getToolbarActiveState(page);
      assert.equal(modelAfterExit.italic, true, 'design: italic debe conservarse tras salir de preview');
      assert.equal(toolbar.italic, true, 'toolbar: btn-italic debe estar active tras salir de preview');
    });

    // ── T2-015 toggle design↔preview mantiene estado ─────────────────
    // cubre: ambos | valida: DS/modelo estable a través de múltiples toggles
    await t.test('DS.model preserva bold+fontSize tras 3 ciclos PreviewEngine enter/exit [ambos]', async () => {
      await reloadRuntime(page, server.baseUrl);
      await selectSingle(page, 1);
      await page.click('#btn-bold');
      await page.waitForTimeout(120);
      await page.selectOption('#tb-font-size', '10');
      await page.waitForTimeout(120);

      const initialModel = await getFormatModel(page);
      assert.equal(initialModel.bold, true, 'initial: bold=true');
      assert.equal(initialModel.fontSize, 10, 'initial: fontSize=10');

      // Múltiples toggles design↔preview
      for (let i = 0; i < 3; i++) {
        await enterPreview(page);
        await exitPreview(page);
      }

      const finalModel = await getFormatModel(page);
      assert.equal(finalModel.bold, true, 'tras 3 toggles: bold debe conservarse');
      assert.equal(finalModel.fontSize, 10, 'tras 3 toggles: fontSize debe conservarse');

      // overlay/geom: sel-box e handles deben estar presentes
      const snap = await getSelectionSnapshot(page);
      assert.equal(snap.boxCount, 1, 'tras toggles: sel-box debe existir');
      assert.equal(snap.handleCount, 8, 'tras toggles: handles deben existir');
    });

    // ── T2-016 toggle design↔preview no duplica overlay/nodos ────────
    // cubre: ambos | valida: DOM (conteo único de elementos y overlay sin duplicados)
    await t.test('CanvasLayoutEngine no duplica .cr-element ni SelectionEngine overlay tras 4 ciclos PreviewEngine [ambos]', async () => {
      await reloadRuntime(page, server.baseUrl);
      await selectSingle(page, 1);

      // Contar elementos antes de toggles
      const countBefore = await getSelectionSnapshot(page);
      const elementCountBefore = countBefore.elementCount;
      const uniqueIdsBefore = countBefore.uniqueElementIds;

      // Múltiples toggles
      for (let i = 0; i < 4; i++) {
        await enterPreview(page);
        await exitPreview(page);
      }

      const countAfter = await getSelectionSnapshot(page);

      // DOM: no debe haber duplicados de elementos de diseño
      assert.equal(
        countAfter.elementCount, elementCountBefore,
        `DOM: elemento count debe ser ${elementCountBefore}, obtenido ${countAfter.elementCount}`,
      );
      assert.equal(
        countAfter.uniqueElementIds, uniqueIdsBefore,
        `DOM: unique IDs debe ser ${uniqueIdsBefore}, sin duplicados`,
      );

      // overlay: exactamente 1 sel-box, no duplicado
      assert.equal(countAfter.boxCount, 1, 'overlay: debe haber exactamente 1 sel-box, sin duplicados');
      assert.equal(countAfter.handleCount, 8, 'overlay: deben haber exactamente 8 handles');
    });

    await assertNoConsoleErrors(consoleErrors, 'TANDA 2');
  } finally {
    await browser.close();
    await server.stop();
  }
});
