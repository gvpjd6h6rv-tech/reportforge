import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ADAPTER_CONTRACT, validateAdapter, normalizeEventShape } from '../../tools/rf-debug-center/adapters/debug-center-adapter-contract.js';
import { REPORTFORGE_ADAPTER_METADATA } from '../../tools/rf-debug-center/adapters/reportforge/reportforge-adapter-metadata.js';
import { reportforgeAdapter, validateReportforgeAdapter } from '../../tools/rf-debug-center/adapters/reportforge/reportforge-adapter.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// ── 1. Archivos existen ───────────────────────────────────────────────────────

test('1. debug-center-adapter-contract.js existe', () => {
  const p = path.join(ROOT, 'tools/rf-debug-center/adapters/debug-center-adapter-contract.js');
  assert.ok(fs.existsSync(p), 'contract file must exist');
});

test('2. reportforge-adapter.js existe', () => {
  const p = path.join(ROOT, 'tools/rf-debug-center/adapters/reportforge/reportforge-adapter.js');
  assert.ok(fs.existsSync(p), 'adapter file must exist');
});

test('3. reportforge-adapter-metadata.js existe', () => {
  const p = path.join(ROOT, 'tools/rf-debug-center/adapters/reportforge/reportforge-adapter-metadata.js');
  assert.ok(fs.existsSync(p), 'metadata file must exist');
});

// ── 2. Contrato — estructura ──────────────────────────────────────────────────

test('4. ADAPTER_CONTRACT tiene requiredFields/requiredMethods/eventSchema', () => {
  assert.ok(Array.isArray(ADAPTER_CONTRACT.requiredFields), 'requiredFields is array');
  assert.ok(Array.isArray(ADAPTER_CONTRACT.requiredMethods), 'requiredMethods is array');
  assert.ok(ADAPTER_CONTRACT.eventSchema, 'eventSchema present');
  assert.ok(Array.isArray(ADAPTER_CONTRACT.eventSchema.required), 'eventSchema.required is array');
  assert.ok(Array.isArray(ADAPTER_CONTRACT.eventSchema.severities), 'eventSchema.severities is array');
});

test('5. ADAPTER_CONTRACT es inmutable (Object.isFrozen)', () => {
  assert.ok(Object.isFrozen(ADAPTER_CONTRACT), 'ADAPTER_CONTRACT must be frozen');
});

// ── 3. validateAdapter ────────────────────────────────────────────────────────

test('6. validateAdapter rechaza null/undefined', () => {
  assert.equal(validateAdapter(null).valid, false);
  assert.equal(validateAdapter(undefined).valid, false);
  assert.ok(validateAdapter(null).errors.length > 0, 'errors non-empty for null');
});

test('7. validateAdapter rechaza adapter incompleto (faltan métodos)', () => {
  const incomplete = { id: 'x', name: 'X', project: 'x', version: '1.0.0' };
  const result = validateAdapter(incomplete);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('method')), 'errors mention missing method');
});

test('8. validateAdapter rechaza adapter con campo vacío', () => {
  const noId = { id: '', name: 'X', project: 'x', version: '1.0.0', getTraceSource: () => {}, getOwnershipMap: () => {}, getEnvironment: () => {}, normalizeEvent: () => {} };
  const result = validateAdapter(noId);
  assert.equal(result.valid, false);
});

// ── 4. normalizeEventShape ────────────────────────────────────────────────────

test('9. normalizeEventShape produce todos los campos canónicos', () => {
  const ev = normalizeEventShape({ source: 'ZoomEngine', action: 'zoom-change', severity: 'info' });
  assert.equal(ev.source, 'ZoomEngine');
  assert.equal(ev.action, 'zoom-change');
  assert.equal(ev.severity, 'info');
  assert.ok(ev.timestamp, 'timestamp present');
  assert.equal(ev.project, null);
  assert.equal(ev.error, null);
});

