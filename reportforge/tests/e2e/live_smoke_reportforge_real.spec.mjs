/**
 * LIVE SMOKE RF — corre contra la app REAL de ReportForge.
 *
 * No usa mocks.
 * No valida snapshots frágiles.
 * Captura evidencia forense si falla: console errors, page errors, DOM, geometry,
 * canvas, Debug Center presence, preview HTML y browser name.
 *
 * Uso:
 *   RF_LIVE_BASE_URL=http://127.0.0.1:5017 \
 *   npx playwright test reportforge/tests/e2e/live_smoke_reportforge_real.spec.mjs -c pw.live.config.mjs --reporter=line
 */
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FACTURA_LAYOUT = JSON.parse(
  readFileSync(resolve(__dirname, '../../layouts/factura_a4.json'), 'utf-8')
);

const PROBES = {
  empresa: 'EMPRESA_RF_LIVE_OK',
  cliente: 'CLIENTE_RF_LIVE_OK',
  documento: 'DOC_RF_LIVE_OK',
  item: 'ITEM_RF_LIVE_OK',
};

async function snap(page, tag) {
  const state = await page.evaluate(() => {
    const rect = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        x: Math.round(r.x),
        y: Math.round(r.y),
        width: Math.round(r.width),
        height: Math.round(r.height),
        visible: r.width > 0 && r.height > 0,
      };
    };

    const textOf = (sel) => String(document.querySelector(sel)?.textContent || '').slice(0, 500);

    return {
      url: location.href,
      title: document.title,
      readyState: document.readyState,
      app: rect(document.querySelector('#app')),
      canvasArea: rect(document.querySelector('#canvas-area')),
      panelLeft: rect(document.querySelector('#panel-left')),
      panelRight: rect(document.querySelector('#panel-right')),
      report: rect(document.querySelector('.cr-report')),
      elementCount: document.querySelectorAll('.cr-element').length,
      sectionCount: document.querySelectorAll('.cr-section').length,
      selectedCount: document.querySelectorAll('.selected,[data-selected="true"],.is-selected').length,
      debugCenterPresent: !!window.RFDebugCenter,
      debugCenterRoot: !!document.querySelector('#rf-debug-center-root,[data-rf-debug-center-root]'),
      rfUiTraceLength: Array.isArray(window.RF_UI_TRACE) ? window.RF_UI_TRACE.length : null,
      bodyClasses: document.body.className,
      canvasText: textOf('#canvas-area'),
      visibleDialogs: Array.from(document.querySelectorAll('dialog,.modal,.rf-modal'))
        .filter((el) => {
          const s = getComputedStyle(el);
          const r = el.getBoundingClientRect();
          return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
        })
        .map((el) => ({ id: el.id, className: String(el.className).slice(0, 120) })),
    };
  });
  console.log(`RF-SNAP[${tag}]`, JSON.stringify(state));
  return state;
}

async function assertHealth(page) {
  const health = await page.evaluate(async () => {
    const r = await fetch('/health', { cache: 'no-store' });
    return { status: r.status, text: await r.text() };
  });

  console.log('RF-HEALTH', JSON.stringify(health));
  expect(health.status, '/health debe responder 200').toBe(200);
}

