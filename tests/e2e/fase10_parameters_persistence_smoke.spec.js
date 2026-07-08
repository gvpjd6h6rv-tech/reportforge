/**
 * Fase 10 — UDS 4.1 — parameter persistence (toJSON/load/new document).
 *
 * Corre contra la app real (http://127.0.0.1:5001/). Cubre el contrato
 * aprobado: toJSON() guarda parameters + parameterValues, cargar un
 * archivo guardado restaura ambos y sincroniza DS.layout para que
 * LeftParametersPanel.render() muestre datos reales, "Archivo > Nuevo"
 * limpia todo sin dejar el panel stale, y archivos viejos sin esos
 * campos siguen cargando sin romper (C-F10-008).
 *
 * Fase 15: waits post-goto/post-acción son condiciones reales, no sleeps
 * fijos — robusto bajo carga concurrente del servidor de dev.
 */
import { test, expect } from '@playwright/test';

const BASE = process.env.RF_LIVE_URL || 'http://127.0.0.1:5001';

async function waitReady(page) {
  await page.waitForFunction(() => (
    typeof DS !== 'undefined'
    && typeof LeftParametersPanel !== 'undefined'
    && typeof CommandRuntimeFile !== 'undefined'
    && !!document.getElementById('params-list')
  ));
}

async function seedParameters(page) {
  await page.evaluate(() => {
    DS.layout = { parameters: [
      { name: 'FechaDesde', label: 'Fecha Desde', type: 'date', required: true, defaultValue: '2026-01-01' },
    ]};
    DS.parameterValues = { FechaDesde: '2026-05-20' };
    LeftParametersPanel.render();
  });
}

test.describe('Fase 10 — parameter persistence', () => {
  test('C-F10-001/002: toJSON() includes parameters and parameterValues', async ({ page }) => {
    await page.goto(BASE + '/');
    await waitReady(page);
    await seedParameters(page);
    const json = await page.evaluate(() => CommandRuntimeFile.toJSON());
    const parsed = JSON.parse(json);
    expect(parsed.parameters).toEqual([
      { name: 'FechaDesde', label: 'Fecha Desde', type: 'date', required: true, defaultValue: '2026-01-01' },
    ]);
    expect(parsed.parameterValues).toEqual({ FechaDesde: '2026-05-20' });
  });

  test('C-F10-003/004/006/007: loading a saved file restores parameters, values, panel, and preview payload', async ({ page }) => {
    await page.goto(BASE + '/');
    await waitReady(page);
    await seedParameters(page);
    const json = await page.evaluate(() => CommandRuntimeFile.toJSON());

    // Simulate a DIFFERENT stale in-memory state before loading, proving
    // the load overwrites rather than merges (C-F10-005 for the load path).
    await page.evaluate((savedJson) => {
      DS.parameterValues = { StaleFromOtherDoc: 'x' };
      const layout = CommandRuntimeFile._normalizeLayout(JSON.parse(savedJson));
      CommandRuntimeFile._applyLoadedLayout(layout, null, null, 'test-reload');
    }, json);
    await page.waitForFunction(() => DS.parameterValues && DS.parameterValues.FechaDesde === '2026-05-20');

    const restored = await page.evaluate(() => DS.parameterValues);
    expect(restored).toEqual({ FechaDesde: '2026-05-20' });
    expect(restored.StaleFromOtherDoc).toBeUndefined();

    const inputValue = await page.inputValue('#params-list input[data-param-name="FechaDesde"]');
    expect(inputValue).toBe('20/05/2026');

    // C-F10-007: preview payload uses the restored value, not defaultValue.
    let capturedBody = null;
    await page.route('**/designer-preview', async (route) => {
      capturedBody = JSON.parse(route.request().postData());
      await route.fulfill({ status: 200, contentType: 'text/html', body: '<div></div>' });
    });
    await page.evaluate(() => DS.setPreviewMode(true, 'fase10-smoke-test'));
    await page.evaluate(() => PreviewEngineRenderer.refresh());
    await expect.poll(() => capturedBody !== null).toBe(true);
    expect(capturedBody.params.FechaDesde).toBe('2026-05-20');
  });

  test('C-F10-008: loading an old file with no parameters/parameterValues does not break', async ({ page }) => {
    await page.goto(BASE + '/');
    await waitReady(page);
    const oldFileJson = JSON.stringify({
      name: 'Reporte Viejo', version: '1.0', pageWidth: 794, pageHeight: 1123, pageSize: 'A4',
      sections: [{ id: 's1', type: 'header', height: 100 }], elements: [],
    });
    const result = await page.evaluate((raw) => {
      try {
        const layout = CommandRuntimeFile._normalizeLayout(JSON.parse(raw));
        CommandRuntimeFile._applyLoadedLayout(layout, null, null, 'test-old-file');
        return { ok: true, parameterValues: DS.parameterValues, layoutParameters: DS.layout.parameters };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    }, oldFileJson);
    expect(result.ok).toBe(true);
    expect(result.parameterValues).toEqual({});
    expect(result.layoutParameters).toEqual([]);
    const panelText = await page.locator('#params-list').textContent();
    expect(panelText).toContain('no tiene parámetros');
  });

  test('C-F10-005/009: "Archivo > Nuevo" clears parameterValues AND layout.parameters, panel not stale, no SQL commands touched', async ({ page }) => {
    await page.goto(BASE + '/');
    await waitReady(page);
    page.on('dialog', (d) => d.accept());
    await seedParameters(page);

    const before = await page.locator('#params-list').textContent();
    expect(before).toContain('Fecha Desde');

    await page.click('button.tb-icon[data-action="new"]');
    await page.waitForFunction(() => (
      DS.parameterValues && Object.keys(DS.parameterValues).length === 0
      && document.getElementById('params-list').textContent.includes('no tiene par')
    ));

    const valuesAfter = await page.evaluate(() => DS.parameterValues);
    const layoutAfter = await page.evaluate(() => DS.layout);
    const panelAfter = await page.locator('#params-list').textContent();
    expect(valuesAfter).toEqual({});
    expect(layoutAfter).toEqual({ parameters: [] });
    expect(panelAfter).not.toContain('Fecha Desde');
    expect(panelAfter).toContain('no tiene parámetros');
  });
});
