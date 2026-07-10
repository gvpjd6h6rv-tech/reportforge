'use strict';
/**
 * F19C — engines/StoredProcedureExecutionPanel.js behavioral contract.
 * fetch() is always mocked — no real network call is ever attempted by
 * this test file. Mirrors sql_command_execution_panel.test.mjs's own
 * vm.runInNewContext harness for the sibling panel.
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
    style: {}, className: '', _children: [], _innerHTML: '', _textContent: '',
    disabled: false, value: '', title: '', maxLength: null, dataset: {}, type: 'text',
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
    focus() {}, remove() {},
  };
  return el;
}

function loadPanel({ fetchImpl } = {}) {
  const elementsById = {};
  const ctx = {
    window: {},
    document: {
      createElement: () => makeElement(elementsById),
      getElementById: (id) => elementsById[id] || (elementsById[id] = makeElement(elementsById)),
      addEventListener: () => {},
      body: { appendChild: () => {} },
    },
    fetch: fetchImpl || (async () => ({ ok: true, status: 200, json: async () => ({ storedProcedures: [] }) })),
  };
  ctx.window = ctx;
  const src = fs.readFileSync(resolve(ROOT, 'engines/StoredProcedureExecutionPanel.js'), 'utf8');
  vm.runInNewContext(src, ctx);
  return { panel: ctx.StoredProcedureExecutionPanel, elementsById };
}

function trackedFetch(responsesByUrl) {
  const calls = [];
  const fn = async (url, opts) => {
    calls.push({ url, opts });
    const body = typeof responsesByUrl === 'function' ? responsesByUrl(url) : responsesByUrl[url];
    return { ok: true, status: 200, json: async () => body };
  };
  fn.calls = calls;
  return fn;
}

const _demoProc = {
  id: 'demo', label: 'Demo Customer Lookup',
  params: [{ name: 'CardCode', type: 'string', required: true, maxLength: 30 }],
};

// --- 1. panel renders / builds DOM -----------------------------------------------------

test('1. open() builds the DOM and mounts the list into spep-body without crashing', async () => {
  const fetchImpl = trackedFetch({ '/stored-procedures': { storedProcedures: [_demoProc] } });
  const { panel, elementsById } = loadPanel({ fetchImpl });

  panel.open();
  await new Promise((r) => setTimeout(r, 0));

  assert.ok(elementsById['spep-body'], 'expected the body mount point to be registered');
  assert.ok(elementsById['spep-body'].children.length > 0, 'expected the list view to have rendered');
});

// --- 2. procedure list renders -----------------------------------------------------

test('2. the procedure dropdown/list renders one row per enabled procedure', async () => {
  const fetchImpl = trackedFetch({ '/stored-procedures': { storedProcedures: [_demoProc] } });
  const { panel } = loadPanel({ fetchImpl });
  await panel._loadProcedures();
  const list = panel._renderList();
  assert.equal(list.children.length, 1);
  assert.equal(list.children[0].children[0].textContent, 'Demo Customer Lookup');
});

// --- 3. params form renders -----------------------------------------------------

test('3. selecting a procedure renders one input per declared param', async () => {
  const fetchImpl = trackedFetch({ '/stored-procedures': { storedProcedures: [_demoProc] } });
  const { panel } = loadPanel({ fetchImpl });
  await panel._loadProcedures();
  panel._selectProcedure(_demoProc);
  const form = panel._renderParamsForm();
  // 1 row per param + 1 run button
  const paramRows = form.children.filter((c) => c.dataset === undefined || true);
  assert.equal(form.children.length, 2); // 1 param row + run button
});

// --- 4. execute sends ID, not procedure name -----------------------------------------------------

test('4. execution POSTs only {storedProcedureId, params} — never a procedure name or SQL', async () => {
  const fetchImpl = trackedFetch({
    '/stored-procedures': { storedProcedures: [_demoProc] },
    '/stored-procedures/execute': { status: 'empty', row_count: 0 },
  });
  const { panel } = loadPanel({ fetchImpl });
  await panel._loadProcedures();
  panel._selectProcedure(_demoProc);
  panel._paramValues = { CardCode: 'C001' };
  await panel._runExecution();

  const execCall = fetchImpl.calls.find((c) => c.url === '/stored-procedures/execute');
  assert.ok(execCall, 'expected a call to /stored-procedures/execute');
  const body = JSON.parse(execCall.opts.body);
  assert.equal(body.storedProcedureId, 'demo');
  assert.equal(body.params.CardCode, 'C001');
  assert.equal(Object.keys(body).length, 2, 'payload must be exactly {storedProcedureId, params}');
  assert.equal('procedure' in body, false);
  assert.equal('sql' in body, false);
});

// --- 5. success table renders -----------------------------------------------------

test('5. success renders a table with the returned columns and rows', async () => {
  const fetchImpl = trackedFetch({
    '/stored-procedures': { storedProcedures: [_demoProc] },
    '/stored-procedures/execute': {
      status: 'success', columns: ['Name'], rows: [{ Name: 'Acme' }, { Name: 'Beta' }],
      row_count: 2, max_rows_effective: 100, timeout_effective: 10,
    },
  });
  const { panel } = loadPanel({ fetchImpl });
  await panel._loadProcedures();
  panel._selectProcedure(_demoProc);
  panel._paramValues = { CardCode: 'C001' };
  await panel._runExecution();

  assert.equal(panel._uiState, 'success');
  const area = panel._renderResultArea();
  const table = area.children[1];
  assert.equal(table.id, 'spep-result-table');
  assert.equal(table.children[1].children.length, 2);
});

// --- 6. blocked message renders -----------------------------------------------------

test('6. blocked renders the safe reason, not a crash', async () => {
  const fetchImpl = trackedFetch({
    '/stored-procedures': { storedProcedures: [_demoProc] },
    '/stored-procedures/execute': { status: 'blocked', reason: 'Unknown storedProcedureId' },
  });
  const { panel } = loadPanel({ fetchImpl });
  await panel._loadProcedures();
  panel._selectProcedure(_demoProc);
  await panel._runExecution();
  assert.equal(panel._uiState, 'blocked');
  const area = panel._renderResultArea();
  assert.match(area.children[0].textContent, /Unknown storedProcedureId/);
  assert.equal(area.children[0].id, 'spep-blocked-message');
});

// --- 7. timeout message renders -----------------------------------------------------

test('7. timeout renders a distinct message from a generic error', async () => {
  const fetchImpl = trackedFetch({
    '/stored-procedures': { storedProcedures: [_demoProc] },
    '/stored-procedures/execute': { status: 'timeout' },
  });
  const { panel } = loadPanel({ fetchImpl });
  await panel._loadProcedures();
  panel._selectProcedure(_demoProc);
  await panel._runExecution();
  assert.equal(panel._uiState, 'timeout');
  const area = panel._renderResultArea();
  assert.equal(area.children[0].id, 'spep-timeout-message');
  assert.doesNotMatch(area.children[0].textContent, /^Error:/);
});

// --- 8. empty allowlist state renders -----------------------------------------------------

test('8. an empty allowlist renders the exact required empty-state message', async () => {
  const fetchImpl = trackedFetch({ '/stored-procedures': { storedProcedures: [] } });
  const { panel } = loadPanel({ fetchImpl });
  await panel._loadProcedures();
  const list = panel._renderList();
  assert.equal(list.children[0].id, 'spep-empty-state');
  assert.equal(list.children[0].textContent, 'No hay Stored Procedures habilitados en la allowlist.');
});

// --- error state renders -----------------------------------------------------

test('error renders the sanitized safe_error message', async () => {
  const fetchImpl = trackedFetch({
    '/stored-procedures': { storedProcedures: [_demoProc] },
    '/stored-procedures/execute': { status: 'error', safe_error: 'connection refused' },
  });
  const { panel } = loadPanel({ fetchImpl });
  await panel._loadProcedures();
  panel._selectProcedure(_demoProc);
  await panel._runExecution();
  assert.equal(panel._uiState, 'error');
  const area = panel._renderResultArea();
  assert.match(area.children[0].textContent, /connection refused/);
});
