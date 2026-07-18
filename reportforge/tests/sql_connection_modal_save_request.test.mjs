import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSQLModal } from './sql_connection_modal.fixture.mjs';
import { setField, click, statusType, statusText, flush } from './sql_connection_modal_testkit.mjs';

test('SQL connection modal save request', async () => {
  const successCalls = [];
  const successFetch = async (url, opts) => {
    successCalls.push({ url, opts });
    return { json: async () => ({ alias: 'sap_b1', registered: true, reachable: true }) };
  };
  {
    const { modal, doc } = loadSQLModal({ fetchImpl: successFetch });
    modal.open();
    setField(doc, 'sqlm-alias', 'sap_b1');
    setField(doc, 'sqlm-host', 'srv');
    setField(doc, 'sqlm-db', 'SBO');
    setField(doc, 'sqlm-user', 'sa');
    setField(doc, 'sqlm-pass', 'pw');
    click(doc, 'sqlm-save');
    await flush();
    assert.equal(statusType(doc), 'ok');
    assert.match(statusText(doc), /sap_b1/);
    assert.equal(successCalls.length, 1);
    assert.ok(successCalls[0].url.includes('/datasources/sap_b1/connect'));
  }

  const failFetch = async () => ({
    json: async () => ({
      registered: false,
      message: 'No se pudo conectar a srv:1433/SBO',
      details: {
        category: 'CONNECTION_REFUSED',
        suggestion: 'Verifica que SQL Server esté escuchando en ese puerto y que el firewall lo permita.',
        debugCode: 'ConnectionRefusedError: [Errno 111] Connection refused',
      },
    }),
  });
  {
    const { modal, doc } = loadSQLModal({ fetchImpl: failFetch });
    modal.open();
    setField(doc, 'sqlm-alias', 'x');
    setField(doc, 'sqlm-host', 'srv');
    setField(doc, 'sqlm-db', 'DB');
    setField(doc, 'sqlm-user', 'u');
    setField(doc, 'sqlm-pass', 'p');
    click(doc, 'sqlm-save');
    await flush();
    assert.equal(statusType(doc), 'error');
    assert.match(statusText(doc), /Causa:/);
    assert.match(statusText(doc), /Sugerencia:/);
    assert.match(statusText(doc), /ConnectionRefusedError/);
  }
});
