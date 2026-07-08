'use strict';
/**
 * Fase 9 — ParameterValueController contracts.
 * Tests pure validation/state logic via vm isolation (same pattern as
 * ElementLayoutEngine's test suite): load the real source into a
 * minimal stubbed context, no DOM needed since this module never
 * touches the DOM.
 */
import test   from 'node:test';
import assert from 'node:assert/strict';
import fs     from 'node:fs';
import vm     from 'node:vm';
import { resolve, dirname } from 'node:path';
import { fileURLToPath }    from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function load(dsOverrides = {}) {
  const src = fs.readFileSync(resolve(ROOT, 'engines/ParameterValueController.js'), 'utf8');
  const ctx = { window: {}, DS: { parameterValues: {}, previewMode: false, ...dsOverrides } };
  ctx.window = ctx;
  vm.runInNewContext(src, ctx);
  return { C: ctx.ParameterValueController, DS: ctx.DS };
}

// ── date validation ─────────────────────────────────────────────────────────

test('validate — valid dd/mm/yyyy date normalizes to ISO', () => {
  const { C } = load();
  const r = C.validate({ type: 'date', name: 'FechaDesde' }, '15/03/2026');
  assert.equal(r.valid, true);
  assert.equal(r.value, '2026-03-15');
});

test('validate — impossible date (day 40) is rejected', () => {
  const { C } = load();
  const r = C.validate({ type: 'date', name: 'FechaHasta' }, '40/99/2026');
  assert.equal(r.valid, false);
  assert.match(r.error, /inv.lida/i);
});

test('validate — Feb 30 is rejected (not a real date)', () => {
  const { C } = load();
  const r = C.validate({ type: 'date', name: 'X' }, '30/02/2026');
  assert.equal(r.valid, false);
});

test('validate — wrong format (yyyy-mm-dd instead of dd/mm/yyyy) is rejected', () => {
  const { C } = load();
  const r = C.validate({ type: 'date', name: 'X' }, '2026-03-15');
  assert.equal(r.valid, false);
});

// ── number / boolean / string ────────────────────────────────────────────────

test('validate — number type accepts numeric string', () => {
  const { C } = load();
  const r = C.validate({ type: 'number', name: 'Monto' }, '1234.5');
  assert.equal(r.valid, true);
  assert.equal(r.value, 1234.5);
});

test('validate — number type rejects non-numeric string', () => {
  const { C } = load();
  const r = C.validate({ type: 'number', name: 'Monto' }, 'abc');
  assert.equal(r.valid, false);
});

test('validate — boolean type accepts true/false', () => {
  const { C } = load();
  assert.equal(C.validate({ type: 'boolean', name: 'X' }, 'true').value, true);
  assert.equal(C.validate({ type: 'boolean', name: 'X' }, 'false').value, false);
});

test('validate — boolean type rejects other strings', () => {
  const { C } = load();
  const r = C.validate({ type: 'boolean', name: 'X' }, 'maybe');
  assert.equal(r.valid, false);
});

test('validate — string type accepts any non-empty text', () => {
  const { C } = load();
  const r = C.validate({ type: 'string', name: 'X' }, 'CardCode123');
  assert.equal(r.valid, true);
  assert.equal(r.value, 'CardCode123');
});

// ── required / empty ─────────────────────────────────────────────────────────

test('validate — empty value on required parameter is rejected', () => {
  const { C } = load();
  const r = C.validate({ type: 'string', name: 'X', required: true }, '');
  assert.equal(r.valid, false);
});

test('validate — empty value on optional parameter is accepted as null', () => {
  const { C } = load();
  const r = C.validate({ type: 'string', name: 'X', required: false }, '   ');
  assert.equal(r.valid, true);
  assert.equal(r.value, null);
});

// ── state (setValue/getValue) ────────────────────────────────────────────────

test('setValue/getValue — round-trips through DS.parameterValues', () => {
  const { C, DS } = load();
  C.setValue('FechaDesde', '2026-03-15');
  assert.equal(C.getValue('FechaDesde'), '2026-03-15');
  assert.equal(DS.parameterValues.FechaDesde, '2026-03-15');
});

test('getValue — undefined when never set', () => {
  const { C } = load();
  assert.equal(C.getValue('NuncaSeteado'), undefined);
});

// ── requestRefresh gating ────────────────────────────────────────────────────

test('requestRefresh — calls PreviewEngineRenderer.refresh() only when previewMode is true', () => {
  const src = fs.readFileSync(resolve(ROOT, 'engines/ParameterValueController.js'), 'utf8');
  let refreshCalls = 0;
  const ctx = {
    window: {},
    DS: { previewMode: true },
    PreviewEngineRenderer: { refresh: () => { refreshCalls++; } },
  };
  ctx.window = ctx;
  vm.runInNewContext(src, ctx);
  ctx.ParameterValueController.requestRefresh();
  assert.equal(refreshCalls, 1);
});

test('requestRefresh — does NOT call refresh when previewMode is false (Diseño mode)', () => {
  const src = fs.readFileSync(resolve(ROOT, 'engines/ParameterValueController.js'), 'utf8');
  let refreshCalls = 0;
  const ctx = {
    window: {},
    DS: { previewMode: false },
    PreviewEngineRenderer: { refresh: () => { refreshCalls++; } },
  };
  ctx.window = ctx;
  vm.runInNewContext(src, ctx);
  ctx.ParameterValueController.requestRefresh();
  assert.equal(refreshCalls, 0);
});
