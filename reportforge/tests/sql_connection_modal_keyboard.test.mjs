import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSQLModal } from './sql_connection_modal.fixture.mjs';
import { setField, click, statusType, fireKeydown, flush } from './sql_connection_modal_testkit.mjs';

test('SQL connection modal keyboard wiring', async () => {
  const fetchCalls = [];
  const fetchImpl = async (url, opts) => {
    fetchCalls.push({ url, opts });
    return { json: async () => ({ ok: true, message: 'Conectado', latency_ms: 5 }) };
  };

  {
    const { modal, doc } = loadSQLModal({ fetchImpl });
    modal.open();
    setField(doc, 'sqlm-host', 'srv');
    setField(doc, 'sqlm-db', 'DB');
    setField(doc, 'sqlm-user', 'u');
    setField(doc, 'sqlm-pass', 'pw');
    fireKeydown(doc, 'sqlm-pass', 'Enter');
    await flush();
    assert.ok(fetchCalls.length > 0);
    assert.equal(statusType(doc), 'ok');
  }

  {
    const { modal, doc } = loadSQLModal({ fetchImpl });
    modal.open();
    setField(doc, 'sqlm-host', 'srv');
    setField(doc, 'sqlm-db', 'DB');
    setField(doc, 'sqlm-user', 'u');
    setField(doc, 'sqlm-pass', 'pw');
    fireKeydown(doc, 'sqlm-host', 'Tab');
    await flush();
    assert.equal(fetchCalls.length, 1);
  }

  {
    const { modal, doc } = loadSQLModal();
    modal.open();
    const result = fireKeydown(doc, 'sqlm-pass', 'Enter');
    assert.ok(result.prevented.length > 0);
    click(doc, 'sqlm-test');
  }
});
