'use strict';
/**
 * Fase 12 — SqlCommandStore contracts.
 * Tests pure state logic via vm isolation (same pattern as
 * ParameterValueController's test suite, Fase 9).
 */
import test   from 'node:test';
import assert from 'node:assert/strict';
import fs     from 'node:fs';
import vm     from 'node:vm';
import { resolve, dirname } from 'node:path';
import { fileURLToPath }    from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function load(dsOverrides = {}) {
  const src = fs.readFileSync(resolve(ROOT, 'engines/SqlCommandStore.js'), 'utf8');
  const ctx = { window: {}, DS: { ...dsOverrides } };
  ctx.window = ctx;
  vm.runInNewContext(src, ctx);
  return { S: ctx.SqlCommandStore, DS: ctx.DS };
}

test('list — empty by default', () => {
  const { S } = load();
  assert.equal(JSON.stringify(S.list()), JSON.stringify([]));
});

test('add — appends a command, list() reflects it', () => {
  const { S } = load();
  S.add({ id: 'A', name: 'A', sql: 'SELECT 1', command_type: 'query', parameters: [], result_schema: [], max_rows_preview: 100 });
  const list = S.list();
  assert.equal(list.length, 1);
  assert.equal(list[0].id, 'A');
});

test('add — multiple commands preserve insertion order', () => {
  const { S } = load();
  S.add({ id: 'A', name: 'A', sql: 'SELECT 1' });
  S.add({ id: 'B', name: 'B', sql: 'SELECT 2' });
  const list = S.list();
  assert.equal(JSON.stringify(list.map((c) => c.id)), JSON.stringify(['A', 'B']));
});

test('list — returns copies, not live references (mutating result does not affect store)', () => {
  const { S, DS } = load();
  S.add({ id: 'A', name: 'A', sql: 'SELECT 1' });
  const list = S.list();
  list[0].id = 'MUTATED';
  assert.equal(DS.sqlCommands[0].id, 'A');
});

test('clear — empties the collection', () => {
  const { S } = load();
  S.add({ id: 'A', name: 'A', sql: 'SELECT 1' });
  S.clear();
  assert.equal(JSON.stringify(S.list()), JSON.stringify([]));
});

test('add — works even when DS.sqlCommands does not exist yet', () => {
  const { S, DS } = load();
  assert.equal(DS.sqlCommands, undefined);
  S.add({ id: 'A', name: 'A', sql: 'SELECT 1' });
  assert.equal(DS.sqlCommands.length, 1);
});

test('DS.sqlCommands is the single source of truth — add() writes there, not a private copy', () => {
  const { S, DS } = load();
  S.add({ id: 'A', name: 'A', sql: 'SELECT 1' });
  assert.equal(DS.sqlCommands.length, 1);
  assert.equal(DS.sqlCommands[0].id, 'A');
});
