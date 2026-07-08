/**
 * Fase 11 — UDS 4.1 — Stored Procedure Picker smoke.
 *
 * Corre contra la app real (http://127.0.0.1:5001/). Cubre: el botón
 * abre el modal, lista datasources reales, ningún datasource (incluidos
 * los mssql inalcanzables ya registrados en este entorno) causa fallo
 * silencioso (RF-STORED-PROC-PICKER-STDLIB-1, encontrado en smoke real:
 * antes producía ERR_EMPTY_RESPONSE), y el flujo completo
 * seleccionar→parámetros→build-command→abrir SqlCommandEditor funciona
 * end-to-end contra el backend real (solo el listado de procedures se
 * mockea, ya que ningún datasource de este entorno tiene procedures
 * reales listables).
 *
 * Fase 15: waits post-goto/post-acción son condiciones reales, no sleeps
 * fijos — robusto bajo carga concurrente del servidor de dev.
 */
import { test, expect } from '@playwright/test';

const BASE = process.env.RF_LIVE_URL || 'http://127.0.0.1:5001';
const TEST_ALIAS = 'fase11_e2e_test_alias';

async function waitReady(page) {
  await page.waitForFunction(() => (
    typeof StoredProcedurePicker !== 'undefined'
    && !!document.getElementById('btn-stored-procedure-picker')
  ));
}

async function waitDatasourceOptionsLoaded(page) {
  await page.waitForFunction(() => {
    const sel = document.getElementById('spp-datasource');
    return !!sel && sel.options.length > 0 && sel.options[0].textContent !== '(cargando…)';
  });
}

async function waitProceduresListSettled(page) {
  await page.waitForFunction(() => {
    const list = document.getElementById('spp-procedures');
    return !!list && list.children.length > 0;
  });
}

test.describe('Fase 11 — Stored Procedure Picker', () => {
  test.beforeEach(async ({ request }) => {
    await request.post(BASE + '/datasources', {
      data: { alias: TEST_ALIAS, type: 'sqlite', url: 'sqlite:///:memory:' },
    });
  });

  test.afterEach(async ({ request }) => {
    await request.delete(BASE + '/datasources/' + TEST_ALIAS);
  });

  test('button opens the modal and lists registered datasources without silent failures', async ({ page }) => {
    const failedRequests = [];
    page.on('requestfailed', (req) => failedRequests.push(req.url()));
    await page.goto(BASE + '/');
    await waitReady(page);

    await page.click('#btn-stored-procedure-picker');
    await waitDatasourceOptionsLoaded(page);
    expect(await page.locator('#stored-procedure-picker-overlay').count()).toBe(1);

    const options = await page.locator('#spp-datasource option').all();
    expect(options.length).toBeGreaterThan(0);

    // Click through every registered datasource — none may hang/fail silently
    // (RF-STORED-PROC-PICKER-STDLIB-1 regression guard).
    const values = await page.evaluate(() => [...document.getElementById('spp-datasource').options].map((o) => o.value));
    for (const alias of values) {
      if (!alias) continue;
      await page.selectOption('#spp-datasource', alias);
      await waitProceduresListSettled(page);
    }
    expect(failedRequests).toEqual([]);
  });

  test('full flow: select procedure -> read parameters -> build-command -> opens SqlCommandEditor', async ({ page }) => {
    await page.route(`**/datasources/${TEST_ALIAS}/procedures`, (route) => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ alias: TEST_ALIAS, procedures: ['VentasPorFecha'], warnings: [] }),
    }));
    await page.route(`**/datasources/${TEST_ALIAS}/procedures/VentasPorFecha/parameters`, (route) => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        alias: TEST_ALIAS, procedure: 'VentasPorFecha',
        parameters: [{ name: 'FechaDesde', type: 'date', default: null, required: false, source: 'procedure_param' }],
        warnings: [],
      }),
    }));
    // build-command is NOT mocked — exercises the real backend route.

    await page.goto(BASE + '/');
    await waitReady(page);
    await page.click('#btn-stored-procedure-picker');
    await waitDatasourceOptionsLoaded(page);
    await page.selectOption('#spp-datasource', TEST_ALIAS);
    await waitProceduresListSettled(page);
    await page.click('#spp-procedures div');
    await page.waitForSelector('#sql-command-editor-overlay');

    const resultText = await page.locator('#spp-result').textContent();
    expect(resultText).toContain('NO guardado permanentemente');
    expect(resultText).toContain('EXEC VentasPorFecha :FechaDesde');

    const editorOpen = await page.locator('#sql-command-editor-overlay').count();
    expect(editorOpen).toBe(1);
    const editorSql = await page.inputValue('#sce-sql');
    expect(editorSql).toBe('EXEC VentasPorFecha :FechaDesde');
  });

  test('dangerous procedure name is rejected by the backend, not silently accepted', async ({ page }) => {
    await page.route(`**/datasources/${TEST_ALIAS}/procedures`, (route) => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ alias: TEST_ALIAS, procedures: ['xp_cmdshell'], warnings: [] }),
    }));
    await page.route(`**/datasources/${TEST_ALIAS}/procedures/xp_cmdshell/parameters`, (route) => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ alias: TEST_ALIAS, procedure: 'xp_cmdshell', parameters: [], warnings: [] }),
    }));

    await page.goto(BASE + '/');
    await waitReady(page);
    await page.click('#btn-stored-procedure-picker');
    await waitDatasourceOptionsLoaded(page);
    await page.selectOption('#spp-datasource', TEST_ALIAS);
    await waitProceduresListSettled(page);
    await page.click('#spp-procedures div');
    await page.waitForFunction(() => (document.getElementById('spp-result')?.textContent || '').includes('No se pudo construir'));

    const resultText = await page.locator('#spp-result').textContent();
    expect(resultText).toContain('No se pudo construir el comando');
    const editorOpen = await page.locator('#sql-command-editor-overlay').count();
    expect(editorOpen).toBe(0);
  });
});
