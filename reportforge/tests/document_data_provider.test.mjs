/**
 * document_data_provider.test.mjs
 *
 * Tests de contrato para DocumentDataProvider.load().
 * Sin DOM. Sin server real. Sin PreviewEngine.
 * Todos los tests son unit — estado completamente aislado por fixture.
 *
 * Escenarios cubiertos:
 *   §1  acepta response válido y asigna DS._sampleData
 *   §2  rechaza contract desconocido
 *   §3  rechaza major incompatible (e.g. v2)
 *   §4  acepta minor compatible (e.g. 1.5.0 — mismo major=1)
 *   §5  rechaza schemaOk:false
 *   §6  conserva error.code/details del servidor
 *   §7  si preview activo, llama refresh()
 *   §8  si preview inactivo, no llama refresh()
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SRC  = fs.readFileSync(resolve(ROOT, 'engines/DocumentDataProvider.js'), 'utf8');

const CONTRACT     = 'rf.document.dataset.v1';
const SCHEMA_V_OK  = '1.0.0';

// ── Fixtures ────────────────────────────────────────────────────────────────

function _makeDataset() {
  return {
    meta:    { doc_entry: 42, doc_num: 7, obj_type: '13', currency: 'USD' },
    empresa: { razon_social: 'EMPRESA S.A.', nombre_comercial: 'EMPRESA', ruc: '0991234567001',
               direccion_matriz: 'Av. 1', direccion_sucursal: null, obligado_contabilidad: 'SI', agente_retencion: 'NO' },
    cliente: { razon_social: 'CLIENTE', identificacion: '0923456789001', direccion: null, email: null },
    fiscal:  { ambiente: '2', tipo_emision: '1', numero_documento: '001-001-000000042',
               numero_autorizacion: '1234567890', fecha_autorizacion: '2024-01-01T00:00:00', clave_acceso: '1234567890' },
    pago:    { forma_pago_fe: '01', total: 112.0 },
    items:   [{ codigo: 'P1', descripcion: 'Prod', cantidad: 1, precio_unitario: 100, descuento: 0, subtotal: 100 }],
    totales: { subtotal_12: 100, subtotal_0: 0, subtotal_sin_impuestos: 100, iva_12: 12, importe_total: 112 },
  };
}

function _makeValidEnvelope(overrides = {}) {
  return {
    contract:      CONTRACT,
    schemaVersion: SCHEMA_V_OK,
    docType:       'factura',
    docNumber:     42,
    retrievedAt:   '2024-01-01T00:00:00Z',
    dataset:       _makeDataset(),
    validation:    { schemaOk: true, missingPaths: [], extraPaths: [], warnings: [] },
    ...overrides,
  };
}

// Creates an isolated vm context with mocked dependencies.
function _load({ envelope = null, fetchErr = null, previewMode = false, hasRenderer = true } = {}) {
  const refresh_calls = [];

  const ctx = { window: {}, globalThis: undefined, module: { exports: {} } };
  ctx.window.DS = { previewMode, _sampleData: null };
  ctx.window.fetch = fetchErr
    ? async () => { throw fetchErr; }
    : async () => ({ ok: true, status: 200, json: async () => envelope });
  ctx.window.PreviewEngineRenderer = hasRenderer
    ? { refresh() { refresh_calls.push(1); } }
    : null;
  ctx.globalThis = ctx.window;
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);

  const provider = ctx.window.DocumentDataProvider;
  const DS       = ctx.window.DS;
  return { provider, DS, refresh_calls };
}

// ── §1 — Response válido → ok:true, DS._sampleData asignado ────────────────

test('§1 load() resuelve ok:true para response válido', async () => {
  const { provider } = _load({ envelope: _makeValidEnvelope() });
  const result = await provider.load('factura', 42);
  assert.equal(result.ok, true);
});

test('§1 load() asigna DS._sampleData con el dataset del server', async () => {
  const { provider, DS } = _load({ envelope: _makeValidEnvelope() });
  await provider.load('factura', 42);
  assert.deepEqual(DS._sampleData, _makeDataset());
});

test('§1 load() devuelve el dataset en result.dataset', async () => {
  const { provider } = _load({ envelope: _makeValidEnvelope() });
  const result = await provider.load('factura', 42);
  assert.deepEqual(result.dataset, _makeDataset());
});

// ── §2 — Contract desconocido ───────────────────────────────────────────────

test('§2 rechaza contract desconocido — ok:false', async () => {
  const env = _makeValidEnvelope({ contract: 'rf.document.unknown.v1' });
  const { provider, DS } = _load({ envelope: env });
  const result = await provider.load('factura', 42);
  assert.equal(result.ok, false);
});

test('§2 rechaza contract desconocido — code CONTRACT_MISMATCH', async () => {
  const env = _makeValidEnvelope({ contract: 'rf.document.unknown.v1' });
  const { provider } = _load({ envelope: env });
  const result = await provider.load('factura', 42);
  assert.equal(result.error.code, 'CONTRACT_MISMATCH');
});

test('§2 DS._sampleData no se modifica con contract desconocido', async () => {
  const env = _makeValidEnvelope({ contract: 'rf.document.unknown.v1' });
  const { provider, DS } = _load({ envelope: env });
  await provider.load('factura', 42);
  assert.equal(DS._sampleData, null);
});

// ── §3 — Major incompatible ─────────────────────────────────────────────────

test('§3 rechaza schemaVersion v2.0.0 — ok:false', async () => {
  const env = _makeValidEnvelope({ schemaVersion: '2.0.0' });
  const { provider } = _load({ envelope: env });
  const result = await provider.load('factura', 42);
  assert.equal(result.ok, false);
});

test('§3 rechaza schemaVersion v2.0.0 — code SCHEMA_VERSION_INCOMPATIBLE', async () => {
  const env = _makeValidEnvelope({ schemaVersion: '2.0.0' });
  const { provider } = _load({ envelope: env });
  const result = await provider.load('factura', 42);
  assert.equal(result.error.code, 'SCHEMA_VERSION_INCOMPATIBLE');
});

test('§3 rechaza schemaVersion v0.9.0 — major 0 incompatible', async () => {
  const env = _makeValidEnvelope({ schemaVersion: '0.9.0' });
  const { provider } = _load({ envelope: env });
  const result = await provider.load('factura', 42);
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'SCHEMA_VERSION_INCOMPATIBLE');
});

// ── §4 — Minor compatible (mismo major = 1) ─────────────────────────────────

test('§4 acepta schemaVersion 1.5.0 — minor compatible, ok:true', async () => {
  const env = _makeValidEnvelope({ schemaVersion: '1.5.0' });
  const { provider } = _load({ envelope: env });
  const result = await provider.load('factura', 42);
  assert.equal(result.ok, true);
});

test('§4 acepta schemaVersion 1.99.3 — minor compatible, asigna dataset', async () => {
  const env = _makeValidEnvelope({ schemaVersion: '1.99.3' });
  const { provider, DS } = _load({ envelope: env });
  await provider.load('factura', 42);
  assert.deepEqual(DS._sampleData, _makeDataset());
});

// ── §5 — schemaOk:false ─────────────────────────────────────────────────────

test('§5 rechaza validation.schemaOk:false — ok:false', async () => {
  const env = _makeValidEnvelope({ validation: { schemaOk: false, missingPaths: ['fiscal.clave_acceso'], extraPaths: [], warnings: [] } });
  const { provider } = _load({ envelope: env });
  const result = await provider.load('factura', 42);
  assert.equal(result.ok, false);
});

test('§5 rechaza validation.schemaOk:false — code SCHEMA_NOT_OK', async () => {
  const env = _makeValidEnvelope({ validation: { schemaOk: false, missingPaths: ['fiscal.clave_acceso'], extraPaths: [], warnings: [] } });
  const { provider } = _load({ envelope: env });
  const result = await provider.load('factura', 42);
  assert.equal(result.error.code, 'SCHEMA_NOT_OK');
});

test('§5 DS._sampleData no se modifica si schemaOk:false', async () => {
  const env = _makeValidEnvelope({ validation: { schemaOk: false, missingPaths: ['pago.total'], extraPaths: [], warnings: [] } });
  const { provider, DS } = _load({ envelope: env });
  await provider.load('factura', 42);
  assert.equal(DS._sampleData, null);
});

// ── §6 — Conserva error.code/details del servidor ──────────────────────────

test('§6 conserva error.code del server (DOC_NOT_FOUND)', async () => {
  const serverError = {
    contract: CONTRACT, schemaVersion: SCHEMA_V_OK,
    error: { code: 'DOC_NOT_FOUND', message: 'Documento no encontrado', details: 'DocEntry=999' },
  };
  const { provider } = _load({ envelope: serverError });
  const result = await provider.load('factura', 999);
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'DOC_NOT_FOUND');
});

test('§6 conserva error.details del server', async () => {
  const serverError = {
    contract: CONTRACT, schemaVersion: SCHEMA_V_OK,
    error: { code: 'DB_CONNECTION_FAILED', message: 'Sin conexión', details: 'host=localhost port=1433' },
  };
  const { provider } = _load({ envelope: serverError });
  const result = await provider.load('factura', 1);
  assert.equal(result.error.details, 'host=localhost port=1433');
});

test('§6 error de red → code FETCH_ERROR con details del mensaje', async () => {
  const { provider } = _load({ fetchErr: new Error('Network timeout') });
  const result = await provider.load('factura', 1);
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'FETCH_ERROR');
  assert.ok(result.error.details.includes('Network timeout'));
});

// ── §7 — Preview activo → llama refresh() ──────────────────────────────────

test('§7 llama PreviewEngineRenderer.refresh() si DS.previewMode === true', async () => {
  const { provider, refresh_calls } = _load({ envelope: _makeValidEnvelope(), previewMode: true });
  await provider.load('factura', 42);
  assert.equal(refresh_calls.length, 1);
});

test('§7 refresh() se llama UNA sola vez por load exitoso', async () => {
  const { provider, refresh_calls } = _load({ envelope: _makeValidEnvelope(), previewMode: true });
  await provider.load('factura', 42);
  assert.equal(refresh_calls.length, 1);
});

test('§7 refresh() NO se llama si load falla (contract error + preview activo)', async () => {
  const env = _makeValidEnvelope({ contract: 'rf.document.unknown.v1' });
  const { provider, refresh_calls } = _load({ envelope: env, previewMode: true });
  await provider.load('factura', 42);
  assert.equal(refresh_calls.length, 0);
});

// ── §8 — Preview inactivo → no llama refresh() ─────────────────────────────

test('§8 NO llama refresh() si DS.previewMode === false', async () => {
  const { provider, refresh_calls } = _load({ envelope: _makeValidEnvelope(), previewMode: false });
  await provider.load('factura', 42);
  assert.equal(refresh_calls.length, 0);
});

test('§8 NO llama refresh() si PreviewEngineRenderer no está disponible', async () => {
  const { provider } = _load({ envelope: _makeValidEnvelope(), previewMode: true, hasRenderer: false });
  // Should not throw and result should be ok
  const result = await provider.load('factura', 42);
  assert.equal(result.ok, true);
});

test('§8 DS._sampleData se asigna aunque preview esté inactivo', async () => {
  const { provider, DS } = _load({ envelope: _makeValidEnvelope(), previewMode: false });
  await provider.load('factura', 42);
  assert.deepEqual(DS._sampleData, _makeDataset());
});
