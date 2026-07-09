'use strict';
/**
 * F19B-1B — engines/SqlCommandExecutionPanel.js behavioral contract.
 * Covers the 18 minimum tests from F19B-1B's brief. fetch() is always
 * mocked — no real network call is ever attempted by this test file.
 */
import test   from 'node:test';
import assert from 'node:assert/strict';
import fs     from 'node:fs';
import vm     from 'node:vm';
import { resolve, dirname } from 'node:path';
import { fileURLToPath }    from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function makeElement(registry) {
  const listeners = {};
  let _id = '';
  const el = {
    style: {},
    className: '',
    _children: [],
    _innerHTML: '',
    _textContent: '',
    disabled: false,
    checked: false,
    value: '',
    title: '',
    get id() { return _id; },
    set id(v) { _id = v; if (v && registry) registry[v] = el; },
    get children() { return el._children; },
    get innerHTML() { return el._innerHTML; },
    set innerHTML(v) { el._innerHTML = v; el._children = []; },
    get textContent() { return el._textContent; },
    set textContent(v) { el._textContent = v; },
    appendChild(child) { el._children.push(child); return child; },
    addEventListener(ev, fn) { listeners[ev] = fn; },
    dispatchEvent(ev) { if (listeners[ev.type]) listeners[ev.type](ev); },
    querySelector() { return null; },
    focus() {},
    remove() {},
  };
  return el;
}

function loadPanel({ commands = [], fetchImpl, parameterValueController } = {}) {
  const elementsById = {};
  const ctx = {
    window: {},
    document: {
      createElement: () => makeElement(elementsById),
      getElementById: (id) => elementsById[id] || (elementsById[id] = makeElement(elementsById)),
      addEventListener: () => {},
      body: { appendChild: () => {} },
    },
    SqlCommandStore: { list: () => commands },
    fetch: fetchImpl || (async () => ({ ok: true, status: 200, json: async () => ({ status: 'error', safe_error: 'not mocked' }) })),
  };
  if (parameterValueController) ctx.ParameterValueController = parameterValueController;
  ctx.window = ctx;
  const src = fs.readFileSync(resolve(ROOT, 'engines/SqlCommandExecutionPanel.js'), 'utf8');
  vm.runInNewContext(src, ctx);
  return { panel: ctx.SqlCommandExecutionPanel, elementsById };
}

function trackedFetch(responseBody, { ok = true } = {}) {
  const calls = [];
  const fn = async (url, opts) => {
    calls.push({ url, opts });
    return { ok, status: ok ? 200 : 400, json: async () => responseBody };
  };
  fn.calls = calls;
  return fn;
}

const _cmdWithAlias = {
  id: 'c1', name: 'VentasPorFecha', sql: 'SELECT DocNum FROM OINV',
  command_type: 'query', parameters: [], result_schema: [], max_rows_preview: 50,
  datasource_alias: 'sap_ds',
};
const _cmdWithoutAlias = {
  id: 'c2', name: 'SinAlias', sql: 'SELECT 1', command_type: 'query',
  parameters: [], result_schema: [], max_rows_preview: 100, datasource_alias: null,
};
const _storedProcCmd = {
  id: 'c3', name: 'MiProc', sql: 'EXEC MiProc', command_type: 'stored_procedure',
  parameters: [], result_schema: [], max_rows_preview: 100, datasource_alias: 'sap_ds',
};

// --- 1/2/3: list eligibility -----------------------------------------------------

test('1. stored procedure commands never appear as executable', () => {
  const { panel } = loadPanel({ commands: [_storedProcCmd, _cmdWithAlias] });
  const eligible = panel._eligibleCommands();
  assert.equal(eligible.length, 1);
  assert.equal(eligible[0].id, 'c1');
});

test('2. a SQL Command with datasource_alias shows an enabled Ejecutar button', () => {
  const { panel } = loadPanel({ commands: [_cmdWithAlias] });
  const row = panel._renderListRow(_cmdWithAlias);
  const runBtn = row.children[1];
  assert.equal(runBtn.textContent, 'Ejecutar');
  assert.equal(runBtn.disabled, false);
});

test('3. a SQL Command without datasource_alias has a disabled Ejecutar button and cannot be selected', () => {
  const { panel } = loadPanel({ commands: [_cmdWithoutAlias] });
  const row = panel._renderListRow(_cmdWithoutAlias);
  const runBtn = row.children[1];
  assert.equal(runBtn.disabled, true);

  panel._selectCommand(_cmdWithoutAlias);
  assert.equal(panel._uiState, 'ready', 'selecting a command without an alias must not enter confirming state');
});

// --- 4: explicit confirmation required -----------------------------------------------------

test('4. the run button is disabled until the checkbox is confirmed, and execution refuses without it', async () => {
  const { panel } = loadPanel({ commands: [_cmdWithAlias] });
  panel._selectCommand(_cmdWithAlias);
  assert.equal(panel._uiState, 'confirming');

  let area = panel._renderConfirmArea();
  const runBtn = area.children[2];
  assert.equal(runBtn.disabled, true, 'run button must start disabled before confirmation');

  await panel._runExecution();
  assert.equal(panel._uiState, 'confirming', 'execution must not proceed without confirmation');
});

