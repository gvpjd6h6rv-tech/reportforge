import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateAdapter } from '../../tools/rf-debug-center/adapters/debug-center-adapter-contract.js';
import { SAP_B1_LINUX_METADATA, SAP_B1_LINUX_UDF_FIELDS, SAP_B1_LINUX_DOM_SELECTORS, SAP_B1_LINUX_NETWORK_PATHS, SAP_B1_LINUX_OWNERSHIP_MAP } from '../../tools/rf-debug-center/adapters/sap-b1-linux/sap-b1-linux-adapter-metadata.js';
import { sapB1LinuxAdapter, validateSapB1LinuxAdapter } from '../../tools/rf-debug-center/adapters/sap-b1-linux/sap-b1-linux-adapter.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// ── helpers ───────────────────────────────────────────────────────────────────

function makeWin({ docEntry = 0, docNum = '', cardCode = '', isFindMode = false, udf = {}, causalLog = null, sapDebug = false } = {}) {
  const DocumentModel = { DocEntry: docEntry, DocNum: docNum, CardCode: cardCode, isFindMode, udf };
  const win = { DocumentModel, location: { href: 'http://test/' }, Facade: { _state: { writeBlocked: false, readyForWrites: true } } };
  if (causalLog) win.__CAUSAL_LOG__ = causalLog;
  if (sapDebug) win.__SAP_DEBUG_CENTER__ = true;
  return win;
}

function makeDoc(fields = []) {
  const nodes = {};
  for (const { sel, value = '', text = '' } of fields) {
    nodes[sel] = { value, textContent: text, disabled: false, readOnly: false, style: { display: 'block', visibility: 'visible' }, getBoundingClientRect: () => ({ width: 80, height: 24 }) };
  }
  return { querySelector: (s) => nodes[s] ?? null, defaultView: { getComputedStyle: (el) => ({ display: el.style.display, visibility: el.style.visibility }) } };
}

// ── 1. Archivos existen ───────────────────────────────────────────────────────

test('1. sap-b1-linux-adapter.js existe', () => {
  assert.ok(fs.existsSync(path.join(ROOT, 'tools/rf-debug-center/adapters/sap-b1-linux/sap-b1-linux-adapter.js')));
});

test('2. sap-b1-linux-adapter-metadata.js existe', () => {
  assert.ok(fs.existsSync(path.join(ROOT, 'tools/rf-debug-center/adapters/sap-b1-linux/sap-b1-linux-adapter-metadata.js')));
});

// ── 2. Identidad y contrato ───────────────────────────────────────────────────

test('3. adapter expone id/name/project/version', () => {
  assert.equal(sapB1LinuxAdapter.id, 'sap-b1-linux');
  assert.equal(sapB1LinuxAdapter.name, 'SAP B1 Linux');
  assert.equal(sapB1LinuxAdapter.project, 'sap_b1_linux');
  assert.ok(typeof sapB1LinuxAdapter.version === 'string');
});

test('4. adapter está frozen', () => {
  assert.ok(Object.isFrozen(sapB1LinuxAdapter));
});

test('5. validateAdapter(sapB1LinuxAdapter) devuelve valid: true', () => {
  const r = validateSapB1LinuxAdapter();
  assert.equal(r.valid, true, `errors: ${r.errors.join(', ')}`);
});

// ── 3. getTraceSource ─────────────────────────────────────────────────────────

test('6. getTraceSource sin __CAUSAL_LOG__ devuelve absent', () => {
  const src = sapB1LinuxAdapter.getTraceSource({});
  assert.equal(src.status, 'absent');
  assert.deepEqual(src.getEntries(), []);
  assert.equal(src.snapshot(), null);
});

test('7. getTraceSource con mock devuelve present y getEntries', () => {
  const entries = [{ action: 'patch', ts: '2026-01-01T00:00:00Z' }];
  const win = makeWin({ causalLog: { getAll: () => entries } });
  const src = sapB1LinuxAdapter.getTraceSource(win);
  assert.equal(src.status, 'present');
  assert.deepEqual(src.getEntries(), entries);
  assert.ok(src.snapshot() !== null);
});