async function assertPreviewContract(page) {
  const result = await page.evaluate(async ({ probes, layout }) => {
    const payload = {
      layout,
      data: {
        empresa_razon_social: probes.empresa,
        empresa_ruc: '0991234567001',
        empresa_direccion_matriz: 'MATRIZ_RF_LIVE_OK',
        empresa_direccion_sucursal: 'SUCURSAL_RF_LIVE_OK',
        empresa_obligado_contabilidad: 'SI',
        empresa_agente_retencion: 'NO',

        cliente_razon_social: probes.cliente,
        cliente_identificacion: '0923748188',
        cliente_direccion: 'DIRECCION_RF_LIVE_OK',
        cliente_email: 'cliente@rf-live.test',

        fiscal_numero_documento: probes.documento,
        fiscal_numero_autorizacion: 'AUT_RF_LIVE_OK',
        fiscal_fecha_autorizacion: '2025-11-19T16:25:46',
        fiscal_ambiente: 'PRUEBAS',
        fiscal_emision: 'NORMAL',
        fiscal_clave_acceso: 'CLAVE_RF_LIVE_OK',

        totales_subtotal_15: 108.00,
        totales_subtotal_iva_0: 0.00,
        totales_subtotal_no_objeto_iva: 0.00,
        totales_subtotal_exento_iva: 0.00,
        totales_subtotal_sin_impuestos: 108.00,
        totales_descuento_total: 0.00,
        totales_valor_ice: 0.00,
        totales_iva_15: 16.20,
        totales_propina: 0.00,
        totales_valor_total: 124.20,

        items: [{
          codigo: 'RF001',
          descripcion: probes.item,
          cantidad: 1,
          precio_unitario: 10,
          descuento: 0,
          subtotal: 10,
        }],
      },
    };

    const preview = await fetch('/designer-preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const html = await preview.text();
    return {
      ok: preview.ok,
      status: preview.status,
      hasEmpresa: html.includes(probes.empresa),
      hasCliente: html.includes(probes.cliente),
      hasDocumento: html.includes(probes.documento),
      hasItem: html.includes(probes.item),
      hasTotal: html.includes('124.20'),
      htmlHead: html.slice(0, 300),
    };
  }, { probes: PROBES, layout: FACTURA_LAYOUT });

  console.log('RF-PREVIEW-CONTRACT', JSON.stringify(result));
  expect(result.ok, '/designer-preview debe responder OK').toBe(true);
  expect(result.hasEmpresa, 'preview debe renderizar empresa plana').toBe(true);
  expect(result.hasDocumento, 'preview debe renderizar documento plano').toBe(true);
  expect(result.hasItem, 'preview debe renderizar item real').toBe(true);
}


async function interactWithCanvas(page) {
  const firstElement = page.locator('.cr-element').first();
  await expect(firstElement, 'debe existir al menos un elemento visual real').toBeVisible();

  const box = await firstElement.boundingBox();
  expect(box, 'primer elemento debe tener bounding box').toBeTruthy();

  await firstElement.click({ trial: true });
  await firstElement.click();
  await page.waitForTimeout(300);

  const afterClick = await snap(page, 'after-canvas-click');
  expect(afterClick.canvasArea?.visible, '#canvas-area visible después de click').toBe(true);
}

test.describe('LIVE RF smoke real browsers', () => {
  test('boot real app + canvas + preview contract + forensic evidence', async ({ page, browserName }, testInfo) => {
    test.setTimeout(90_000);

    const errors = [];
    page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(`CONSOLE.ERROR: ${m.text().slice(0, 500)}`);
    });
    page.on('dialog', async (d) => {
      errors.push(`DIALOG: ${d.message().slice(0, 200)}`);
      await d.accept();
    });

    console.log('RF-LIVE-BROWSER', JSON.stringify({
      project: testInfo.project.name,
      browserName,
      baseURL: testInfo.project.use.baseURL,
    }));

    await page.goto('/?rf-debug=1&debug=1', { waitUntil: 'domcontentloaded' });
    await assertHealth(page);

    await page.waitForFunction(() => document.documentElement?.dataset?.rfRuntimeReady === '1', null, { timeout: 30_000 });
    await page.waitForSelector('#app', { timeout: 30_000 });
    await page.waitForSelector('#canvas-area', { timeout: 30_000 });

    const boot = await snap(page, 'boot');
    expect(boot.app?.visible, '#app visible').toBe(true);
    expect(boot.canvasArea?.visible, '#canvas-area visible').toBe(true);
    expect(boot.panelLeft?.visible, '#panel-left visible').toBe(true);
    expect(boot.panelRight?.visible, '#panel-right visible').toBe(true);
    expect(boot.elementCount, 'debe haber elementos reales en canvas').toBeGreaterThan(0);

    await interactWithCanvas(page);
    await assertPreviewContract(page);

    const finalSnap = await snap(page, 'final');

    const pauseMs = Number(process.env.RF_LIVE_PAUSE_MS || '3000');
    if (pauseMs > 0) {
      await page.waitForTimeout(pauseMs);
    }

    expect(finalSnap.visibleDialogs, 'no deben quedar modales bloqueantes abiertos').toEqual([]);
    expect(errors, 'sin pageerror/console.error/dialog inesperado').toEqual([]);
  });
});
