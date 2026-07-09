'use strict';
/**
 * SqlCommandFieldTreeMap — contrato: transforma columnas descubiertas en
 * un nodo FIELD_TREE-shaped, read-only, namespaced por command.id.
 */
import test   from 'node:test';
import assert from 'node:assert/strict';
import fs     from 'node:fs';
import vm     from 'node:vm';
import { resolve, dirname } from 'node:path';
import { fileURLToPath }    from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function load() {
  const src = fs.readFileSync(resolve(ROOT, 'engines/SqlCommandFieldTreeMap.js'), 'utf8');
  const ctx = {};
  ctx.window = ctx;
  vm.runInNewContext(src, ctx);
  return ctx.SqlCommandFieldTreeMap;
}

test('buildCommandNode marks every column readOnly and namespaces paths by command.id', () => {
  const map = load();
  const node = map.buildCommandNode(
    { id: 'cmd-1', name: 'Ventas' },
    [{ name: 'DocNum', db_type: 'int', rf_type: 'number', nullable: false, ordinal: 0 }],
  );
  assert.equal(node.label, 'Ventas');
  assert.equal(node.children.DocNum.path, 'sqlCommand.cmd-1.DocNum');
  assert.equal(node.children.DocNum.vtype, 'number');
  assert.equal(node.children.DocNum.readOnly, true);
});

test('two different commands never collide in path even with same column name', () => {
  const map = load();
  const a = map.buildCommandNode({ id: 'cmd-a', name: 'A' }, [{ name: 'X', rf_type: 'string' }]);
  const b = map.buildCommandNode({ id: 'cmd-b', name: 'B' }, [{ name: 'X', rf_type: 'string' }]);
  assert.notEqual(a.children.X.path, b.children.X.path);
});

test('empty columns produces an empty children map, not an error', () => {
  const map = load();
  const node = map.buildCommandNode({ id: 'cmd-1', name: 'Empty' }, []);
  assert.equal(Object.keys(node.children).length, 0);
});
