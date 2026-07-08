'use strict';
/**
 * Fase 13 — SqlCommandStore.remove(id) contract.
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

test('remove — deletes the command with the matching id', () => {
  const { S } = load();
  S.add({ id: 'A', name: 'A', sql: 'SELECT 1' });
  S.add({ id: 'B', name: 'B', sql: 'SELECT 2' });
  S.remove('A');
  const list = S.list();
  assert.equal(list.length, 1);
  assert.equal(list[0].id, 'B');
});

test('remove — no-op when id does not exist', () => {
  const { S } = load();
  S.add({ id: 'A', name: 'A', sql: 'SELECT 1' });
  S.remove('DoesNotExist');
  assert.equal(S.list().length, 1);
});

test('remove — no-op on empty collection, does not throw', () => {
  const { S } = load();
  assert.doesNotThrow(() => S.remove('X'));
  assert.equal(S.list().length, 0);
});

test('remove — removing all matching ids (duplicate names accepted per DEBT-F12-2)', () => {
  const { S } = load();
  S.add({ id: 'Dup', name: 'Dup', sql: 'SELECT 1' });
  S.add({ id: 'Dup', name: 'Dup', sql: 'SELECT 2' });
  S.remove('Dup');
  assert.equal(S.list().length, 0);
});

test('add still works after remove (store not broken)', () => {
  const { S } = load();
  S.add({ id: 'A', name: 'A', sql: 'SELECT 1' });
  S.remove('A');
  S.add({ id: 'B', name: 'B', sql: 'SELECT 2' });
  assert.equal(S.list().length, 1);
  assert.equal(S.list()[0].id, 'B');
});
