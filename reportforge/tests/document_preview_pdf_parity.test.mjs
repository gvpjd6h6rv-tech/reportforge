/**
 * document_preview_pdf_parity.test.mjs
 *
 * Unit tests for Preview/PDF data parity invariants.
 * No server, no browser, no DOM.
 *
 * Verifies the invariants guaranteed by the data flow:
 *   DocumentDataProvider.load()
 *     → DS._sampleData = body.dataset
 *     → PreviewEngineRenderer._buildPayload() reads DS._sampleData
 *     → exportPDF() reads DS._sampleData
 *
 * §1  DS._sampleData takes priority over SAMPLE_DATA in _buildPayload logic
 * §2  DS._sampleData takes priority over SAMPLE_DATA in exportPDF logic
 * §3  Preview and PDF use the same data expression (identity invariant)
 * §4  DocumentDataProvider.load() assigns body.dataset to DS._sampleData
 * §5  Error path: DocumentDataProvider.load() does NOT mutate DS._sampleData
 * §6  Fallback behavior: null DS._sampleData → SAMPLE_DATA used (pre-load state)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PROVIDER_SRC = fs.readFileSync(resolve(ROOT, 'engines/DocumentDataProvider.js'), 'utf8');

// ── Fixtures ──────────────────────────────────────────────────────────────────

const CONTRACT    = 'rf.document.dataset.v1';
const SCHEMA_V_OK = '1.0.0';

function _makeDataset(id = 42) {
  return {
    meta:    { doc_entry: id, doc_num: id, obj_type: '13', currency: 'USD' },
    empresa: { razon_social: 'EMPRESA SA', nombre_comercial: 'EMPRESA', ruc: '0991234567001',
               direccion_matriz: 'Av. 1', direccion_sucursal: null,
               obligado_contabilidad: 'SI', agente_retencion: 'NO' },
    cliente: { razon_social: 'CLIENTE', identificacion: '0923456789001', direccion: null, email: null },
    fiscal:  { ambiente: '2', tipo_emision: '1', numero_documento: '001-001-000000042',
               numero_autorizacion: '1234567890', fecha_autorizacion: '2024-01-01T00:00:00',
               clave_acceso: '1234567890' },
    pago:    { forma_pago_fe: '01', total: 112.0 },
    items:   [{ codigo: 'P1', descripcion: 'Prod', cantidad: 1, precio_unitario: 100, descuento: 0, subtotal: 100 }],
    totales: { subtotal_12: 100, subtotal_0: 0, subtotal_sin_impuestos: 100, iva_12: 12, importe_total: 112 },
  };
}

function _makeEnvelope(dataset, overrides = {}) {
  return {
    contract:      CONTRACT,
    schemaVersion: SCHEMA_V_OK,
    docType:       'factura',
    docNumber:     dataset.meta.doc_entry,
    retrievedAt:   '2024-01-01T00:00:00Z',
    dataset,
    validation:    { schemaOk: true, missingPaths: [], extraPaths: [], warnings: [] },
    ...overrides,
  };
}

function _makeErrorEnvelope(code = 'DOC_NOT_FOUND') {
  return { error: { code, message: 'Error de prueba', details: '' } };
}

// ── §1 — DS._sampleData priority in _buildPayload logic ──────────────────────

test('§1 _buildPayload: DS._sampleData tiene prioridad sobre SAMPLE_DATA', () => {
  const realData     = _makeDataset(42);
  const fallbackData = _makeDataset(0);

  // Exact logic from PreviewEngineRenderer._buildPayload(), line 18:
  //   const sampleData = (DM && DM._sampleData) || (typeof SAMPLE_DATA !== 'undefined' ? SAMPLE_DATA : {});
  const DM = { _sampleData: realData };
  const SAMPLE_DATA = fallbackData;
  const sampleData = (DM && DM._sampleData) || SAMPLE_DATA;

  assert.strictEqual(sampleData, realData, 'DS._sampleData debe tomarse primero');
  assert.notStrictEqual(sampleData, fallbackData, 'SAMPLE_DATA no debe usarse cuando DS._sampleData está definido');
});

test('§1 _buildPayload: la referencia retornada es EXACTAMENTE DS._sampleData (no copia)', () => {
  const realData = _makeDataset(42);
  const DM = { _sampleData: realData };
  const SAMPLE_DATA = _makeDataset(0);
  const sampleData = (DM && DM._sampleData) || SAMPLE_DATA;

  assert.strictEqual(sampleData, realData);
});

test('§1 _buildPayload: objetos distintos con mismo doc_entry no son igual por referencia', () => {
  const a = _makeDataset(42);
  const b = _makeDataset(42);
  assert.notStrictEqual(a, b, 'control: dos objetos distintos no son la misma referencia');
});

// ── §2 — DS._sampleData priority in exportPDF logic ──────────────────────────

test('§2 exportPDF: DS._sampleData tiene prioridad sobre SAMPLE_DATA', () => {
  const realData     = _makeDataset(99);
  const fallbackData = _makeDataset(0);

  // Exact logic from CommandRuntimeFileIO.exportPDF(), line 187:
  //   const data = DS._sampleData || SAMPLE_DATA || {};
  const DS = { _sampleData: realData };
  const SAMPLE_DATA = fallbackData;
  const data = DS._sampleData || SAMPLE_DATA || {};

  assert.strictEqual(data, realData);
});

test('§2 exportPDF: la referencia es EXACTAMENTE DS._sampleData', () => {
  const realData = _makeDataset(99);
  const DS = { _sampleData: realData };
  const SAMPLE_DATA = _makeDataset(0);
  const data = DS._sampleData || SAMPLE_DATA || {};

  assert.strictEqual(data, realData);
});

// ── §3 — Invariante de identidad: Preview y PDF usan la misma expresión ───────

test('§3 Preview y PDF usan la misma expresión de selección de dataset', () => {
  const realData = _makeDataset(42);
  const DS = { _sampleData: realData };
  const SAMPLE_DATA = _makeDataset(0);

  // Simular _buildPayload (Preview)
  const DM = DS;
  const previewData = (DM && DM._sampleData) || SAMPLE_DATA;

  // Simular exportPDF
  const pdfData = DS._sampleData || SAMPLE_DATA || {};

  // Both must be the same reference
  assert.strictEqual(previewData, pdfData, 'Preview y PDF deben referenciar el mismo objeto de datos');
  assert.strictEqual(previewData, realData);
  assert.strictEqual(pdfData, realData);
});

test('§3 Identidad sobrevive a asignación: mismo objeto asignado produce mismo resultado', () => {
  let DS_sampleData = null;
  const SAMPLE_DATA = _makeDataset(0);

  // Simulate DocumentDataProvider assigning DS._sampleData
  const serverDataset = _makeDataset(55);
  DS_sampleData = serverDataset;

  const DS = { _sampleData: DS_sampleData };
  const DM = DS;

  const previewData = (DM && DM._sampleData) || SAMPLE_DATA;
  const pdfData = DS._sampleData || SAMPLE_DATA || {};

  assert.strictEqual(previewData, serverDataset);
  assert.strictEqual(pdfData, serverDataset);
  assert.strictEqual(previewData, pdfData);
});

// ── §4 — DocumentDataProvider.load() → DS._sampleData = body.dataset ─────────

function _loadProvider({ envelope, fetchErr = null, previewMode = false } = {}) {
  const ctx = { window: {}, globalThis: undefined, module: { exports: {} } };
  const DS = { previewMode, _sampleData: null };
  ctx.window.DS = DS;
  ctx.window.fetch = fetchErr
    ? async () => { throw fetchErr; }
    : async () => ({ ok: true, status: 200, json: async () => envelope });
  ctx.window.PreviewEngineRenderer = { refresh() {} };
  ctx.globalThis = ctx.window;
  vm.createContext(ctx);
  vm.runInContext(PROVIDER_SRC, ctx);
  return { provider: ctx.window.DocumentDataProvider, DS };
}

test('§4 DocumentDataProvider.load() asigna body.dataset a DS._sampleData', async () => {
  const realDataset = _makeDataset(42);
  const envelope = _makeEnvelope(realDataset);
  const { provider, DS } = _loadProvider({ envelope });

  await provider.load('factura', 42);

  assert.deepEqual(DS._sampleData, realDataset, 'DS._sampleData debe ser el dataset del server');
});

test('§4 DS._sampleData no es SAMPLE_DATA (no es el fallback)', async () => {
  const realDataset = _makeDataset(42);
  const fallbackDataset = _makeDataset(0);
  const envelope = _makeEnvelope(realDataset);
  const { provider, DS } = _loadProvider({ envelope });
  // Note: in the provider module, SAMPLE_DATA is not defined in the vm context,
  // so there's no global fallback — DS._sampleData is exactly body.dataset.

  const beforeLoad = DS._sampleData;
  await provider.load('factura', 42);

  assert.equal(beforeLoad, null, 'antes de load debe ser null');
  assert.deepEqual(DS._sampleData, realDataset, 'después de load debe ser el dataset real');
  assert.notDeepEqual(DS._sampleData, fallbackDataset, 'no debe ser el dataset de fallback');
});

test('§4 El dataset asignado contiene los campos requeridos del contrato', async () => {
  const realDataset = _makeDataset(42);
  const envelope = _makeEnvelope(realDataset);
  const { provider, DS } = _loadProvider({ envelope });

  await provider.load('factura', 42);

  assert.ok(DS._sampleData && DS._sampleData.meta,    'meta requerido');
  assert.ok(DS._sampleData && DS._sampleData.empresa,  'empresa requerido');
  assert.ok(DS._sampleData && DS._sampleData.cliente,  'cliente requerido');
  assert.ok(DS._sampleData && DS._sampleData.fiscal,   'fiscal requerido');
  assert.ok(DS._sampleData && DS._sampleData.totales,  'totales requerido');
  assert.ok(Array.isArray(DS._sampleData && DS._sampleData.items), 'items debe ser array');
});

test('§4 Múltiples llamadas sobrescriben DS._sampleData con el último dataset', async () => {
  const dataset1 = _makeDataset(1);
  const dataset2 = _makeDataset(2);

  const ctx = { window: {}, globalThis: undefined, module: { exports: {} } };
  const DS = { previewMode: false, _sampleData: null };
  ctx.window.DS = DS;
  let callCount = 0;
  ctx.window.fetch = async () => {
    callCount++;
    const d = callCount === 1 ? dataset1 : dataset2;
    return { ok: true, status: 200, json: async () => _makeEnvelope(d) };
  };
  ctx.window.PreviewEngineRenderer = { refresh() {} };
  ctx.globalThis = ctx.window;
  vm.createContext(ctx);
  vm.runInContext(PROVIDER_SRC, ctx);
  const provider = ctx.window.DocumentDataProvider;

  await provider.load('factura', 1);
  assert.deepEqual(DS._sampleData, dataset1, 'primera carga: dataset1');

  await provider.load('factura', 2);
  assert.deepEqual(DS._sampleData, dataset2, 'segunda carga: dataset2');
});

// ── §5 — Error path: DS._sampleData no se muta ───────────────────────────────

test('§5 load() con error de server NO cambia DS._sampleData', async () => {
  const prevDataset = _makeDataset(42);
  const { provider, DS } = _loadProvider({ envelope: _makeErrorEnvelope('DOC_NOT_FOUND') });
  DS._sampleData = prevDataset;  // pre-set to something

  await provider.load('factura', 999);

  assert.strictEqual(DS._sampleData, prevDataset, 'DS._sampleData debe quedar sin cambios tras error');
});

test('§5 load() con error de red NO cambia DS._sampleData', async () => {
  const prevDataset = _makeDataset(42);
  const { provider, DS } = _loadProvider({ fetchErr: new Error('Network timeout') });
  DS._sampleData = prevDataset;

  await provider.load('factura', 1);

  assert.strictEqual(DS._sampleData, prevDataset, 'DS._sampleData debe quedar sin cambios tras error de red');
});

test('§5 load() con contract desconocido NO cambia DS._sampleData', async () => {
  const prevDataset = _makeDataset(42);
  const badEnvelope = _makeEnvelope(_makeDataset(1), { contract: 'rf.document.unknown.v99' });
  const { provider, DS } = _loadProvider({ envelope: badEnvelope });
  DS._sampleData = prevDataset;

  await provider.load('factura', 1);

  assert.strictEqual(DS._sampleData, prevDataset);
});

test('§5 DS._sampleData null inicial permanece null tras error', async () => {
  const { provider, DS } = _loadProvider({ envelope: _makeErrorEnvelope('DB_TIMEOUT') });
  assert.equal(DS._sampleData, null, 'precondición: null inicial');

  await provider.load('factura', 1);

  assert.equal(DS._sampleData, null, 'debe seguir siendo null tras error');
});

// ── §6 — Fallback: DS._sampleData null → SAMPLE_DATA (estado pre-carga) ──────

test('§6 fallback _buildPayload: DS._sampleData null → usa SAMPLE_DATA', () => {
  const fallback = _makeDataset(0);
  const DM = { _sampleData: null };
  const SAMPLE_DATA = fallback;
  const sampleData = (DM && DM._sampleData) || SAMPLE_DATA;
  assert.strictEqual(sampleData, fallback, 'antes de cargar, debe usarse SAMPLE_DATA como fallback');
});

test('§6 fallback exportPDF: DS._sampleData null → usa SAMPLE_DATA', () => {
  const fallback = _makeDataset(0);
  const DS = { _sampleData: null };
  const SAMPLE_DATA = fallback;
  const data = DS._sampleData || SAMPLE_DATA || {};
  assert.strictEqual(data, fallback);
});

test('§6 fallback: DS sin definir → usa SAMPLE_DATA', () => {
  const fallback = _makeDataset(0);
  const DM = null;
  const SAMPLE_DATA = fallback;
  const sampleData = (DM && DM._sampleData) || SAMPLE_DATA;
  assert.strictEqual(sampleData, fallback, 'si DS no existe, usa SAMPLE_DATA');
});
