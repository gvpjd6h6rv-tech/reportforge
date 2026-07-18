import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSQLModal } from './sql_connection_modal.fixture.mjs';

test('SQL connection modal status styling', () => {
  const { modal, doc } = loadSQLModal();
  modal.open();
  const statusEl = doc.getElementById('sqlm-status');
  assert.ok(statusEl);
  const css = statusEl.style.cssText || '';
  assert.ok(css.includes('user-select:text'));
  assert.ok(css.includes('cursor:text'));
});