test('8. getTraceSource no muta __CAUSAL_LOG__', () => {
  const original = [{ action: 'a' }];
  const log = { getAll: () => original };
  const win = makeWin({ causalLog: log });
  const before = JSON.stringify(log);
  sapB1LinuxAdapter.getTraceSource(win).getEntries();
  assert.equal(JSON.stringify(log), before);
});

// ── 4. getEnvironment ─────────────────────────────────────────────────────────

test('9. getEnvironment sin window no rompe', () => {
  const env = sapB1LinuxAdapter.getEnvironment(null, null);
  assert.ok(env, 'returns object');
  assert.equal(env.url, null);
  assert.equal(env.mode, 'unknown');
});

test('10. getEnvironment detecta mode/docEntry/docNum/cardCode', () => {
  const win = makeWin({ docEntry: 42, docNum: '001-000042', cardCode: 'C001' });
  const env = sapB1LinuxAdapter.getEnvironment(win);
  assert.equal(env.mode, 'view');
  assert.equal(env.docEntry, 42);
  assert.equal(env.docNum, '001-000042');
  assert.equal(env.cardCode, 'C001');
  assert.equal(env.isFindMode, false);
});

// ── 5. getStateSnapshot ───────────────────────────────────────────────────────

test('11. getStateSnapshot extrae UDF críticos', () => {
  const udf = { U_TRANSPORTE: 'T001', U_TRANSPORTISTA: 'DR01', U_GUIA_TRANSPORTE_PLACA: 'ABC-123', U_GUIA_TRANSPORTISTA_NOMBRE: 'Juan', U_GUIA_TRANSPORTISTA_RUC: '1234567890' };
  const win = makeWin({ docEntry: 5, docNum: 'X', cardCode: 'C2', udf });
  const snap = sapB1LinuxAdapter.getStateSnapshot(win);
  assert.equal(snap.udf.U_TRANSPORTE, 'T001');
  assert.equal(snap.udf.U_TRANSPORTISTA, 'DR01');
  assert.equal(snap.udf.U_GUIA_TRANSPORTE_PLACA, 'ABC-123');
  assert.equal(snap.udf.U_GUIA_TRANSPORTISTA_NOMBRE, 'Juan');
  assert.equal(snap.udf.U_GUIA_TRANSPORTISTA_RUC, '1234567890');
});

test('12. getStateSnapshot no muta DocumentModel', () => {
  const win = makeWin({ docEntry: 1, udf: { U_TRANSPORTE: 'T1' } });
  const before = JSON.stringify(win.DocumentModel);
  sapB1LinuxAdapter.getStateSnapshot(win);
  assert.equal(JSON.stringify(win.DocumentModel), before);
});

// ── 6. getDomTargets ──────────────────────────────────────────────────────────

test('13. getDomTargets tolera document vacío / null', () => {
  const targets = sapB1LinuxAdapter.getDomTargets(null);
  assert.ok(targets.feContainer, 'feContainer key present');
  assert.equal(targets.feContainer.exists, false);
  assert.equal(targets.uTransporte.exists, false);
});

test('14. getDomTargets encuentra targets mock [data-udf]', () => {
  const doc = makeDoc([
    { sel: '[data-udf="U_TRANSPORTE"]', value: 'T001' },
    { sel: '[data-udf="U_TRANSPORTISTA"]', value: 'DR01' },
    { sel: '#fe-fields-container', value: '' },
  ]);
  const targets = sapB1LinuxAdapter.getDomTargets(doc);
  assert.equal(targets.uTransporte.exists, true);
  assert.equal(targets.uTransporte.value, 'T001');
  assert.equal(targets.uTransportista.value, 'DR01');
  assert.equal(targets.feContainer.exists, true);
});

// ── 7. getNetworkConfig ───────────────────────────────────────────────────────