test('10. normalizeEventShape normaliza severity desconocida a info', () => {
  const ev = normalizeEventShape({ severity: 'CRITICAL', source: 'x', action: 'y' });
  assert.equal(ev.severity, 'info');
});

test('11. normalizeEventShape no muta el input', () => {
  const raw = { source: 'A', action: 'B', severity: 'debug' };
  const before = JSON.stringify(raw);
  normalizeEventShape(raw);
  assert.equal(JSON.stringify(raw), before, 'input not mutated');
});

// ── 5. ReportForge Adapter — campos ──────────────────────────────────────────

test('12. reportforgeAdapter expone id/name/project/version', () => {
  assert.equal(reportforgeAdapter.id, 'reportforge');
  assert.equal(reportforgeAdapter.name, 'ReportForge');
  assert.equal(reportforgeAdapter.project, 'reportforge');
  assert.ok(typeof reportforgeAdapter.version === 'string', 'version is string');
});

test('13. reportforgeAdapter es inmutable (Object.isFrozen)', () => {
  assert.ok(Object.isFrozen(reportforgeAdapter), 'reportforgeAdapter must be frozen');
});

test('14. validateReportforgeAdapter reporta valid: true', () => {
  const result = validateReportforgeAdapter();
  assert.equal(result.valid, true, `validation errors: ${result.errors.join(', ')}`);
});

test('14a. reportforgeAdapter expone getDomTargets', () => {
  assert.equal(typeof reportforgeAdapter.getDomTargets, 'function');
  const targets = reportforgeAdapter.getDomTargets();
  assert.ok(Array.isArray(targets));
  assert.ok(targets.some((item) => item.selector === '#zw-slider'));
});

// ── 6. No globals / no window writes ─────────────────────────────────────────

test('15. los archivos del adapter no escriben window.*', () => {
  const files = [
    'tools/rf-debug-center/adapters/debug-center-adapter-contract.js',
    'tools/rf-debug-center/adapters/reportforge/reportforge-adapter.js',
    'tools/rf-debug-center/adapters/reportforge/reportforge-adapter-metadata.js',
  ];
  const windowWritePattern = /window\.[A-Za-z0-9_]+\s*=(?!=)/;
  for (const relPath of files) {
    const src = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
    assert.doesNotMatch(src, windowWritePattern, `${relPath} must not write to window.*`);
  }
});

// ── 7. Límites de línea ───────────────────────────────────────────────────────

test('16. límites de línea de archivos de adapter', () => {
  const checks = [
    ['tools/rf-debug-center/adapters/debug-center-adapter-contract.js', 120],
    ['tools/rf-debug-center/adapters/reportforge/reportforge-adapter.js', 160],
    ['tools/rf-debug-center/adapters/reportforge/reportforge-adapter-metadata.js', 100],
  ];
  for (const [relPath, limit] of checks) {
    const src = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
    const lines = src.split('\n').length;
    assert.ok(lines <= limit, `${relPath} has ${lines} lines, exceeds limit ${limit}`);
  }
});

// ── 8. Metadata ───────────────────────────────────────────────────────────────

test('17. REPORTFORGE_ADAPTER_METADATA es consistente con el adapter', () => {
  assert.equal(REPORTFORGE_ADAPTER_METADATA.id, reportforgeAdapter.id);
  assert.equal(REPORTFORGE_ADAPTER_METADATA.project, reportforgeAdapter.project);
  assert.equal(REPORTFORGE_ADAPTER_METADATA.version, reportforgeAdapter.version);
  assert.ok(Object.isFrozen(REPORTFORGE_ADAPTER_METADATA), 'metadata must be frozen');
  assert.ok(Array.isArray(REPORTFORGE_ADAPTER_METADATA.capabilities), 'capabilities is array');
  assert.ok(Array.isArray(REPORTFORGE_ADAPTER_METADATA.invariants), 'invariants is array');
});
