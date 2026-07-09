'use strict';
/**
 * SqlCommandEditor — Fase 17 causal-bug fix: when open() is given
 * existingParameters (e.g. real stored-procedure parameters from
 * StoredProcedurePicker, which already has the correct `required`
 * flags), _accept() must use them verbatim instead of re-detecting via
 * /sql-commands/parse — that only finds raw {?Param} placeholders and
 * always returns zero matches against SQL that's already prepared
 * (:Name), silently discarding which parameters are actually required.
 */
import test   from 'node:test';
import assert from 'node:assert/strict';
import fs     from 'node:fs';
import vm     from 'node:vm';
import { resolve, dirname } from 'node:path';
import { fileURLToPath }    from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function makeElement() {
  const el = {
    style: {}, children: [], _listeners: {},
    appendChild(child) { this.children.push(child); return child; },
    addEventListener(ev, fn) { this._listeners[ev] = fn; },
    querySelector() { return null; },
    focus() {}, remove() {},
  };
  return new Proxy(el, {
    get(t, p) { return p in t ? t[p] : undefined; },
    set(t, p, v) { t[p] = v; return true; },
  });
}

function loadEditor() {
  const src = fs.readFileSync(resolve(ROOT, 'engines/SqlCommandEditor.js'), 'utf8');
  const elementsById = {};
  const addedCalls = [];
  const ctx = {
    window: {},
    document: {
      createElement: () => makeElement(),
      getElementById: (id) => elementsById[id] || (elementsById[id] = makeElement()),
      addEventListener: () => {},
      body: { appendChild: () => {} },
    },
    SqlCommandStore: { add: (command) => { addedCalls.push(command); } },
    fetch: async () => ({ json: async () => ({}) }),
  };
  ctx.window = ctx;
  vm.runInNewContext(src, ctx);
  return { SqlCommandEditor: ctx.SqlCommandEditor, addedCalls };
}

test('existingParameters (real stored-procedure params) are used verbatim, not re-detected', () => {
  const { SqlCommandEditor, addedCalls } = loadEditor();
  const realParams = [{ name: 'FechaDesde', type: 'date', default: null, required: true, source: 'sql_param' }];
  SqlCommandEditor.open('VentasPorFecha', 'EXEC VentasPorFecha :FechaDesde', 'myds', realParams);

  // "Detectar parámetros" against already-prepared SQL finds nothing —
  // this mirrors the real /sql-commands/parse contract (raw {?Param} only).
  SqlCommandEditor._lastBuilt = { preparedSql: 'EXEC VentasPorFecha :FechaDesde', parameters: [], bindOrder: [], guard: { allowed: true } };
  SqlCommandEditor._accept();

  assert.equal(addedCalls.length, 1);
  assert.deepEqual(addedCalls[0].parameters, realParams);
  assert.equal(addedCalls[0].parameters[0].required, true);
});

test('without existingParameters (manual editor flow), falls back to detected {?Param} names', () => {
  const { SqlCommandEditor, addedCalls } = loadEditor();
  SqlCommandEditor.open('ManualCmd', 'SELECT * WHERE x = {?Foo}');
  SqlCommandEditor._lastBuilt = { preparedSql: 'SELECT * WHERE x = :Foo', parameters: ['Foo'], bindOrder: ['Foo'], guard: { allowed: true } };
  SqlCommandEditor._accept();

  assert.equal(addedCalls.length, 1);
  assert.equal(addedCalls[0].parameters[0].name, 'Foo');
  assert.equal(addedCalls[0].parameters[0].required, false);
});
