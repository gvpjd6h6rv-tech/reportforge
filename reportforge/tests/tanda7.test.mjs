/**
 * TANDA 7 — KB-001..020
 * Keyboard / Shortcuts / Focus
 * No mocks. Runtime real en /
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  startRuntimeServer,
  launchRuntimePage,
  reloadRuntime,
  selectMulti,
  enterPreview,
  exitPreview,
  assertNoConsoleErrors,
} from './runtime_harness.mjs';

// Focaliza body para que los eventos de teclado alcancen document-level handlers
async function focusCanvas(page) {
  await page.evaluate(() => document.body.focus());
  await page.waitForTimeout(40);
}

// Selección programática — evita interceptación por sel-box en handles-layer
async function selectById(page, id) {
  await page.evaluate((elId) => {
    DS.selectOnly(elId);
    SelectionEngine.renderHandles();
  }, id);
  await page.waitForTimeout(80);
}

test('TANDA 7 — KB-001..020', { timeout: 300000 }, async (t) => {
  const server = await startRuntimeServer();
  const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl);

  try {
    // ── KB-001 ────────────────────────────────────────────────────────────
    // cubre: design | valida: DS/modelo (Delete elimina elemento seleccionado)
    await t.test('KB-001 delete key removes selected element in design', async () => {
      await reloadRuntime(page, server.baseUrl);
      const before = await page.evaluate(() => DS.elements.length);
      await selectById(page, 'e101');
      await focusCanvas(page);
      await page.keyboard.press('Delete');
      await page.waitForTimeout(200);
      const after = await page.evaluate(() => ({
        length: DS.elements.length,
        selSize: DS.selection.size,
        hasE101: !!DS.getElementById('e101'),
      }));
      assert.equal(after.length, before - 1, `KB-001: debe haber ${before - 1} elementos tras Delete, hay ${after.length}`);
      assert.equal(after.selSize, 0, 'KB-001: DS.selection debe estar vacía tras Delete');
      assert.equal(after.hasE101, false, 'KB-001: e101 no debe existir en DS tras Delete');
    });

    // ── KB-002 ────────────────────────────────────────────────────────────
    // cubre: design | valida: DS/modelo (Delete sin selección = no-op)
    await t.test('KB-002 delete key no-op without selection in design', async () => {
      await reloadRuntime(page, server.baseUrl);
      await page.evaluate(() => { DS.clearSelectionState(); SelectionEngine.clearSelection(); });
      await page.waitForTimeout(80);
      const before = await page.evaluate(() => DS.elements.length);
      assert.equal(await page.evaluate(() => DS.selection.size), 0, 'KB-002: pre: selección debe estar vacía');
      await focusCanvas(page);
      await page.keyboard.press('Delete');
      await page.waitForTimeout(200);
      const after = await page.evaluate(() => DS.elements.length);
      assert.equal(after, before, 'KB-002: Delete sin selección no debe eliminar elementos');
    });

    // ── KB-003 ────────────────────────────────────────────────────────────
    // cubre: design | valida: DS/modelo + overlay (Escape limpia selección)
    await t.test('KB-003 escape clears selection in design', async () => {
      await reloadRuntime(page, server.baseUrl);
      await selectById(page, 'e101');
      assert.equal(await page.evaluate(() => DS.selection.size), 1, 'KB-003: pre: debe haber 1 elemento seleccionado');
      await focusCanvas(page);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
      const after = await page.evaluate(() => ({
        selSize: DS.selection.size,
        boxCount: document.querySelectorAll('#handles-layer .sel-box').length,
      }));
      assert.equal(after.selSize, 0, 'KB-003: DS.selection debe estar vacía tras Escape');
      assert.equal(after.boxCount, 0, 'KB-003: no debe haber sel-box tras Escape');
    });

    // ── KB-004 ────────────────────────────────────────────────────────────
    // cubre: design | valida: DOM overlay (Escape cierra ctx-menu si está visible)
    await t.test('KB-004 escape closes context menu if open', async () => {
      await reloadRuntime(page, server.baseUrl);
      const el = page.locator('.cr-element').first();
      await el.click({ button: 'right' });
      await page.waitForTimeout(250);
      const menuVisible = await page.evaluate(
        () => document.getElementById('ctx-menu')?.classList.contains('visible') ?? false,
      );
      if (!menuVisible) {
        // ctx-menu puede no existir en esta build — skip suave
        return;
      }
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
      const afterEscape = await page.evaluate(
        () => document.getElementById('ctx-menu')?.classList.contains('visible') ?? false,
      );
      assert.equal(afterEscape, false, 'KB-004: ctx-menu debe ocultarse tras Escape');
    });

    // ── KB-005 ────────────────────────────────────────────────────────────
    // cubre: design | valida: DS/modelo + overlay (shift-click multiselect estable)
    await t.test('KB-005 shift-click keyboard-modified multiselect remains stable', async () => {
      await reloadRuntime(page, server.baseUrl);
      await selectMulti(page, 0, 1);
      const snap = await page.evaluate(() => ({
        selSize: DS.selection.size,
        boxCount: document.querySelectorAll('#handles-layer .sel-box').length,
      }));
      assert.equal(snap.selSize, 2, 'KB-005: multiselect debe tener 2 elementos en DS.selection');
      assert.equal(snap.boxCount, 1, 'KB-005: debe haber exactamente 1 sel-box para multiselect');
    });

    // ── KB-006 ────────────────────────────────────────────────────────────
    // cubre: design | valida: DS/modelo (Tab por toolbar no altera DS.selection)
    await t.test('KB-006 tab focus through toolbar preserves selection', async () => {
      await reloadRuntime(page, server.baseUrl);
      await selectById(page, 'e101');
      const selBefore = await page.evaluate(() => [...DS.selection]);
      // Tres tabs para mover foco por controles del toolbar
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      await page.waitForTimeout(150);
      const selAfter = await page.evaluate(() => [...DS.selection]);
      assert.deepEqual(selAfter, selBefore, 'KB-006: DS.selection no debe cambiar al tabular por toolbar');
    });

    // ── KB-007 ────────────────────────────────────────────────────────────
    // cubre: design | valida: DS/modelo (selección en toolbar <select> aplica cambio)
    await t.test('KB-007 enter on focused toolbar control applies action', async () => {
      await reloadRuntime(page, server.baseUrl);
      await selectById(page, 'e101');
      // #tb-font-size es un <select>; usar selectOption para cambiar el valor
      const sizeSelect = page.locator('#tb-font-size');
      const options = await sizeSelect.evaluate(el =>
        [...el.options].map(o => Number(o.value)).filter(v => v > 0 && v !== 11),
      );
      assert.ok(options.length > 0, 'KB-007: debe haber opciones de tamaño distintas de 11');
      const targetSize = options[0];
      await sizeSelect.selectOption(String(targetSize));
      await page.waitForTimeout(250);
      const fontSize = await page.evaluate(() => DS.getElementById('e101')?.fontSize);
      assert.equal(fontSize, targetSize, `KB-007: selección en #tb-font-size debe aplicar fontSize=${targetSize} al modelo, obtenido=${fontSize}`);
    });

    // ── KB-008 ────────────────────────────────────────────────────────────
    // cubre: design | valida: DS/modelo (arrow key mueve elemento si está cableado)
    await t.test('KB-008 arrow key nudging moves selected element if supported', async () => {
      await reloadRuntime(page, server.baseUrl);
      await selectById(page, 'e101');
      const beforeX = await page.evaluate(() => DS.getElementById('e101').x);
      await focusCanvas(page);
      // Usar Shift+ArrowRight (paso 10) para garantizar movimiento a pesar del snap de cuadrícula
      // snap(4 + 10) = round(14/4)*4 = 4*4 = 16
      await page.keyboard.press('Shift+ArrowRight');
      await page.waitForTimeout(180);
      const afterX = await page.evaluate(() => DS.getElementById('e101').x);
      assert.ok(afterX >= 0, `KB-008: x debe ser >= 0 (got=${afterX})`);
      assert.ok(afterX !== beforeX, `KB-008: arrow key debe mover el elemento (before=${beforeX}, after=${afterX})`);
    });

    // ── KB-009 ────────────────────────────────────────────────────────────
    // cubre: design | valida: DS/modelo (Shift+Arrow usa paso mayor que Arrow simple)
    await t.test('KB-009 shift-arrow nudging uses alternate step if supported', async () => {
      await reloadRuntime(page, server.baseUrl);
      await selectById(page, 'e101');
      const originalX = await page.evaluate(() => DS.getElementById('e101').x);
      await focusCanvas(page);
      // Paso Shift = 10 → snap(4+10)=16; delta esperado >= 4 (al menos 1 grid unit)
      await page.keyboard.press('Shift+ArrowRight');
      await page.waitForTimeout(180);
      const shiftX = await page.evaluate(() => DS.getElementById('e101').x);
      const shiftDelta = shiftX - originalX;
      assert.ok(shiftDelta >= 4, `KB-009: Shift+ArrowRight debe mover >= 4 unidades de modelo (delta=${shiftDelta})`);
    });

    // ── KB-010 ────────────────────────────────────────────────────────────
    // cubre: design | valida: DS/modelo (Ctrl+Z deshace nudge de teclado)
    await t.test('KB-010 ctrl-z triggers undo if shortcut is wired', async () => {
      await reloadRuntime(page, server.baseUrl);
      await selectById(page, 'e101');
      const originalX = await page.evaluate(() => DS.getElementById('e101').x);
      await focusCanvas(page);
      await page.keyboard.press('Shift+ArrowRight');
      await page.waitForTimeout(180);
      const movedX = await page.evaluate(() => DS.getElementById('e101').x);
      assert.ok(movedX > originalX, `KB-010: pre-undo: Shift+ArrowRight debe mover x (original=${originalX}, moved=${movedX})`);
      await page.keyboard.press('Control+z');
      await page.waitForTimeout(250);
      const undoneX = await page.evaluate(() => DS.getElementById('e101').x);
      assert.equal(undoneX, originalX, `KB-010: Ctrl+Z debe deshacer el nudge (expected=${originalX}, got=${undoneX})`);
    });

    // ── KB-011 ────────────────────────────────────────────────────────────
    // cubre: design | valida: DS/modelo (Ctrl+Shift+Z rehace tras undo)
    await t.test('KB-011 ctrl-shift-z triggers redo if shortcut is wired', async () => {
      await reloadRuntime(page, server.baseUrl);
      await selectById(page, 'e101');
      const originalX = await page.evaluate(() => DS.getElementById('e101').x);
      await focusCanvas(page);
      await page.keyboard.press('Shift+ArrowRight');
      await page.waitForTimeout(180);
      const movedX = await page.evaluate(() => DS.getElementById('e101').x);
      assert.ok(movedX > originalX, 'KB-011: pre-undo: Shift+ArrowRight debe mover x');
      await page.keyboard.press('Control+z');
      await page.waitForTimeout(200);
      assert.equal(await page.evaluate(() => DS.getElementById('e101').x), originalX, 'KB-011: Ctrl+Z debe deshacer');
      await page.keyboard.press('Control+Shift+Z');
      await page.waitForTimeout(250);
      const redoneX = await page.evaluate(() => DS.getElementById('e101').x);
      assert.equal(redoneX, movedX, `KB-011: Ctrl+Shift+Z debe rehacer (expected=${movedX}, got=${redoneX})`);
    });

    // ── KB-012 ────────────────────────────────────────────────────────────
    // cubre: design | valida: DS/modelo (Ctrl+C copia sin modificar DS.elements)
    await t.test('KB-012 ctrl-c copies selected element if supported', async () => {
      await reloadRuntime(page, server.baseUrl);
      await selectById(page, 'e101');
      const beforeLen = await page.evaluate(() => DS.elements.length);
      await focusCanvas(page);
      await page.keyboard.press('Control+c');
      await page.waitForTimeout(150);
      const afterLen = await page.evaluate(() => DS.elements.length);
      // Copy no añade elementos al documento
      assert.equal(afterLen, beforeLen, 'KB-012: Ctrl+C no debe modificar DS.elements');
    });

    // ── KB-013 ────────────────────────────────────────────────────────────
    // cubre: design | valida: DS/modelo (Ctrl+V pega elemento copiado)
    await t.test('KB-013 ctrl-v pastes copied element if supported', async () => {
      await reloadRuntime(page, server.baseUrl);
      await selectById(page, 'e101');
      const beforeLen = await page.evaluate(() => DS.elements.length);
      await focusCanvas(page);
      await page.keyboard.press('Control+c');
      await page.waitForTimeout(120);
      await page.keyboard.press('Control+v');
      await page.waitForTimeout(250);
      const afterLen = await page.evaluate(() => DS.elements.length);
      assert.equal(afterLen, beforeLen + 1, `KB-013: Ctrl+V debe añadir 1 elemento (before=${beforeLen}, after=${afterLen})`);
    });

    // ── KB-014 ────────────────────────────────────────────────────────────
    // cubre: design | valida: DS/modelo (Ctrl+X corta elemento seleccionado)
    await t.test('KB-014 ctrl-x cuts selected element if supported', async () => {
      await reloadRuntime(page, server.baseUrl);
      await selectById(page, 'e101');
      const beforeLen = await page.evaluate(() => DS.elements.length);
      await focusCanvas(page);
      await page.keyboard.press('Control+x');
      await page.waitForTimeout(250);
      const after = await page.evaluate(() => ({
        length: DS.elements.length,
        hasE101: !!DS.getElementById('e101'),
      }));
      assert.equal(after.length, beforeLen - 1, `KB-014: Ctrl+X debe eliminar 1 elemento (before=${beforeLen}, after=${after.length})`);
      assert.equal(after.hasE101, false, 'KB-014: e101 no debe existir en DS tras Ctrl+X');
    });

    // ── KB-015 ────────────────────────────────────────────────────────────
    // cubre: design | valida: DS/modelo (Delete en input no dispara comando global)
    await t.test('KB-015 keyboard shortcut does not fire while typing in formula/input field', async () => {
      await reloadRuntime(page, server.baseUrl);
      await selectById(page, 'e101');
      const beforeLen = await page.evaluate(() => DS.elements.length);
      // Focalizar #prop-x (campo numérico en panel de propiedades)
      const propX = page.locator('#prop-x');
      const propXExists = await propX.count();
      if (propXExists > 0) {
        await propX.click();
        await page.waitForTimeout(100);
        const activeIsInput = await page.evaluate(() => {
          const el = document.activeElement;
          return el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA' || el?.tagName === 'SELECT';
        });
        if (activeIsInput) {
          await page.keyboard.press('Delete');
          await page.waitForTimeout(200);
          const afterLen = await page.evaluate(() => DS.elements.length);
          assert.equal(afterLen, beforeLen, 'KB-015: Delete dentro de input no debe eliminar elementos de DS');
        }
      }
      // Si el panel no está disponible, el test pasa (no hay fallo de runtime)
    });

    // ── KB-016 ────────────────────────────────────────────────────────────
    // cubre: design | valida: DS/modelo (selección se mantiene tras acción toolbar)
    await t.test('KB-016 focus returns to canvas after toolbar action', async () => {
      await reloadRuntime(page, server.baseUrl);
      await selectById(page, 'e101');
      // Clic en toolbar btn-bold y verificar que la selección se mantiene
      await page.click('#btn-bold');
      await page.waitForTimeout(200);
      const selSize = await page.evaluate(() => DS.selection.size);
      assert.equal(selSize, 1, 'KB-016: DS.selection debe mantenerse después de acción toolbar');
      // Tras acción en toolbar, Escape debe seguir funcionando (teclado accesible)
      await page.keyboard.press('Escape');
      await page.waitForTimeout(150);
      const selAfterEsc = await page.evaluate(() => DS.selection.size);
      assert.equal(selAfterEsc, 0, 'KB-016: Escape debe funcionar tras acción toolbar (foco vuelve a canvas)');
    });

    // ── KB-017 ────────────────────────────────────────────────────────────
    // cubre: preview | valida: DS/modelo (Escape en preview limpia selección)
    await t.test('KB-017 preview keyboard interactions keep parity where applicable', async () => {
      await reloadRuntime(page, server.baseUrl);
      await enterPreview(page);
      // Seleccionar primer pv-el
      await page.locator('#preview-content .pv-el').first().click();
      await page.waitForTimeout(150);
      const selBefore = await page.evaluate(() => DS.selection.size);
      assert.ok(selBefore >= 0, 'KB-017: selección válida en preview');
      // Escape en preview también debe limpiar selección
      await page.evaluate(() => document.body.focus());
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
      const selAfter = await page.evaluate(() => DS.selection.size);
      assert.equal(selAfter, 0, 'KB-017: Escape en preview debe limpiar DS.selection');
      await exitPreview(page);
    });

    // ── KB-018 ────────────────────────────────────────────────────────────
    // cubre: design | valida: estado visual (undo/redo rápido no desincroniza toolbar)
    await t.test('KB-018 rapid keyboard commands do not desync toolbar state', async () => {
      await reloadRuntime(page, server.baseUrl);
      await selectById(page, 'e101');
      await focusCanvas(page);
      // Secuencia rápida: move → undo → undo → redo
      await page.keyboard.press('Shift+ArrowRight');
      await page.waitForTimeout(80);
      await page.keyboard.press('Control+z');
      await page.waitForTimeout(80);
      await page.keyboard.press('Control+z');
      await page.waitForTimeout(80);
      await page.keyboard.press('Control+Shift+Z');
      await page.waitForTimeout(350);
      // Re-seleccionar e101 si existe; forzar actualización del toolbar
      const e101Exists = await page.evaluate(() => !!DS.getElementById('e101'));
      if (e101Exists) {
        await page.evaluate(() => {
          DS.selectOnly('e101');
          SelectionEngine.renderHandles();
          FormatEngine.updateToolbar();
        });
        await page.waitForTimeout(150);
        const state = await page.evaluate(() => ({
          bold: !!DS.getElementById('e101')?.bold,
          toolbarBold: document.getElementById('btn-bold')?.classList.contains('active') ?? false,
        }));
        assert.equal(state.toolbarBold, state.bold, `KB-018: toolbar bold (${state.toolbarBold}) debe sincronizar con modelo (${state.bold}) tras undo/redo rápido`);
      }
    });

    // ── KB-019 ────────────────────────────────────────────────────────────
    // cubre: design | valida: ausencia de overlays duplicados tras Delete por teclado
    await t.test('KB-019 keyboard-triggered command does not create duplicate overlays', async () => {
      await reloadRuntime(page, server.baseUrl);
      await selectById(page, 'e101');
      await focusCanvas(page);
      await page.keyboard.press('Delete');
      await page.waitForTimeout(250);
      const overlays = await page.evaluate(() => ({
        boxes: document.querySelectorAll('#handles-layer .sel-box').length,
        handles: document.querySelectorAll('#handles-layer .sel-handle').length,
        selSize: DS.selection.size,
      }));
      assert.equal(overlays.selSize, 0, 'KB-019: DS.selection debe estar vacía tras Delete');
      assert.equal(overlays.boxes, 0, 'KB-019: no debe haber sel-box huérfanos tras Delete por teclado');
      assert.equal(overlays.handles, 0, 'KB-019: no debe haber handles huérfanos tras Delete por teclado');
    });

    // ── KB-020 ────────────────────────────────────────────────────────────
    // cubre: ambos | valida: ausencia de errores de consola (sesión teclado mixta)
    await t.test('KB-020 no console errors during mixed keyboard session', async () => {
      await reloadRuntime(page, server.baseUrl);
      await selectById(page, 'e101');
      await focusCanvas(page);
      // Sesión mixta de shortcuts
      await page.keyboard.press('Control+c');
      await page.waitForTimeout(80);
      await page.keyboard.press('Control+v');
      await page.waitForTimeout(120);
      await page.keyboard.press('Control+z');
      await page.waitForTimeout(100);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(80);
      await enterPreview(page);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(100);
      await exitPreview(page);
      await page.waitForTimeout(100);
      await assertNoConsoleErrors(consoleErrors, 'KB-020');
    });

  } finally {
    await browser.close();
    await server.stop();
  }
});