// --- 5/6: request shape -----------------------------------------------------

test('5/6. confirmed execution POSTs to /sql-commands/execute with confirm:true and the alias', async () => {
  const fetchImpl = trackedFetch({ status: 'empty', row_count: 0 });
  const { panel } = loadPanel({ commands: [_cmdWithAlias], fetchImpl });
  panel._selectCommand(_cmdWithAlias);
  panel._confirmed = true;

  await panel._runExecution();

  assert.equal(fetchImpl.calls.length, 1);
  assert.equal(fetchImpl.calls[0].url, '/sql-commands/execute');
  const body = JSON.parse(fetchImpl.calls[0].opts.body);
  assert.equal(body.alias, 'sap_ds');
  // Wire contract match: the F19B-1A backend reads body.get("confirm"),
  // not "confirmation_present" (that field name belongs only to the
  // internal audit log schema, never the request payload).
  assert.equal(body.confirm, true);
  assert.equal(body.sql_command.id, 'c1');
});

// --- 7: reads body.status, never HTTP status alone -----------------------------------------------------

test('7. UI state follows body.status even when HTTP status is unrelated/ok', async () => {
  const fetchImpl = trackedFetch({ status: 'blocked', reason: 'DROP is not allowed' }, { ok: true });
  const { panel } = loadPanel({ commands: [_cmdWithAlias], fetchImpl });
  panel._selectCommand(_cmdWithAlias);
  panel._confirmed = true;
  await panel._runExecution();
  assert.equal(panel._uiState, 'blocked');
});

// --- 8-12: rendered outcomes -----------------------------------------------------

test('8. success renders a table with the returned columns and rows', async () => {
  const fetchImpl = trackedFetch({
    status: 'success', columns: ['DocNum'], rows: [{ DocNum: 1 }, { DocNum: 2 }],
    row_count: 2, max_rows_effective: 50, timeout_effective: 30, warnings: [],
  });
  const { panel } = loadPanel({ commands: [_cmdWithAlias], fetchImpl });
  panel._selectCommand(_cmdWithAlias);
  panel._confirmed = true;
  await panel._runExecution();
  assert.equal(panel._uiState, 'success');

  const area = panel._renderResultArea();
  const table = area.children[1];
  assert.equal(table.children[0].children[0].children.length, 1); // 1 header col
  assert.equal(table.children[1].children.length, 2); // 2 data rows
});

test('9. empty renders a clear zero-rows message', async () => {
  const fetchImpl = trackedFetch({ status: 'empty', row_count: 0, max_rows_effective: 50, timeout_effective: 30 });
  const { panel } = loadPanel({ commands: [_cmdWithAlias], fetchImpl });
  panel._selectCommand(_cmdWithAlias);
  panel._confirmed = true;
  await panel._runExecution();
  assert.equal(panel._uiState, 'empty');
  const area = panel._renderResultArea();
  const msgNode = area.children[area.children.length - 1];
  assert.match(msgNode.textContent, /0 filas/);
});

test('10. blocked renders the safe reason, not a crash', async () => {
  const fetchImpl = trackedFetch({ status: 'blocked', reason: 'DROP is not allowed — only read-only queries permitted' });
  const { panel } = loadPanel({ commands: [_cmdWithAlias], fetchImpl });
  panel._selectCommand(_cmdWithAlias);
  panel._confirmed = true;
  await panel._runExecution();
  assert.equal(panel._uiState, 'blocked');
  const area = panel._renderResultArea();
  assert.match(area.children[0].textContent, /DROP is not allowed/);
});

test('11. error renders the sanitized safe_error message', async () => {
  const fetchImpl = trackedFetch({ status: 'error', safe_error: 'Query failed [mssql://host:1433/db]: connection refused' });
  const { panel } = loadPanel({ commands: [_cmdWithAlias], fetchImpl });
  panel._selectCommand(_cmdWithAlias);
  panel._confirmed = true;
  await panel._runExecution();
  assert.equal(panel._uiState, 'error');
  const area = panel._renderResultArea();
  assert.match(area.children[0].textContent, /connection refused/);
});

test('12. timeout renders a distinct message from a generic error', async () => {
  const fetchImpl = trackedFetch({ status: 'timeout' });
  const { panel } = loadPanel({ commands: [_cmdWithAlias], fetchImpl });
  panel._selectCommand(_cmdWithAlias);
  panel._confirmed = true;
  await panel._runExecution();
  assert.equal(panel._uiState, 'timeout');
  const area = panel._renderResultArea();
  assert.match(area.children[0].textContent, /[Tt]iempo de espera/);
  assert.doesNotMatch(area.children[0].textContent, /^Error:/);
});

// --- 13: no secret leak even if a mock/backend bug injects one -----------------------------------------------------

