/**
 * document_preview_pdf_parity_live_smoke.test.mjs
 *
 * Live end-to-end smoke para paridad Preview/PDF.
 *
 * Cadena verificada:
 *   DocumentDataProvider.load()
 *     → DS._sampleData = dataset real del server
 *     → PreviewEngineRenderer.refresh() usa DS._sampleData (no SAMPLE_DATA)
 *     → exportPDF usa DS._sampleData (no SAMPLE_DATA)
 *     → Preview payload === PDF payload (misma referencia de datos)
 *
 * El endpoint /document/factura/42 se moquea con page.route() — no se
 * requieren credenciales SAP B1.
 *
 * Tests:
 *   T1  load() exitoso → DS._sampleData = dataset del server
 *   T2  DS._sampleData no es SAMPLE_DATA (no hay fallback)
 *   T3  Preview payload.data === DS._sampleData (campos clave)
 *   T4  PDF payload.data === DS._sampleData (campos clave)
 *   T5  Preview y PDF usan el MISMO dataset (identidad de contenido)
 *   T6  Error path: load() con 404 → DS._sampleData sin cambios
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  startRuntimeServer,
  launchRuntimePage,
  enterPreview,
  exitPreview,
  assertNoConsoleErrors,
} from './runtime_harness.mjs';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const CONTRACT    = 'rf.document.dataset.v1';
const SCHEMA_V_OK = '1.0.0';

const REAL_DATASET = {
  meta:    { doc_entry: 42, doc_num: 42, obj_type: '13', currency: 'USD' },
  empresa: {
    razon_social: 'DISTRIBUIDORA EPSON ECUADOR SA', nombre_comercial: 'EPSON',
    ruc: '0991234567001', direccion_matriz: 'Av. Principal 123', direccion_sucursal: null,
    obligado_contabilidad: 'SI', agente_retencion: 'NO',
  },
  cliente: {
    razon_social: 'SILVA LEON ROBERTO CARLOS', identificacion: '0923748188',
    direccion: '44 Y SEDALANA', email: null,
  },
  fiscal: {
    ambiente: '2', tipo_emision: '1', numero_documento: '001-001-000000042',
    numero_autorizacion: '2602202601091234567001120021010000204821234567818',
    fecha_autorizacion: '2026-02-26T09:32:10',
    clave_acceso: '2602202601091234567001120021010000204821234567818',
  },
  pago:    { forma_pago_fe: '01', total: 33.84 },
  items:   [
    { codigo: 'BCANA.12', descripcion: 'CANASTILLA INC. POSTERIOR TAIWAN DINT',
      cantidad: 30, precio_unitario: 0.10, descuento: 0, subtotal: 3.00 },
  ],
  totales: {
    subtotal_12: 29.43, subtotal_0: 0, subtotal_sin_impuestos: 29.43,
    iva_12: 4.41, importe_total: 33.84,
  },
};

const VALID_ENVELOPE = {
  contract:      CONTRACT,
  schemaVersion: SCHEMA_V_OK,
  docType:       'factura',
  docNumber:     42,
  retrievedAt:   '2026-06-30T00:00:00Z',
  dataset:       REAL_DATASET,
  validation:    { schemaOk: true, missingPaths: [], extraPaths: [], warnings: [] },
};

const NOT_FOUND_ENVELOPE = {
  contract:      CONTRACT,
  schemaVersion: SCHEMA_V_OK,
  error:         { code: 'DOC_NOT_FOUND', message: 'Documento no encontrado', details: 'DocEntry=999999999' },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

async function _callLoadInPage(page, docType, docNum) {
  return page.evaluate(
    async ({ docType, docNum }) => {
      try {
        return await DocumentDataProvider.load(docType, docNum);
      } catch (err) {
        return { ok: false, error: { code: 'JS_EXCEPTION', message: String(err), details: '' } };
      }
    },
    { docType, docNum },
  );
}

// ── Live smoke ────────────────────────────────────────────────────────────────

test('document_preview_pdf_parity live smoke', { timeout: 120000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl);

  try {
    // ── Setup interceptors BEFORE calling load() ─────────────────────────────
    // Use function predicates — the standard dev server is NOT FastAPI, so we
    // must intercept at the browser level before any request reaches the server.
    // String glob patterns don't match full URLs with query strings.

    // Mock: /document/factura/42 → real envelope
    // page.route() predicate receives a URL object, so use .href.includes()
    await page.route(
      url => url.href.includes('/document/factura/42'),
      async (route) => {
        await route.fulfill({
          status:      200,
          contentType: 'application/json',
          body:        JSON.stringify(VALID_ENVELOPE),
        });
      },
    );

    // Capture: /designer-preview request body
    let previewPayload = null;
    await page.route(
      url => url.href.includes('/designer-preview'),
      async (route) => {
        try { previewPayload = route.request().postDataJSON(); } catch (_) {}
        // Fulfill with minimal valid preview HTML so the render cycle completes
        await route.fulfill({
          status:      200,
          contentType: 'text/html',
          body:        '<div class="preview-render-layer"><div class="rpt-page" style="height:600px"></div></div>',
        });
      },
    );

    // Capture: /render (PDF export) request body
    let pdfPayload = null;
    await page.route(
      url => url.href.includes('/render'),
      async (route) => {
        try { pdfPayload = route.request().postDataJSON(); } catch (_) {}
        await route.fulfill({
          status:      200,
          contentType: 'application/pdf',
          body:        Buffer.from('%PDF-1.4 mock-rf-parity'),
        });
      },
    );

    // ── Snapshot SAMPLE_DATA before load ─────────────────────────────────────

    const sampleDataBefore = await page.evaluate(() => {
      // SAMPLE_DATA is the designer's default pre-load data
      return typeof SAMPLE_DATA !== 'undefined'
        ? JSON.parse(JSON.stringify(SAMPLE_DATA))
        : null;
    });

    // ── T1: load() exitoso → DS._sampleData = dataset del server ─────────────

    const loadResult = await _callLoadInPage(page, 'factura', 42);
    assert.equal(loadResult.ok, true, `load() debe ser ok:true, got: ${JSON.stringify(loadResult)}`);

    const dsAfterLoad = await page.evaluate(() => DS._sampleData
      ? JSON.parse(JSON.stringify(DS._sampleData))
      : null
    );

    assert.ok(dsAfterLoad, 'DS._sampleData no debe ser null después de load exitoso');
    assert.equal(dsAfterLoad.meta.doc_entry, 42, 'DS._sampleData.meta.doc_entry debe ser 42');
    assert.equal(dsAfterLoad.empresa.ruc, REAL_DATASET.empresa.ruc, 'empresa.ruc debe coincidir');
    assert.equal(dsAfterLoad.cliente.identificacion, REAL_DATASET.cliente.identificacion);
    assert.equal(dsAfterLoad.fiscal.numero_documento, REAL_DATASET.fiscal.numero_documento);

    // ── T2: DS._sampleData !== SAMPLE_DATA ───────────────────────────────────

    if (sampleDataBefore !== null) {
      // SAMPLE_DATA has a different doc_entry than our real dataset
      const sampleDocEntry = sampleDataBefore.meta?.doc_entry ?? null;
      assert.notEqual(
        dsAfterLoad.meta.doc_entry,
        sampleDocEntry,
        'DS._sampleData no debe ser SAMPLE_DATA — doc_entry debe diferir',
      );
    }

    // ── T3: Preview payload.data === DS._sampleData ───────────────────────────

    // Enter preview: this calls PreviewEngineRenderer.refresh() which POSTs to /designer-preview
    await enterPreview(page);
    await page.waitForTimeout(600);

    assert.ok(previewPayload !== null, 'El interceptor de /designer-preview debe haber capturado un payload');
    assert.ok(previewPayload.data, 'El payload de Preview debe tener campo "data"');
    assert.equal(
      previewPayload.data.meta?.doc_entry,
      42,
      'Preview payload.data.meta.doc_entry debe ser 42 (dataset real, no SAMPLE_DATA)',
    );
    assert.equal(previewPayload.data.empresa?.ruc, REAL_DATASET.empresa.ruc);
    assert.equal(previewPayload.data.fiscal?.numero_documento, REAL_DATASET.fiscal.numero_documento);

    // ── T4: PDF payload.data === DS._sampleData ───────────────────────────────

    await exitPreview(page);
    await page.waitForTimeout(300);

    // Trigger exportPDF with mocked URL/download methods
    await page.evaluate(async () => {
      const oldCreate = URL.createObjectURL;
      const oldRevoke = URL.revokeObjectURL;
      const oldClick  = HTMLAnchorElement.prototype.click;
      try {
        URL.createObjectURL = () => 'blob:rf-parity-test';
        URL.revokeObjectURL = () => {};
        HTMLAnchorElement.prototype.click = function() {};
        await CommandRuntimeFile.exportPDF();
      } finally {
        URL.createObjectURL = oldCreate;
        URL.revokeObjectURL = oldRevoke;
        HTMLAnchorElement.prototype.click = oldClick;
      }
    });
    await page.waitForTimeout(600);

    assert.ok(pdfPayload !== null, 'El interceptor de /render debe haber capturado un payload');
    assert.ok(pdfPayload.data, 'El payload de PDF debe tener campo "data"');
    assert.equal(
      pdfPayload.data.meta?.doc_entry,
      42,
      'PDF payload.data.meta.doc_entry debe ser 42 (dataset real, no SAMPLE_DATA)',
    );
    assert.equal(pdfPayload.data.empresa?.ruc, REAL_DATASET.empresa.ruc);
    assert.equal(pdfPayload.data.fiscal?.numero_documento, REAL_DATASET.fiscal.numero_documento);

    // ── T5: Preview y PDF usan el MISMO dataset ───────────────────────────────

    assert.deepEqual(
      previewPayload.data.meta,
      pdfPayload.data.meta,
      'Preview y PDF deben tener el mismo meta (mismos datos)',
    );
    assert.deepEqual(
      previewPayload.data.empresa,
      pdfPayload.data.empresa,
      'Preview y PDF deben tener los mismos datos de empresa',
    );
    assert.deepEqual(
      previewPayload.data.totales,
      pdfPayload.data.totales,
      'Preview y PDF deben tener los mismos totales',
    );

    // ── T6: Error path → DS._sampleData sin cambios ──────────────────────────

    // Keep track of DS._sampleData before the failed load
    const dsBeforeError = await page.evaluate(() =>
      DS._sampleData ? JSON.parse(JSON.stringify(DS._sampleData)) : null
    );

    // Route error response for a non-existent document.
    // Status 200 with error body — DocumentDataProvider checks body.error,
    // not the HTTP status, so this correctly exercises the error path without
    // triggering a Chromium console error (which logs all non-2xx fetch() calls).
    await page.route(
      url => url.href.includes('/document/factura/999999999'),
      async (route) => {
        await route.fulfill({
          status:      200,
          contentType: 'application/json',
          body:        JSON.stringify(NOT_FOUND_ENVELOPE),
        });
      },
    );

    const errorResult = await _callLoadInPage(page, 'factura', 999999999);
    assert.equal(errorResult.ok, false, 'load() con 404 debe retornar ok:false');
    assert.equal(errorResult.error.code, 'DOC_NOT_FOUND');

    const dsAfterError = await page.evaluate(() =>
      DS._sampleData ? JSON.parse(JSON.stringify(DS._sampleData)) : null
    );

    assert.deepEqual(
      dsAfterError,
      dsBeforeError,
      'DS._sampleData no debe cambiar después de un load() fallido',
    );

    // ── Console errors ────────────────────────────────────────────────────────

    await assertNoConsoleErrors(consoleErrors, 'document_preview_pdf_parity_live_smoke');

  } finally {
    await browser.close();
    await server.stop();
  }
});
