import test from 'node:test';
import assert from 'node:assert/strict';
import {
  startRuntimeServer,
  launchRuntimePage,
  reloadRuntime,
  assertNoConsoleErrors,
} from './runtime_harness.mjs';

// Opens the context menu programmatically at a fixed screen position.
// This avoids right-click positioning uncertainty and works regardless of
// where elements are rendered in the viewport.
async function showContextMenu(page, context /* 'element' | 'canvas' */) {
  await page.evaluate((ctx) => ContextMenuEngine.show(200, 200, ctx), context);
  await page.waitForTimeout(50);
}

// Returns all non-separator label texts from the visible context menu.
async function getMenuLabels(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('#ctx-menu .ctx-item:not(.separator)')]
      .map((el) => el.textContent.trim())
  );
}

// Clicks the context-menu item whose text includes `labelFragment` and waits.
async function clickMenuItem(page, labelFragment) {
  await page.evaluate((frag) => {
    const item = [...document.querySelectorAll('#ctx-menu .ctx-item:not(.separator)')]
      .find((el) => el.textContent.includes(frag));
    if (!item) throw new Error(`Menu item not found: "${frag}"`);
    item.click();
  }, labelFragment);
  await page.waitForTimeout(150);
}

test('TANDA 10 — MENU-001..020', { timeout: 300000 }, async (t) => {
  const server = await startRuntimeServer();
  try {
    const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl);
    try {
      await reloadRuntime(page, server.baseUrl);

      // ─── MENU-001 ──────────────────────────────────────────────────────
      await t.test('MENU-001 ContextMenuEngine.show adds visible class to #ctx-menu', async () => {
        await reloadRuntime(page, server.baseUrl);
        await showContextMenu(page, 'element');

        const visible = await page.evaluate(() =>
          document.getElementById('ctx-menu')?.classList.contains('visible') ?? false
        );
        assert.ok(visible, 'MENU-001: #ctx-menu must have class visible after ContextMenuEngine.show');
      });

      // ─── MENU-002 ──────────────────────────────────────────────────────
      await t.test('MENU-002 ContextMenuEngine.hide removes visible class from #ctx-menu', async () => {
        await reloadRuntime(page, server.baseUrl);
        await showContextMenu(page, 'element');
        await page.evaluate(() => ContextMenuEngine.hide());
        await page.waitForTimeout(50);

        const visible = await page.evaluate(() =>
          document.getElementById('ctx-menu')?.classList.contains('visible') ?? false
        );
        assert.ok(!visible, 'MENU-002: #ctx-menu must not have class visible after ContextMenuEngine.hide');
      });

      // ─── MENU-003 ──────────────────────────────────────────────────────
      await t.test('MENU-003 element context menu includes Copiar item', async () => {
        await reloadRuntime(page, server.baseUrl);
        await showContextMenu(page, 'element');
        const labels = await getMenuLabels(page);
        const hasCopy = labels.some((l) => l.includes('Copiar'));
        assert.ok(hasCopy, `MENU-003: element menu must include 'Copiar'; found: ${JSON.stringify(labels)}`);
      });

      // ─── MENU-004 ──────────────────────────────────────────────────────
      await t.test('MENU-004 element context menu includes Eliminar item', async () => {
        await reloadRuntime(page, server.baseUrl);
        await showContextMenu(page, 'element');
        const labels = await getMenuLabels(page);
        const hasDelete = labels.some((l) => l.includes('Eliminar'));
        assert.ok(hasDelete, `MENU-004: element menu must include 'Eliminar'; found: ${JSON.stringify(labels)}`);
      });

      // ─── MENU-005 ──────────────────────────────────────────────────────
      await t.test('MENU-005 element context menu includes alignment items', async () => {
        await reloadRuntime(page, server.baseUrl);
        await showContextMenu(page, 'element');
        const labels = await getMenuLabels(page);
        const hasAlignLeft = labels.some((l) => l.includes('Alinear izquierda'));
        const hasAlignCenter = labels.some((l) => l.includes('Alinear centro'));
        assert.ok(hasAlignLeft, `MENU-005: element menu must include 'Alinear izquierda'`);
        assert.ok(hasAlignCenter, `MENU-005: element menu must include 'Alinear centro'`);
      });

      // ─── MENU-006 ──────────────────────────────────────────────────────
      await t.test('MENU-006 element context menu has at least one separator', async () => {
        await reloadRuntime(page, server.baseUrl);
        await showContextMenu(page, 'element');
        const sepCount = await page.evaluate(() =>
          document.querySelectorAll('#ctx-menu .ctx-item.separator').length
        );
        assert.ok(sepCount > 0, `MENU-006: element context menu must have at least one separator, got ${sepCount}`);
      });

      // ─── MENU-007 ──────────────────────────────────────────────────────
      await t.test('MENU-007 canvas context menu includes insert items', async () => {
        await reloadRuntime(page, server.baseUrl);
        await showContextMenu(page, 'canvas');
        const labels = await getMenuLabels(page);
        const hasInsertText = labels.some((l) => l.includes('Insertar') && l.includes('Texto'));
        const hasInsertField = labels.some((l) => l.includes('Insertar') && l.includes('Campo'));
        assert.ok(hasInsertText, `MENU-007: canvas menu must include 'Insertar > Texto'`);
        assert.ok(hasInsertField, `MENU-007: canvas menu must include 'Insertar > Campo'`);
      });

      // ─── MENU-008 ──────────────────────────────────────────────────────
      await t.test('MENU-008 canvas context menu includes Seleccionar todo item', async () => {
        await reloadRuntime(page, server.baseUrl);
        await showContextMenu(page, 'canvas');
        const labels = await getMenuLabels(page);
        const hasSelectAll = labels.some((l) => l.includes('Seleccionar todo'));
        assert.ok(hasSelectAll, `MENU-008: canvas menu must include 'Seleccionar todo'`);
      });

      // ─── MENU-009 ──────────────────────────────────────────────────────
      await t.test('MENU-009 canvas context menu does not include Eliminar item', async () => {
        await reloadRuntime(page, server.baseUrl);
        await showContextMenu(page, 'canvas');
        const labels = await getMenuLabels(page);
        const hasDelete = labels.some((l) => l.includes('Eliminar'));
        assert.ok(!hasDelete, `MENU-009: canvas menu must not include 'Eliminar'; found: ${JSON.stringify(labels)}`);
      });

      // ─── MENU-010 ──────────────────────────────────────────────────────
      await t.test('MENU-010 clicking Copiar from element menu copies element to DS.clipboard', async () => {
        await reloadRuntime(page, server.baseUrl);
        const elId = await page.evaluate(() => {
          const el = DS.elements[0];
          DS.selectOnly(el.id);
          return el.id;
        });
        await showContextMenu(page, 'element');
        await clickMenuItem(page, 'Copiar');

        const clipLen = await page.evaluate(() => DS.clipboard?.length ?? 0);
        assert.ok(clipLen > 0, `MENU-010: DS.clipboard must have content after Copiar; got length ${clipLen}`);
      });

      // ─── MENU-011 ──────────────────────────────────────────────────────
      await t.test('MENU-011 clicking Eliminar from element menu removes element from DS.elements', async () => {
        await reloadRuntime(page, server.baseUrl);
        const countBefore = await page.evaluate(() => {
          DS.selectOnly(DS.elements[0].id);
          return DS.elements.length;
        });
        await showContextMenu(page, 'element');
        await clickMenuItem(page, 'Eliminar');

        const countAfter = await page.evaluate(() => DS.elements.length);
        assert.equal(countAfter, countBefore - 1, `MENU-011: Eliminar must remove 1 element; before=${countBefore} after=${countAfter}`);
      });

      // ─── MENU-012 ──────────────────────────────────────────────────────
      await t.test('MENU-012 Seleccionar todo from canvas menu selects all elements', async () => {
        await reloadRuntime(page, server.baseUrl);
        const totalElements = await page.evaluate(() => {
          DS.clearSelectionState();
          return DS.elements.length;
        });
        await showContextMenu(page, 'canvas');
        await clickMenuItem(page, 'Seleccionar todo');

        const selectedCount = await page.evaluate(() => DS.selection.size);
        assert.equal(selectedCount, totalElements, `MENU-012: Seleccionar todo must select all ${totalElements} elements; got ${selectedCount}`);
      });

      // ─── MENU-013 ──────────────────────────────────────────────────────
      await t.test('MENU-013 Insertar > Texto from canvas menu activates text insert tool', async () => {
        await reloadRuntime(page, server.baseUrl);
        // insert-text calls InsertEngine.setTool('text') — it switches the active drawing
        // tool so the user can click-drag to place a text element. It does NOT insert immediately.
        const toolBefore = await page.evaluate(() => DS.tool);
        await showContextMenu(page, 'canvas');
        await clickMenuItem(page, 'Insertar > Texto');

        const toolAfter = await page.evaluate(() => DS.tool);
        assert.equal(toolAfter, 'text', `MENU-013: DS.tool must be 'text' after insert-text; before='${toolBefore}' after='${toolAfter}'`);
      });

      // ─── MENU-014 ──────────────────────────────────────────────────────
      await t.test('MENU-014 Cortar removes selected element (cut = copy + delete)', async () => {
        await reloadRuntime(page, server.baseUrl);
        const { countBefore, selectedId } = await page.evaluate(() => {
          DS.selectOnly(DS.elements[0].id);
          return { countBefore: DS.elements.length, selectedId: DS.elements[0].id };
        });
        await showContextMenu(page, 'element');
        await clickMenuItem(page, 'Cortar');

        const { countAfter, clipLen } = await page.evaluate(() => ({
          countAfter: DS.elements.length,
          clipLen: DS.clipboard?.length ?? 0,
        }));
        assert.equal(countAfter, countBefore - 1, `MENU-014: Cortar must remove element; before=${countBefore} after=${countAfter}`);
        assert.ok(clipLen > 0, `MENU-014: Cortar must populate DS.clipboard; got length ${clipLen}`);
      });

      // ─── MENU-015 ──────────────────────────────────────────────────────
      await t.test('MENU-015 Pegar from element menu pastes clipboard content', async () => {
        await reloadRuntime(page, server.baseUrl);
        // First copy an element so clipboard is populated
        const countBefore = await page.evaluate(() => {
          DS.selectOnly(DS.elements[0].id);
          CommandEngine.copy();
          return DS.elements.length;
        });
        await showContextMenu(page, 'element');
        await clickMenuItem(page, 'Pegar');

        const countAfter = await page.evaluate(() => DS.elements.length);
        assert.equal(countAfter, countBefore + 1, `MENU-015: Pegar must add 1 element; before=${countBefore} after=${countAfter}`);
      });

      // ─── MENU-016 ──────────────────────────────────────────────────────
      await t.test('MENU-016 right-click on element in viewport opens context menu', async () => {
        await reloadRuntime(page, server.baseUrl);
        // Right-click the first canvas element (not preview)
        await page.locator('.cr-element:not(.pv-el)').first().click({ button: 'right' });
        await page.waitForTimeout(200);

        const visible = await page.evaluate(() =>
          document.getElementById('ctx-menu')?.classList.contains('visible') ?? false
        );
        assert.ok(visible, 'MENU-016: right-click on element must open context menu');
      });

      // ─── MENU-017 ──────────────────────────────────────────────────────
      await t.test('MENU-017 right-click on element auto-selects it if not already selected', async () => {
        await reloadRuntime(page, server.baseUrl);
        // Clear selection first
        await page.evaluate(() => DS.clearSelectionState());

        const el = page.locator('.cr-element:not(.pv-el)').first();
        const elId = await el.getAttribute('data-id');
        await el.click({ button: 'right' });
        await page.waitForTimeout(200);

        const selected = await page.evaluate((id) => DS.selection.has(id), elId);
        assert.ok(selected, `MENU-017: right-clicking element ${elId} must auto-select it`);
      });

      // ─── MENU-018 ──────────────────────────────────────────────────────
      await t.test('MENU-018 context menu is clamped to stay within viewport when opened at edge', async () => {
        await reloadRuntime(page, server.baseUrl);
        // Open menu at the far bottom-right of the viewport.
        // ContextMenuEngine.show clamps position to min(x, viewportW - pw - 4) and min(y, viewportH - ph - 4).
        // The clamped menu must not overflow the viewport on either axis.
        const { left, top, vpW, vpH } = await page.evaluate(() => {
          const vw = window.innerWidth;
          const vh = window.innerHeight;
          ContextMenuEngine.show(vw, vh, 'element');
          const menu = document.getElementById('ctx-menu');
          return {
            left: parseFloat(menu.style.left),
            top: parseFloat(menu.style.top),
            vpW: vw,
            vpH: vh,
          };
        });

        const menuW = 170; // pw constant in ContextMenuEngine
        assert.ok(left + menuW <= vpW, `MENU-018: menu right edge (${left + menuW}) must be <= viewport width (${vpW})`);
        assert.ok(top >= 0, `MENU-018: menu top (${top}) must be >= 0`);
        assert.ok(left >= 0, `MENU-018: menu left (${left}) must be >= 0`);

        await page.evaluate(() => ContextMenuEngine.hide());
      });

      // ─── MENU-019 ──────────────────────────────────────────────────────
      await t.test('MENU-019 Traer al frente increases selected element zIndex', async () => {
        await reloadRuntime(page, server.baseUrl);
        const { elId, zBefore } = await page.evaluate(() => {
          const el = DS.elements[0];
          DS.selectOnly(el.id);
          return { elId: el.id, zBefore: el.zIndex ?? 0 };
        });
        await showContextMenu(page, 'element');
        await clickMenuItem(page, 'Traer al frente');

        const zAfter = await page.evaluate((id) => DS.elements.find((e) => e.id === id)?.zIndex ?? 0, elId);
        assert.ok(zAfter > zBefore, `MENU-019: Traer al frente must increase zIndex; before=${zBefore} after=${zAfter}`);
      });

      // ─── MENU-020 ──────────────────────────────────────────────────────
      await t.test('MENU-020 Insertar > Rectángulo from canvas menu activates box insert tool', async () => {
        await reloadRuntime(page, server.baseUrl);
        // insert-box calls InsertEngine.setTool('box') — sets drawing tool, doesn't insert immediately.
        // Also verify DS.tool starts at 'pointer' and returns to 'pointer' if we reload.
        const toolBefore = await page.evaluate(() => DS.tool);
        await showContextMenu(page, 'canvas');
        await clickMenuItem(page, 'Insertar > Rectángulo');

        const toolAfter = await page.evaluate(() => DS.tool);
        assert.equal(toolAfter, 'box', `MENU-020: DS.tool must be 'box' after insert-box; before='${toolBefore}' after='${toolAfter}'`);
      });

      await assertNoConsoleErrors(consoleErrors, 'TANDA 10 — MENU');
    } finally {
      await browser.close();
    }
  } finally {
    await server.stop();
  }
});