test('13. a stray password-shaped field in the response is never rendered anywhere', async () => {
  const marker = 'LEAKED_SECRET_MARKER_XYZ';
  const fetchImpl = trackedFetch({ status: 'error', safe_error: 'connection refused', password: marker, connection_string: `mssql://sa:${marker}@host/db` });
  const { panel } = loadPanel({ commands: [_cmdWithAlias], fetchImpl });
  panel._selectCommand(_cmdWithAlias);
  panel._confirmed = true;
  await panel._runExecution();
  const area = panel._renderResultArea();
  assert.doesNotMatch(area.children[0].textContent, new RegExp(marker));
});

// --- 14: running disables interaction -----------------------------------------------------

test('14. the running state renders a disabled run button and disabled checkbox', () => {
  const { panel } = loadPanel({ commands: [_cmdWithAlias] });
  panel._selectCommand(_cmdWithAlias);
  panel._confirmed = true;
  panel._uiState = 'running';
  const area = panel._renderConfirmArea();
  const checkbox = area.children[1].children[0];
  const runBtn = area.children[2];
  assert.equal(checkbox.disabled, true);
  assert.equal(runBtn.disabled, true);
  assert.equal(runBtn.textContent, 'Ejecutando…');
});

// --- 15/16: no other endpoints called -----------------------------------------------------

test('15/16. only /sql-commands/execute is ever called — never /datasources/*/query or a procedure route', async () => {
  const fetchImpl = trackedFetch({ status: 'empty', row_count: 0 });
  const { panel } = loadPanel({ commands: [_cmdWithAlias], fetchImpl });
  panel._selectCommand(_cmdWithAlias);
  panel._confirmed = true;
  await panel._runExecution();
  for (const call of fetchImpl.calls) {
    assert.equal(call.url, '/sql-commands/execute');
  }
});

// --- 17/18: no Field Explorer mutation, no report persistence -----------------------------------------------------

test('17/18. SqlCommandStore.add/remove are never called by this panel (read-only via .list() only)', async () => {
  let addCalled = false;
  const commands = [_cmdWithAlias];
  const elementsById = {};
  const fetchImpl = trackedFetch({ status: 'success', columns: ['x'], rows: [{ x: 1 }], row_count: 1 });
  const ctx = {
    window: {},
    document: {
      createElement: () => makeElement(elementsById),
      getElementById: (id) => elementsById[id] || (elementsById[id] = makeElement(elementsById)),
      addEventListener: () => {},
      body: { appendChild: () => {} },
    },
    SqlCommandStore: {
      list: () => commands,
      add: () => { addCalled = true; },
      remove: () => { addCalled = true; },
    },
    fetch: fetchImpl,
  };
  ctx.window = ctx;
  const src = fs.readFileSync(resolve(ROOT, 'engines/SqlCommandExecutionPanel.js'), 'utf8');
  vm.runInNewContext(src, ctx);
  const panel = ctx.SqlCommandExecutionPanel;

  panel._selectCommand(_cmdWithAlias);
  panel._confirmed = true;
  await panel._runExecution();

  assert.equal(addCalled, false);
});

// --- parameter values pass-through (ParameterValueController reuse, mirrors SqlCommandSchemaDiscovery.js) -----------------------------------------------------

// --- end-to-end smoke: open() -> real DOM wiring -> click -> confirm -> run -----------------------------------------------------

test('open() builds the DOM and re-renders through the real getElementById("scep-body") linkage without crashing', async () => {
  const fetchImpl = trackedFetch({ status: 'empty', row_count: 0 });
  const { panel, elementsById } = loadPanel({ commands: [_cmdWithAlias], fetchImpl });

  panel.open();
  assert.equal(panel._uiState, 'ready');
  assert.ok(elementsById['scep-body'], 'expected the body mount point to be registered');
  assert.ok(elementsById['scep-body'].children.length > 0, 'expected the list view to have rendered into scep-body');

  panel._selectCommand(_cmdWithAlias);
  assert.equal(panel._uiState, 'confirming');
  assert.ok(elementsById['scep-body'].children.length > 0, 'expected the confirm view to have re-rendered into the same scep-body');

  panel.close();
  assert.equal(panel._el, null);
});

test('parameter values are read from ParameterValueController when the command declares parameters', async () => {
  const cmdWithParams = { ..._cmdWithAlias, parameters: [{ name: 'FechaDesde', type: 'date', default: null, required: true, source: 'sql_param' }] };
  const fetchImpl = trackedFetch({ status: 'empty', row_count: 0 });
  const pvc = { getValue: (name) => (name === 'FechaDesde' ? '2026-01-01' : undefined) };
  const { panel } = loadPanel({ commands: [cmdWithParams], fetchImpl, parameterValueController: pvc });
  panel._selectCommand(cmdWithParams);
  panel._confirmed = true;
  await panel._runExecution();
  const body = JSON.parse(fetchImpl.calls[0].opts.body);
  assert.equal(body.parameter_values.FechaDesde, '2026-01-01');
});
