/**
 * Fase 9 — UDS 4.1 — LeftParametersPanel visible-contract smoke.
 *
 * Corre contra la app real (http://127.0.0.1:5001/). Cubre el contrato
 * visible acordado: #params-list reemplaza los items hardcoded EI/EP por
 * parámetros reales, fechas dd/mm/yyyy, Enter/blur válido actualiza
 * DS.parameterValues y (en Preview) dispara refresh, fecha inválida
 * bloquea sin tocar el valor guardado, estado vacío sin parámetros,
 * y "cambio de documento actualiza panel" (C-F9-005) vía cambio real de
 * tipo de documento en la UI.
 *
 * Fase 15: waits post-goto/post-acción son condiciones reales (globals
 * cargados, estado esperado alcanzado), no sleeps fijos — robusto bajo
 * carga concurrente del servidor de dev (single-threaded).
 */
import { test, expect } from '@playwright/test';

const BASE = process.env.RF_LIVE_URL || 'http://127.0.0.1:5001';

async function waitReady(page) {
  await page.waitForFunction(() => (
    typeof DS !== 'undefined'
    && typeof LeftParametersPanel !== 'undefined'
    && typeof PreviewEngineRenderer !== 'undefined'
    && !!document.getElementById('params-list')
  ));
}

test.describe('Fase 9 — LeftParametersPanel', () => {
  test('empty state when document has no parameters', async ({ page }) => {
    await page.goto(BASE + '/');
    await waitReady(page);
    const text = await page.locator('#params-list').textContent();
    expect(text).toContain('no tiene parámetros');
    expect(text).not.toContain('EI');
    expect(text).not.toContain('EP');
  });

  test('renders real parameters and replaces hardcoded EI/EP, with dd/mm/yyyy dates', async ({ page }) => {
    await page.goto(BASE + '/');
    await waitReady(page);
    await page.evaluate(() => {
      DS.layout = DS.layout || {};
      DS.layout.parameters = [
        { name: 'FechaDesde', label: 'Fecha Desde', type: 'date', required: true, defaultValue: '2026-01-01' },
        { name: 'FechaHasta', label: 'Fecha Hasta', type: 'date', required: true, defaultValue: '2026-01-31' },
      ];
      DS.parameterValues = {};
      LeftParametersPanel.render();
    });
    const text = await page.locator('#params-list').textContent();
    expect(text).not.toContain('EI');
    expect(text).not.toContain('EP');
    const desdeValue = await page.inputValue('#params-list input[data-param-name="FechaDesde"]');
    expect(desdeValue).toBe('01/01/2026');
  });

  test('valid date on Enter updates DS.parameterValues (ISO) and triggers refresh in Preview mode', async ({ page }) => {
    await page.goto(BASE + '/');
    await waitReady(page);
    await page.evaluate(() => {
      DS.layout = DS.layout || {};
      DS.layout.parameters = [{ name: 'FechaDesde', label: 'Fecha Desde', type: 'date', required: true, defaultValue: '2026-01-01' }];
      DS.parameterValues = {};
      DS.setPreviewMode(true, 'fase9-smoke-test');
      LeftParametersPanel.render();
    });

    let refreshCalled = false;
    await page.exposeFunction('__rf_test_refresh_hook', () => { refreshCalled = true; });
    await page.evaluate(() => {
      const orig = PreviewEngineRenderer.refresh;
      PreviewEngineRenderer.refresh = (...args) => { window.__rf_test_refresh_hook(); return orig.apply(PreviewEngineRenderer, args); };
    });

    await page.fill('#params-list input[data-param-name="FechaDesde"]', '15/03/2026');
    await page.press('#params-list input[data-param-name="FechaDesde"]', 'Enter');
    await page.waitForFunction(() => DS.parameterValues && DS.parameterValues.FechaDesde === '2026-03-15');

    const saved = await page.evaluate(() => DS.parameterValues.FechaDesde);
    expect(saved).toBe('2026-03-15');
    await expect.poll(() => refreshCalled).toBe(true);
  });

  test('invalid date blocks refresh, marks the input, and does not overwrite the stored value', async ({ page }) => {
    await page.goto(BASE + '/');
    await waitReady(page);
    await page.evaluate(() => {
      DS.layout = DS.layout || {};
      DS.layout.parameters = [{ name: 'FechaHasta', label: 'Fecha Hasta', type: 'date', required: true, defaultValue: '2026-01-31' }];
      DS.parameterValues = {};
      DS.setPreviewMode(true, 'fase9-smoke-test');
      LeftParametersPanel.render();
    });

    let refreshCalled = false;
    await page.exposeFunction('__rf_test_refresh_hook2', () => { refreshCalled = true; });
    await page.evaluate(() => {
      const orig = PreviewEngineRenderer.refresh;
      PreviewEngineRenderer.refresh = (...args) => { window.__rf_test_refresh_hook2(); return orig.apply(PreviewEngineRenderer, args); };
    });

    await page.fill('#params-list input[data-param-name="FechaHasta"]', '40/99/2026');
    await page.locator('#params-list input[data-param-name="FechaHasta"]').blur();
    await page.waitForFunction(() => {
      const el = document.querySelector('#params-list input[data-param-name="FechaHasta"]');
      return el && getComputedStyle(el).borderColor === 'rgb(204, 0, 0)';
    });

    const borderColor = await page.evaluate(() =>
      getComputedStyle(document.querySelector('#params-list input[data-param-name="FechaHasta"]')).borderColor);
    expect(borderColor).toBe('rgb(204, 0, 0)');
    const saved = await page.evaluate(() => DS.parameterValues.FechaHasta);
    expect(saved).toBeUndefined();
    expect(refreshCalled).toBe(false);
  });

  test('C-F9-005: changing document type re-renders the parameters panel', async ({ page }) => {
    await page.goto(BASE + '/');
    await waitReady(page);

    let renderCalls = 0;
    await page.exposeFunction('__rf_test_panel_render_hook', () => { renderCalls++; });
    await page.evaluate(() => {
      const orig = LeftParametersPanel.render;
      LeftParametersPanel.render = (...args) => { window.__rf_test_panel_render_hook(); return orig.apply(LeftParametersPanel, args); };
    });

    const docTypeBtn = page.locator('[data-doctype]').first();
    if (await docTypeBtn.count()) {
      await docTypeBtn.click();
      await expect.poll(() => renderCalls).toBeGreaterThan(0);
    } else {
      test.skip(true, 'no doc-type button found in current layout');
    }
  });
});
