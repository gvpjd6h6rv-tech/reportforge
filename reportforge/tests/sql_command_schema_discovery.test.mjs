'use strict';
/**
 * SqlCommandSchemaDiscovery — contrato UDS 4.1 Fase 17:
 *  - sin datasource_alias -> estado explícito, nunca fabrica uno, nunca llama fetch.
 *  - con alias -> lo envía en el request junto con parameter_values conocidos.
 *  - éxito -> escribe FIELD_TREE.sqlCommand.children[id] y re-renderiza Field Explorer.
 *  - error (400/404/network) -> estado de error con el mensaje sanitizado del backend, nunca contamina FIELD_TREE.
 */
import test   from 'node:test';
import assert from 'node:assert/strict';
import fs     from 'node:fs';
import vm     from 'node:vm';
import { resolve, dirname } from 'node:path';
import { fileURLToPath }    from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function load({ fetchImpl, parameterValues = {} } = {}) {
  const src = fs.readFileSync(resolve(ROOT, 'engines/SqlCommandSchemaDiscovery.js'), 'utf8');
  const mapSrc = fs.readFileSync(resolve(ROOT, 'engines/SqlCommandFieldTreeMap.js'), 'utf8');
  const initCalls = [];
  const ctx = {
    FIELD_TREE: { sqlCommand: { label: 'x', icon: 'x', children: {} } },
    ParameterValueController: { getValue: (name) => parameterValues[name] },
    FieldExplorerEngine: { init: () => initCalls.push(true) },
    fetch: fetchImpl,
  };
  ctx.window = ctx;
  vm.runInNewContext(mapSrc, ctx);
  vm.runInNewContext(src, ctx);
  return { discovery: ctx.SqlCommandSchemaDiscovery, ctx, initCalls };
}

function fakeFetch(status, body) {
  return async () => ({ ok: status >= 200 && status < 300, status, json: async () => body });
}

test('no datasource_alias -> explicit no_alias state, never calls fetch', async () => {
  let fetchCalled = false;
  const { discovery } = load({ fetchImpl: async () => { fetchCalled = true; } });
  const result = await discovery.discover({ id: 'c1', name: 'C1', parameters: [] });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'no_alias');
  assert.equal(fetchCalled, false);
});

test('with alias -> request body carries alias and known parameter values', async () => {
  let sentBody = null;
  const fetchImpl = async (url, opts) => { sentBody = JSON.parse(opts.body); return { ok: true, status: 200, json: async () => ({ alias: 'ds1', command_id: 'c1', columns: [], warnings: [] }) }; };
  const { discovery } = load({ fetchImpl, parameterValues: { FechaDesde: '2026-01-01' } });
  await discovery.discover({ id: 'c1', name: 'C1', datasource_alias: 'ds1', parameters: [{ name: 'FechaDesde' }] });
  assert.equal(sentBody.alias, 'ds1');
  assert.equal(sentBody.parameter_values.FechaDesde, '2026-01-01');
});

test('unknown parameter value (undefined) is never fabricated into the request', async () => {
  let sentBody = null;
  const fetchImpl = async (url, opts) => { sentBody = JSON.parse(opts.body); return { ok: true, status: 200, json: async () => ({ columns: [], warnings: [] }) }; };
  const { discovery } = load({ fetchImpl, parameterValues: {} });
  await discovery.discover({ id: 'c1', name: 'C1', datasource_alias: 'ds1', parameters: [{ name: 'SinValor' }] });
  assert.equal('SinValor' in sentBody.parameter_values, false);
});

test('success writes FIELD_TREE.sqlCommand.children[id] and re-renders Field Explorer', async () => {
  const fetchImpl = fakeFetch(200, { alias: 'ds1', command_id: 'c1', columns: [{ name: 'X', rf_type: 'string' }], warnings: [] });
  const { discovery, ctx, initCalls } = load({ fetchImpl });
  const result = await discovery.discover({ id: 'c1', name: 'C1', datasource_alias: 'ds1', parameters: [] });
  assert.equal(result.ok, true);
  assert.equal(ctx.FIELD_TREE.sqlCommand.children.c1.children.X.readOnly, true);
  assert.equal(initCalls.length, 1);
});

test('400 rejection surfaces the sanitized backend message, never touches FIELD_TREE', async () => {
  const fetchImpl = fakeFetch(400, { detail: "Missing required parameter: 'FechaDesde'" });
  const { discovery, ctx } = load({ fetchImpl });
  const result = await discovery.discover({ id: 'c1', name: 'C1', datasource_alias: 'ds1', parameters: [] });
  assert.equal(result.ok, false);
  assert.equal(result.error, "Missing required parameter: 'FechaDesde'");
  assert.equal(Object.keys(ctx.FIELD_TREE.sqlCommand.children).length, 0);
});

test('stdlib-shaped error ("error" key instead of "detail") is also surfaced', async () => {
  const fetchImpl = fakeFetch(404, { error: "Datasource 'ds1' not found" });
  const { discovery } = load({ fetchImpl });
  const result = await discovery.discover({ id: 'c1', name: 'C1', datasource_alias: 'ds1', parameters: [] });
  assert.equal(result.ok, false);
  assert.equal(result.error, "Datasource 'ds1' not found");
});
