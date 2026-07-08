'use strict';
/**
 * Fase 17A — SqlCommandEditor.open()'s third argument (existingAlias) is
 * conserved and included as datasource_alias when accepting a command.
 * No fallback, no fabricated value when not provided.
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
    style: {},
    children: [],
    _listeners: {},
    appendChild(child) { this.children.push(child); return child; },
    addEventListener(ev, fn) { this._listeners[ev] = fn; },
    querySelector() { return null; },
    focus() {},
    remove() {},
  };
  return new Proxy(el, {
    get(target, prop) {
      if (prop in target) return target[prop];
      return undefined;
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    },
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
    SqlCommandStore: {
      add: (command) => { addedCalls.push(command); },
    },
    fetch: async () => ({ json: async () => ({}) }),
  };
  ctx.window = ctx;
  vm.runInNewContext(src, ctx);
  return { SqlCommandEditor: ctx.SqlCommandEditor, addedCalls };
}

test('open() with an alias conserves it and _accept() includes it as datasource_alias', () => {
  const { SqlCommandEditor, addedCalls } = loadEditor();
  SqlCommandEditor.open('VentasPorFecha', 'EXEC VentasPorFecha :FechaDesde', 'myds');
  assert.equal(SqlCommandEditor._datasourceAlias, 'myds');

  SqlCommandEditor._lastBuilt = { preparedSql: 'EXEC VentasPorFecha :FechaDesde', parameters: ['FechaDesde'], bindOrder: ['FechaDesde'], guard: { allowed: true } };
  SqlCommandEditor._accept();

  assert.equal(addedCalls.length, 1);
  assert.equal(addedCalls[0].datasource_alias, 'myds');
});

test('open() without an alias defaults to null — no fallback, no fabricated value', () => {
  const { SqlCommandEditor, addedCalls } = loadEditor();
  SqlCommandEditor.open('ManualCmd', 'SELECT 1');
  assert.equal(SqlCommandEditor._datasourceAlias, null);

  SqlCommandEditor._lastBuilt = { preparedSql: 'SELECT 1', parameters: [], bindOrder: [], guard: { allowed: true } };
  SqlCommandEditor._accept();

  assert.equal(addedCalls.length, 1);
  assert.equal(addedCalls[0].datasource_alias, null);
});

test('a second open() without alias after one with alias does not leak the previous alias', () => {
  const { SqlCommandEditor, addedCalls } = loadEditor();
  SqlCommandEditor.open('First', 'SELECT 1', 'ds-one');
  SqlCommandEditor.open('Second', 'SELECT 2');
  assert.equal(SqlCommandEditor._datasourceAlias, null);

  SqlCommandEditor._lastBuilt = { preparedSql: 'SELECT 2', parameters: [], bindOrder: [], guard: { allowed: true } };
  SqlCommandEditor._accept();

  assert.equal(addedCalls[0].datasource_alias, null);
});
