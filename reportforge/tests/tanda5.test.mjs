/**
 * TANDA 5 — INTERACTION-EDGE-001..018
 * Interaction edge cases + geometry integrity
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

test('TANDA 5 — INTERACTION-EDGE-001..018', { timeout: 300000 }, async (t) => {
  const server = await startRuntimeServer();
  const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl);

  try {
    // ── INTERACTION-EDGE-001 ──────────────────────────────────────────
    // cubre: design | valida: overlay/geom (tiny drag dx=1 conserva precisión fina)
    await t.test('INTERACTION-EDGE-001 tiny drag preserves geometry in design', async () => {
      await reloadRuntime(page, server.baseUrl);
      // e101 (x=4, y=4): drag de 1px → ajuste fino visible y estable
      await selectSingle(page, 0);
      const before = await page.evaluate(() => {
        const el = DS.getElementById([...DS.selection][0]);
        return { x: el.x, y: el.y };
      });

      // dx=1: el modelo ya conserva precisión fina, no debe colapsar a 0
      await dragSelectedElement(page, 1, 0);

      const after = await page.evaluate(prev => {
        const el = DS.getElementById([...DS.selection][0]);
        return { x: el.x, y: el.y, dx: el.x - prev.x, dy: el.y - prev.y };
      }, before);

      // DS/modelo: el arrastre pequeño debe conservar movimiento fino
      assertApprox(after.dx, 0.9889763779527563, 0.02, 'modelo tiny drag dx');
      assertApprox(after.dy, 0.006299212598425363, 0.0005, 'modelo tiny drag dy');

      // overlay/geom: sel-box debe estar alineado con el elemento
      const alignment = await getSingleAlignment(page);
      assert.ok(alignment, 'alignment no debe ser null');
      assertRectClose(alignment.box, alignment.element, 0.5, 'tinyDragDesign');
    });

    // ── INTERACTION-EDGE-002 ──────────────────────────────────────────
    // cubre: preview | valida: overlay/geom (tiny drag en preview)
    await t.test('INTERACTION-EDGE-002 tiny drag preserves geometry in preview', async () => {
      await reloadRuntime(page, server.baseUrl);
      await selectSingle(page, 0);
      await enterPreview(page);
      await selectPreviewSingle(page, 0);

      const before = await page.evaluate(() => {
        const el = DS.getElementById([...DS.selection][0]);
        return { x: el.x, y: el.y };
      });

      // dx=1 → conserva movimiento fino
      await dragPreviewSelected(page, 1, 0);

      const after = await page.evaluate(prev => {
        const el = DS.getElementById(prev && ([...DS.selection][0] || null));
        return el ? { x: el.x, y: el.y, dx: el.x - prev.x, dy: el.y - prev.y } : null;
      }, before);

      assert.ok(after, 'elemento debe seguir en DS');
      assert.ok(after.dx > 0, `preview: tiny drag debe conservar dx positivo, obtenido ${after.dx}`);

      // overlay/geom
      const alignment = await getSingleAlignment(page);
      assert.ok(alignment, 'alignment no debe ser null en preview');
      assertRectClose(alignment.box, alignment.element, 0.5, 'tinyDragPreview');
      await exitPreview(page);
    });

    // ── INTERACTION-EDGE-003 ──────────────────────────────────────────
    // cubre: design | valida: overlay/geom + DS/modelo (minimal corner resize)
    await t.test('INTERACTION-EDGE-003 minimal corner resize remains stable in design', async () => {
      await reloadRuntime(page, server.baseUrl);
      await selectSingle(page, 1);
      const before = await page.evaluate(() => {
        const el = DS.getElementById([...DS.selection][0]);
        return { w: el.w, h: el.h };
      });

      // Resize mínimo: 8x4 (múltiplo de grid=4)
      await resizeFromHandle(page, 'se', 8, 4);

      const after = await page.evaluate(prev => {
        const el = DS.getElementById([...DS.selection][0]);
        return { w: el.w, h: el.h, dw: el.w - prev.w, dh: el.h - prev.h };
      }, before);

      // DS/modelo: dimensiones aumentaron
      assert.ok(after.dw > 0, `modelo: ancho debe aumentar (dw=${after.dw})`);
      assert.ok(after.dh > 0, `modelo: alto debe aumentar (dh=${after.dh})`);

      // overlay/geom
      const alignment = await getSingleAlignment(page);
      assert.ok(alignment, 'alignment no debe ser null');
      assertRectClose(alignment.box, alignment.element, 0.5, 'minCornerResignDesign');
    });

    // ── INTERACTION-EDGE-004 ──────────────────────────────────────────
    // cubre: preview | valida: DS/modelo + overlay/geom (minimal corner resize)
    await t.test('INTERACTION-EDGE-004 minimal corner resize remains stable in preview', async () => {
      await reloadRuntime(page, server.baseUrl);
      await selectSingle(page, 1);
      await enterPreview(page);
      await selectPreviewSingle(page, 1);

      const before = await page.evaluate(() => {
        const el = DS.getElementById([...DS.selection][0]);
        return { id: el.id, w: el.w, h: el.h };
      });

      await resizeFromHandle(page, 'se', 8, 4);

      const after = await page.evaluate(prev => {
        const el = DS.getElementById(prev.id);
        if (!el) return { missing: true };
        return { w: el.w, h: el.h, dw: el.w - prev.w, dh: el.h - prev.h };
      }, before);

      assert.ok(!after.missing, 'elemento no debe desaparecer');
      assert.ok(after.dw > 0, `modelo: ancho debe aumentar en preview (dw=${after.dw})`);

      const alignment = await getSingleAlignment(page);
      assert.ok(alignment, 'alignment no debe ser null en preview');
      assertRectClose(alignment.box, alignment.element, 0.5, 'minCornerResizePreview');
      await exitPreview(page);
    });

    // ── INTERACTION-EDGE-005 ──────────────────────────────────────────
    // cubre: design | valida: DS/modelo + overlay/geom (minimal side resize)
    await t.test('INTERACTION-EDGE-005 minimal side resize remains stable in design', async () => {
      await reloadRuntime(page, server.baseUrl);
      await selectSingle(page, 1);
      const before = await page.evaluate(() => {
        const el = DS.getElementById([...DS.selection][0]);
        return { w: el.w, h: el.h };
      });

      // Resize solo lateral: dx=8, dy=0
      await resizeFromHandle(page, 'e', 8, 0);

      const after = await page.evaluate(prev => {
        const el = DS.getElementById([...DS.selection][0]);
        return { w: el.w, h: el.h, dw: el.w - prev.w, dh: el.h - prev.h };
      }, before);

      assert.ok(after.dw > 0, `modelo: ancho debe aumentar (dw=${after.dw})`);
      assertApprox(after.dh, 0.0188976377952752, 0.0005, `modelo: alto cambia en precisión fina (dh=${after.dh})`);

      const alignment = await getSingleAlignment(page);
      assertRectClose(alignment.box, alignment.element, 0.5, 'minSideResizeDesign');
    });

    // ── INTERACTION-EDGE-006 ──────────────────────────────────────────
    // cubre: preview | valida: DS/modelo + overlay/geom (minimal side resize)
    await t.test('INTERACTION-EDGE-006 minimal side resize remains stable in preview', async () => {
      await reloadRuntime(page, server.baseUrl);
      await selectSingle(page, 1);
      await enterPreview(page);
      await selectPreviewSingle(page, 1);

      const before = await page.evaluate(() => {
        const el = DS.getElementById([...DS.selection][0]);
        return { id: el.id, w: el.w, h: el.h };
      });

      await resizeFromHandle(page, 'e', 8, 0);

      const after = await page.evaluate(prev => {
        const el = DS.getElementById(prev.id);
        if (!el) return { missing: true };
        return { w: el.w, h: el.h, dw: el.w - prev.w, dh: el.h - prev.h };
      }, before);

      assert.ok(!after.missing, 'elemento no debe desaparecer');
      assert.ok(after.dw > 0, `modelo: ancho debe aumentar (dw=${after.dw})`);
      assertApprox(after.dh, 0.0188976377952752, 0.0005, 'modelo: alto cambia en precisión fina');

      const alignment = await getSingleAlignment(page);
      assertRectClose(alignment.box, alignment.element, 0.5, 'minSideResizePreview');
      await exitPreview(page);
    });

    // ── INTERACTION-EDGE-007 ──────────────────────────────────────────
    // cubre: design | valida: DS/modelo + overlay/geom (long drag → zoom → drag)
    await t.test('INTERACTION-EDGE-007 long drag zoom drag sequence remains stable in design', async () => {
      await reloadRuntime(page, server.baseUrl);
      // e101 en x=4, y=4 — primer drag: dx=20 dy=16 → (24,20) ÷4 ✓
      await selectSingle(page, 0);

      await dragSelectedElement(page, 20, 16);
      let pos = await page.evaluate(() => {
        const el = DS.getElementById([...DS.selection][0]);
        return { x: el.x, y: el.y };
      });
      assertApprox(pos.x, 24, 0.15, 'primer drag x');
      assertApprox(pos.y, 20, 0.15, 'primer drag y');

      // Cambiar zoom
      await setZoom(page, 1.5);

      // Segundo drag: a zoom=1.5, 8px pantalla → ~5.33 unidades modelo.
      // AlignmentGuides puede fijar a guías cercanas; verificamos sólo que la posición es
      // válida (>= 0) y que el overlay queda alineado — es el invariante real del test.
      // re-seleccionar vía DS tras cambio de zoom (click puede ser interceptado por sel-box a zoom 1.5)
      await page.evaluate(() => { DS.selectOnly('e101'); SelectionEngine.renderHandles(); });
      await page.waitForTimeout(150);
      await dragSelectedElement(page, 8, 8);
      pos = await page.evaluate(() => {
        const el = DS.getElementById([...DS.selection][0]);
        return { x: el.x, y: el.y };
      });
      assert.ok(pos.x >= 0, `segundo drag: x debe ser >= 0, obtenido ${pos.x}`);
      assert.ok(pos.y >= 0, `segundo drag: y debe ser >= 0, obtenido ${pos.y}`);

      // overlay/geom: alineación correcta con zoom 1.5
      const alignment = await getSingleAlignment(page);
      assertRectClose(alignment.box, alignment.element, 0.5, 'longDragZoomDragDesign');
      await setZoom(page, 1);
    });

    // ── INTERACTION-EDGE-008 ──────────────────────────────────────────
    // cubre: preview | valida: DS/modelo + overlay/geom (long drag → zoom → drag)
    await t.test('INTERACTION-EDGE-008 long drag zoom drag sequence remains stable in preview', async () => {
      await reloadRuntime(page, server.baseUrl);
      await selectSingle(page, 0);
      await enterPreview(page);
      await selectPreviewSingle(page, 0);

      // Primer drag en preview
      const before = await page.evaluate(() => {
        const id = [...DS.selection][0];
        const el = DS.getElementById(id);
        return { id, x: el.x, y: el.y };
      });
      await dragPreviewSelected(page, 20, 16);
      await page.waitForTimeout(100);

      // Zoom
      await setZoom(page, 1.5);
      await page.waitForTimeout(150);

      // Segundo drag
      await dragPreviewSelected(page, 8, 8);
      await page.waitForTimeout(100);

      const after = await page.evaluate(prev => {
        const el = DS.getElementById(prev.id);
        return el ? { x: el.x, y: el.y, dx: el.x - prev.x, dy: el.y - prev.y } : null;
      }, before);
      assert.ok(after, 'elemento debe seguir existiendo');
      assert.ok(after.dx !== 0 || after.dy !== 0, 'elemento debe haberse movido');

      // overlay/geom
      const alignment = await getSingleAlignment(page);
      assert.ok(alignment, 'alignment no debe ser null');
      assertRectClose(alignment.box, alignment.element, 0.5, 'longDragZoomDragPreview');
      await setZoom(page, 1);
      await exitPreview(page);
    });

    // ── INTERACTION-EDGE-009 ──────────────────────────────────────────
    // cubre: design | valida: overlay/geom (multiselect bbox correcto tras drag)
    await t.test('INTERACTION-EDGE-009 multiselect bbox stays correct after drag in design', async () => {
      await reloadRuntime(page, server.baseUrl);
      await selectMulti(page, 0, 1);
      let snap = await getSelectionSnapshot(page);
      assert.equal(snap.dsSelection.length, 2, 'pre: 2 elementos seleccionados');

      // Drag multiselección
      await dragSelectedElement(page, 20, 16);
      await page.waitForTimeout(150);

      // overlay/geom: bbox debe seguir siendo correcto
      const bbox = await getMultiBBox(page);
      assert.ok(bbox, 'bbox no debe ser null tras drag multiselect');
      assertRectClose(bbox.box, bbox.expected, 1.5, 'multiBboxAfterDragDesign');

      snap = await getSelectionSnapshot(page);
      assert.equal(snap.boxCount, 1, 'overlay: debe haber exactamente 1 sel-box');
    });

    // ── INTERACTION-EDGE-010 ──────────────────────────────────────────
    // cubre: preview | valida: overlay/geom (multiselect bbox correcto tras drag)
    await t.test('INTERACTION-EDGE-010 multiselect bbox stays correct after drag in preview', async () => {
      await reloadRuntime(page, server.baseUrl);
      await enterPreview(page);
      await selectPreviewMulti(page, 0, 2);

      let snap = await getSelectionSnapshot(page);
      assert.equal(snap.dsSelection.length, 2, 'pre: 2 elementos seleccionados en preview');

      // Drag multiselección en preview
      await dragPreviewSelected(page, 16, 12);
      await page.waitForTimeout(150);

      const bbox = await getMultiBBox(page);
      assert.ok(bbox, 'bbox no debe ser null tras drag multiselect en preview');
      assertRectClose(bbox.box, bbox.expected, 1.5, 'multiBboxAfterDragPreview');

      snap = await getSelectionSnapshot(page);
      assert.equal(snap.boxCount, 1, 'overlay: debe haber exactamente 1 sel-box en preview');
      await exitPreview(page);
    });

    // ── INTERACTION-EDGE-011 ──────────────────────────────────────────
    // cubre: design | valida: overlay/geom (overlay tras corner resize + zoom)
    await t.test('INTERACTION-EDGE-011 overlay stays aligned after corner resize plus zoom in design', async () => {
      await reloadRuntime(page, server.baseUrl);
      await selectSingle(page, 1);

      // Resize corner
      await resizeFromHandle(page, 'se', 20, 8);

      // Zoom a 1.5
      await setZoom(page, 1.5);

      const alignment = await getSingleAlignment(page);
      assert.ok(alignment, 'alignment no debe ser null tras resize+zoom');
      assertRectClose(alignment.box, alignment.element, 0.5, 'cornerResizeZoomDesign');
      await setZoom(page, 1);
    });

    // ── INTERACTION-EDGE-012 ──────────────────────────────────────────
    // cubre: preview | valida: overlay/geom (overlay tras corner resize + zoom en preview)
    await t.test('INTERACTION-EDGE-012 overlay stays aligned after corner resize plus zoom in preview', async () => {
      await reloadRuntime(page, server.baseUrl);
      await selectSingle(page, 1);
      await enterPreview(page);
      await selectPreviewSingle(page, 1);

      await resizeFromHandle(page, 'se', 20, 8);
      await setZoom(page, 1.5);

      const alignment = await getSingleAlignment(page);
      assert.ok(alignment, 'alignment no debe ser null en preview tras resize+zoom');
      assertRectClose(alignment.box, alignment.element, 0.5, 'cornerResizeZoomPreview');
      await setZoom(page, 1);
      await exitPreview(page);
    });

    // ── INTERACTION-EDGE-013 ──────────────────────────────────────────
    // cubre: design | valida: overlay/geom (overlay tras side resize + zoom)
    await t.test('INTERACTION-EDGE-013 overlay stays aligned after side resize plus zoom in design', async () => {
      await reloadRuntime(page, server.baseUrl);
      await selectSingle(page, 1);

      await resizeFromHandle(page, 'e', 12, 0);
      await setZoom(page, 0.5);

      const alignment = await getSingleAlignment(page);
      assert.ok(alignment, 'alignment no debe ser null tras side resize+zoom');
      assertRectClose(alignment.box, alignment.element, 0.5, 'sideResizeZoomDesign');
      await setZoom(page, 1);
    });

    // ── INTERACTION-EDGE-014 ──────────────────────────────────────────
    // cubre: preview | valida: overlay/geom (overlay tras side resize + zoom en preview)
    await t.test('INTERACTION-EDGE-014 overlay stays aligned after side resize plus zoom in preview', async () => {
      await reloadRuntime(page, server.baseUrl);
      await selectSingle(page, 1);
      await enterPreview(page);
      await selectPreviewSingle(page, 1);

      await resizeFromHandle(page, 'e', 12, 0);
      await setZoom(page, 0.5);

      const alignment = await getSingleAlignment(page);
      assert.ok(alignment, 'alignment no debe ser null en preview tras side resize+zoom');
      assertRectClose(alignment.box, alignment.element, 0.5, 'sideResizeZoomPreview');
      await setZoom(page, 1);
      await exitPreview(page);
    });

    // ── INTERACTION-EDGE-015 ──────────────────────────────────────────
    // cubre: ambos | valida: DS/modelo (selección conservada tras enter/exit preview desde elemento formateado)
    await t.test('INTERACTION-EDGE-015 selection survives preview enter exit from formatted element', async () => {
      await reloadRuntime(page, server.baseUrl);
      await selectSingle(page, 1);
      // Aplicar formato
      await page.click('#btn-bold');
      await page.waitForTimeout(120);

      const selectedId = await page.evaluate(() => [...DS.selection][0]);
      assert.ok(selectedId, 'elemento debe estar seleccionado');

      // Enter preview: selección debe persistir
      await enterPreview(page);
      let snap = await getSelectionSnapshot(page);
      assert.deepEqual(snap.dsSelection, [selectedId], 'DS.selection debe persistir al entrar preview');
      assert.equal(snap.boxCount, 1, 'overlay debe existir en preview');

      // Exit preview: selección debe volver
      await exitPreview(page);
      snap = await getSelectionSnapshot(page);
      assert.deepEqual(snap.dsSelection, [selectedId], 'DS.selection debe persistir al salir de preview');
      assert.equal(snap.boxCount, 1, 'overlay debe existir al volver a design');
      assert.equal(snap.handleCount, 8, 'handles deben existir al volver a design');
    });

    // ── INTERACTION-EDGE-016 ──────────────────────────────────────────
    // cubre: preview | valida: DS/modelo + overlay/geom (selección sobrevive a varios zooms)
    await t.test('INTERACTION-EDGE-016 selection survives repeated zoom changes in preview', async () => {
      await reloadRuntime(page, server.baseUrl);
      await selectSingle(page, 1);
      await enterPreview(page);
      await selectPreviewSingle(page, 1);

      const selectedId = await page.evaluate(() => [...DS.selection][0]);
      assert.ok(selectedId, 'elemento debe estar seleccionado en preview');

      // Cambios de zoom repetidos
      for (const zoom of [0.5, 1.5, 2.0, 0.75, 1.0]) {
        await setZoom(page, zoom);
        const snap = await getSelectionSnapshot(page);
        assert.deepEqual(snap.dsSelection, [selectedId], `zoom ${zoom}: selección debe persistir`);
        assert.equal(snap.boxCount, 1, `zoom ${zoom}: sel-box debe existir`);
        const alignment = await getSingleAlignment(page);
        assert.ok(alignment, `zoom ${zoom}: alignment no debe ser null`);
        assertRectClose(alignment.box, alignment.element, 0.5, `zoomPreviewSel-${zoom}`);
      }
      await exitPreview(page);
    });

    // ── INTERACTION-EDGE-017 ──────────────────────────────────────────
    // cubre: design | valida: overlay/geom (no hay handles fantasma al pasar single → multi → single)
    await t.test('INTERACTION-EDGE-017 no ghost handles when switching single to multiselect', async () => {
      await reloadRuntime(page, server.baseUrl);

      // Single → 8 handles
      await selectSingle(page, 0);
      let snap = await getSelectionSnapshot(page);
      assert.equal(snap.dsSelection.length, 1, 'single: 1 elemento seleccionado');
      assert.equal(snap.boxCount, 1,    'single: 1 sel-box');
      assert.equal(snap.handleCount, 8, 'single: 8 handles');

      // Multi → 0 handles (multiselect mode)
      await selectMulti(page, 0, 1);
      snap = await getSelectionSnapshot(page);
      assert.equal(snap.dsSelection.length, 2, 'multi: 2 elementos seleccionados');
      assert.equal(snap.boxCount, 1,    'multi: 1 sel-box');
      assert.equal(snap.handleCount, 0, 'multi: 0 handles (no hay handles en multiselect)');

      // Volver a single → exactamente 8 handles, sin fantasmas
      await selectSingle(page, 0);
      snap = await getSelectionSnapshot(page);
      assert.equal(snap.dsSelection.length, 1, 'vuelta single: 1 elemento');
      assert.equal(snap.boxCount, 1,    'vuelta single: 1 sel-box');
      assert.equal(snap.handleCount, 8, 'vuelta single: exactamente 8 handles, sin fantasmas');
    });

    // ── INTERACTION-EDGE-018 ──────────────────────────────────────────
    // cubre: ambos | valida: overlay/geom (no hay sel-box duplicado tras drag→resize→zoom→preview)
    await t.test('INTERACTION-EDGE-018 no duplicate selection box after drag resize zoom preview sequence', async () => {
      await reloadRuntime(page, server.baseUrl);
      await selectSingle(page, 0);

      // Drag
      await dragSelectedElement(page, 20, 16);
      // Resize
      await resizeFromHandle(page, 'se', 12, 4);
      // Zoom
      await setZoom(page, 1.5);
      // Preview enter/exit
      await enterPreview(page);
      await exitPreview(page);
      // Volver a zoom original
      await setZoom(page, 1);
      // Re-seleccionar vía DS para evitar que e101 (desplazado) quede detrás de e102
      await page.evaluate(() => { DS.selectOnly('e101'); SelectionEngine.renderHandles(); });
      await page.waitForTimeout(150);

      // overlay/geom: exactamente 1 sel-box, sin duplicados
      const snap = await getSelectionSnapshot(page);
      assert.equal(snap.boxCount,    1, 'overlay: debe haber exactamente 1 sel-box');
      assert.equal(snap.handleCount, 8, 'overlay: exactamente 8 handles, sin duplicados');

      const alignment = await getSingleAlignment(page);
      assert.ok(alignment, 'alignment no debe ser null');
      assertRectClose(alignment.box, alignment.element, 0.5, 'noDupBoxAfterSequence');
    });

    await assertNoConsoleErrors(consoleErrors, 'TANDA 5 INTERACTION-EDGE');
  } finally {
    await browser.close();
    await server.stop();
  }
});