test('15. getNetworkConfig contiene rutas críticas', () => {
  const cfg = sapB1LinuxAdapter.getNetworkConfig();
  assert.ok(Array.isArray(cfg.paths));
  assert.ok(cfg.paths.some((p) => p.includes('/api/document/')));
  assert.ok(cfg.paths.some((p) => p.includes('/api/vcr_nav')));
  assert.ok(cfg.paths.some((p) => p.includes('/advanced_search')));
});

// ── 8. getOwnershipMap ────────────────────────────────────────────────────────

test('16. getOwnershipMap contiene DocumentModel/UdfFe/Network', () => {
  const map = sapB1LinuxAdapter.getOwnershipMap();
  assert.ok(Array.isArray(map.subsystems));
  assert.ok(map.subsystems.some((s) => s.name === 'DocumentModel'));
  assert.ok(map.subsystems.some((s) => s.name === 'UdfFe'));
  assert.ok(map.subsystems.some((s) => s.name === 'Network'));
});

// ── 9. normalizeEvent ─────────────────────────────────────────────────────────

test('17. normalizeEvent produce schema canónico', () => {
  const raw = { action: 'patch', writer: 'doc_load.js', ts: '2026-01-01T00:00:00Z', category: 'state', model: { DocEntry: 1 } };
  const ev = sapB1LinuxAdapter.normalizeEvent(raw);
  assert.equal(ev.project, 'sap_b1_linux');
  assert.equal(ev.action, 'patch');
  assert.equal(ev.source, 'doc_load.js');
  assert.equal(ev.writerActual, 'doc_load.js');
  assert.ok(ev.timestamp);
  assert.equal(ev.raw, raw);
});

test('18. normalizeEvent no muta input', () => {
  const raw = { action: 'x', writer: 'y', ts: '2026-01-01T00:00:00Z' };
  const before = JSON.stringify(raw);
  sapB1LinuxAdapter.normalizeEvent(raw);
  assert.equal(JSON.stringify(raw), before);
});

test('19. severity desconocida cae a info', () => {
  const ev = sapB1LinuxAdapter.normalizeEvent({ action: 'x', severity: 'UNKNOWN_LEVEL' });
  assert.equal(ev.severity, 'info');
});

// ── 10. Guardrails ────────────────────────────────────────────────────────────

test('20. no crea globals', () => {
  const files = [
    'tools/rf-debug-center/adapters/sap-b1-linux/sap-b1-linux-adapter.js',
    'tools/rf-debug-center/adapters/sap-b1-linux/sap-b1-linux-adapter-metadata.js',
  ];
  const pat = /window\.[A-Za-z0-9_]+\s*=(?!=)/;
  for (const f of files) assert.doesNotMatch(fs.readFileSync(path.join(ROOT, f), 'utf8'), pat, `${f} must not write window.*`);
});

test('21. no importa internals de reportforge-adapter', () => {
  const src = fs.readFileSync(path.join(ROOT, 'tools/rf-debug-center/adapters/sap-b1-linux/sap-b1-linux-adapter.js'), 'utf8');
  assert.doesNotMatch(src, /reportforge-adapter/, 'must not import reportforge adapter internals');
});

test('22. no existe autolab adapter todavía', () => {
  assert.equal(fs.existsSync(path.join(ROOT, 'tools/rf-debug-center/adapters/autolab')), false);
});

test('23. límites de línea OK', () => {
  const checks = [
    ['tools/rf-debug-center/adapters/sap-b1-linux/sap-b1-linux-adapter.js', 160],
    ['tools/rf-debug-center/adapters/sap-b1-linux/sap-b1-linux-adapter-metadata.js', 100],
    ['reportforge/tests/rf_debug_center_sap_adapter.test.mjs', 260],
  ];
  for (const [rel, limit] of checks) {
    const lines = fs.readFileSync(path.join(ROOT, rel), 'utf8').split('\n').length;
    assert.ok(lines <= limit, `${rel}: ${lines} lines > limit ${limit}`);
  }
});
