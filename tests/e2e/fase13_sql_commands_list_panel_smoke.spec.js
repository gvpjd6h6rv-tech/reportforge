/**
 * Fase 13 — UDS 4.1 — SqlCommandsListPanel smoke (ver + eliminar, alcance reducido).
 *
 * Corre contra la app real (http://127.0.0.1:5001/). Cubre: el botón
 * abre el panel, lista comandos reales creados vía SqlCommandEditor (sin
 * modificarlo), eliminar quita de DS.sqlCommands y del panel, la
 * eliminación se refleja en CommandRuntimeFile.toJSON() sin haber tocado
 * ese archivo, y no existe ningún modo de edición (no reabre el editor).
 */
import { test, expect } from '@playwright/test';

async function acceptCommandInEditor(page, name, sql) {
  await page.evaluate(() => SqlCommandEditor.open());
  await page.waitForTimeout(200);
  await page.fill('#sce-sql', sql);
  await page.fill('#sce-name', name);
  await page.click('button:has-text("Detectar parámetros")');
  await page.waitForTimeout(300);
  await page.click('#sce-accept');
  await page.waitForTimeout(150);
  await page.evaluate(() => SqlCommandEditor.close());
}

const BASE = process.env.RF_LIVE_URL || 'http://127.0.0.1:5001';

test.describe('Fase 13 — SqlCommandsListPanel', () => {
  test('C-F13-001: empty state when no commands exist', async ({ page }) => {
    await page.goto(BASE + '/');
    await page.waitForTimeout(500);
    await page.click('#btn-sql-commands-list');
    await page.waitForTimeout(300);
    const text = await page.locator('#scl-body').textContent();
    expect(text).toContain('No hay comandos guardados');
  });

  test('C-F13-001: panel lists real commands created via the (untouched) SqlCommandEditor', async ({ page }) => {
    await page.goto(BASE + '/');
    await page.waitForTimeout(500);
    await acceptCommandInEditor(page, 'CmdA', 'SELECT 1');
    await acceptCommandInEditor(page, 'CmdB', 'SELECT 2');

    await page.click('#btn-sql-commands-list');
    await page.waitForTimeout(300);
    const rows = await page.locator('.scl-row').count();
    expect(rows).toBe(2);
  });

  test('C-F13-002/003: deleting removes from DS.sqlCommands and toJSON() reflects it', async ({ page }) => {
    await page.goto(BASE + '/');
    await page.waitForTimeout(500);
    await acceptCommandInEditor(page, 'CmdA', 'SELECT 1');
    await acceptCommandInEditor(page, 'CmdB', 'SELECT 2');

    await page.click('#btn-sql-commands-list');
    await page.waitForTimeout(300);
    await page.click('.scl-row:has-text("CmdA") .scl-remove-btn');
    await page.waitForTimeout(200);

    const rowsAfter = await page.locator('.scl-row').count();
    expect(rowsAfter).toBe(1);

    const ids = await page.evaluate(() => DS.sqlCommands.map((c) => c.id));
    expect(ids).toEqual(['CmdB']);

    const json = await page.evaluate(() => CommandRuntimeFile.toJSON());
    const parsed = JSON.parse(json);
    expect(parsed.sqlCommands.map((c) => c.id)).toEqual(['CmdB']);
  });

  test('C-F13-004/005: no edit mode — deleting does not reopen SqlCommandEditor', async ({ page }) => {
    await page.goto(BASE + '/');
    await page.waitForTimeout(500);
    await acceptCommandInEditor(page, 'CmdA', 'SELECT 1');

    await page.click('#btn-sql-commands-list');
    await page.waitForTimeout(300);
    await page.click('.scl-row:has-text("CmdA") .scl-remove-btn');
    await page.waitForTimeout(200);

    const editorOpen = await page.locator('#sql-command-editor-overlay').count();
    expect(editorOpen).toBe(0);
  });

  test('C-F13-006: no console errors, panel does not touch Preview/Field Explorer', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.goto(BASE + '/');
    await page.waitForTimeout(500);
    await acceptCommandInEditor(page, 'CmdA', 'SELECT 1');
    await page.click('#btn-sql-commands-list');
    await page.waitForTimeout(300);
    await page.click('.scl-row:has-text("CmdA") .scl-remove-btn');
    await page.waitForTimeout(200);
    expect(errors).toEqual([]);

    const fieldTreeUntouched = await page.locator('#field-tree').count();
    expect(fieldTreeUntouched).toBe(1);
  });
});
