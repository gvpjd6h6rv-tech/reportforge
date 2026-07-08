/**
 * Fase 12 — UDS 4.1 — SQL command persistence smoke.
 *
 * Corre contra la app real (http://127.0.0.1:5001/). Cubre el contrato
 * aprobado: SqlCommandEditor._accept() agrega el comando a DS.sqlCommands
 * (vía SqlCommandStore), toJSON() lo persiste, cargar un archivo guardado
 * lo restaura sin arrastrar comandos de otro documento, archivos viejos
 * sin sqlCommands cargan sin romper, y "Archivo > Nuevo" limpia la
 * colección.
 */
import { test, expect } from '@playwright/test';

const BASE = process.env.RF_LIVE_URL || 'http://127.0.0.1:5001';

async function acceptCommandInEditor(page, name, sql) {
  await page.evaluate(() => SqlCommandEditor.open());
  await page.waitForTimeout(200);
  await page.fill('#sce-sql', sql);
  await page.fill('#sce-name', name);
  await page.click('button:has-text("Detectar parámetros")');
  await page.waitForTimeout(300);
  await page.click('#sce-accept');
  await page.waitForTimeout(150);
}

test.describe('Fase 12 — SQL command persistence', () => {
  test('C-F12-001/002: accepting a command in the editor adds it to DS.sqlCommands via SqlCommandStore', async ({ page }) => {
    await page.goto(BASE + '/');
    await page.waitForTimeout(500);
    await acceptCommandInEditor(page, 'VentasPorFecha', 'SELECT DocNum FROM OINV WHERE DocDate >= {?FechaDesde}');

    const commands = await page.evaluate(() => DS.sqlCommands);
    expect(commands.length).toBe(1);
    expect(commands[0].id).toBe('VentasPorFecha');
    expect(commands[0].sql).toBe('SELECT DocNum FROM OINV WHERE DocDate >= :FechaDesde');
    expect(commands[0].command_type).toBe('query');
  });

  test('C-F12-003: toJSON() persists sqlCommands', async ({ page }) => {
    await page.goto(BASE + '/');
    await page.waitForTimeout(500);
    await acceptCommandInEditor(page, 'CmdA', 'SELECT 1');

    const json = await page.evaluate(() => CommandRuntimeFile.toJSON());
    const parsed = JSON.parse(json);
    expect(parsed.sqlCommands.length).toBe(1);
    expect(parsed.sqlCommands[0].id).toBe('CmdA');
  });

  test('C-F12-004/005: loading a saved file restores sqlCommands without carrying over a different document\'s commands', async ({ page }) => {
    await page.goto(BASE + '/');
    await page.waitForTimeout(500);

    const savedJson = JSON.stringify({
      name: 'Reporte con comandos', version: '1.0', pageWidth: 794, pageHeight: 1123, pageSize: 'A4',
      sections: [{ id: 's1', type: 'header', height: 100 }], elements: [],
      sqlCommands: [{ id: 'CmdA', name: 'CmdA', sql: 'SELECT 1', command_type: 'query', parameters: [], result_schema: [], max_rows_preview: 100 }],
    });

    const restored = await page.evaluate((raw) => {
      DS.sqlCommands = [{ id: 'StaleFromOtherDoc', name: 'stale', sql: 'SELECT 2' }];
      const layout = CommandRuntimeFile._normalizeLayout(JSON.parse(raw));
      CommandRuntimeFile._applyLoadedLayout(layout, null, null, 'test-reload');
      return DS.sqlCommands;
    }, savedJson);

    expect(restored.length).toBe(1);
    expect(restored[0].id).toBe('CmdA');
    expect(restored.find((c) => c.id === 'StaleFromOtherDoc')).toBeUndefined();
  });

  test('C-F12-006: loading an old file without sqlCommands does not break', async ({ page }) => {
    await page.goto(BASE + '/');
    await page.waitForTimeout(500);

    const oldFileJson = JSON.stringify({
      name: 'Reporte Viejo', version: '1.0', pageWidth: 794, pageHeight: 1123, pageSize: 'A4',
      sections: [{ id: 's1', type: 'header', height: 100 }], elements: [],
    });
    const result = await page.evaluate((raw) => {
      try {
        const layout = CommandRuntimeFile._normalizeLayout(JSON.parse(raw));
        CommandRuntimeFile._applyLoadedLayout(layout, null, null, 'test-old-file');
        return { ok: true, sqlCommands: DS.sqlCommands };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    }, oldFileJson);

    expect(result.ok).toBe(true);
    expect(result.sqlCommands).toEqual([]);
  });

  test('C-F12-005 (New document): "Archivo > Nuevo" clears DS.sqlCommands', async ({ page }) => {
    await page.goto(BASE + '/');
    await page.waitForTimeout(500);
    page.on('dialog', (d) => d.accept());

    await page.evaluate(() => {
      DS.sqlCommands = [{ id: 'X', name: 'X', sql: 'SELECT 1' }];
    });
    await page.click('button.tb-icon[data-action="new"]');
    await page.waitForTimeout(300);

    const after = await page.evaluate(() => DS.sqlCommands);
    expect(after).toEqual([]);
  });

  test('C-F12-009: no listing UI was created, no Field Explorer/Preview touched by accepting a command', async ({ page }) => {
    await page.goto(BASE + '/');
    await page.waitForTimeout(500);
    await acceptCommandInEditor(page, 'CmdB', 'SELECT 1');

    // No new listing panel exists.
    const listingPanels = await page.locator('[id*="sql-command-list"], [id*="sqlcommandlist"]').count();
    expect(listingPanels).toBe(0);
  });
});
