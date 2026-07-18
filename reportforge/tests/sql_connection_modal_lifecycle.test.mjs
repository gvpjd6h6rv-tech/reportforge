import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSQLModal } from './sql_connection_modal.fixture.mjs';
import { root } from './sql_connection_modal_testkit.mjs';

test('SQL connection modal lifecycle', () => {
  const { modal, doc } = loadSQLModal();
  assert.equal(doc.body._children.length, 0);

  modal.open();
  assert.equal(doc.body._children.length, 1);
  assert.equal(root(doc).id, 'sql-modal');

  modal.open();
  assert.equal(doc.body._children.length, 1);

  modal.close();
  assert.equal(doc.body._children.length, 0);

  assert.doesNotThrow(() => modal.close());

  modal.open();
  assert.equal(doc.body._children.length, 1);
});
