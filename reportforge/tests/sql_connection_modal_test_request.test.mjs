import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSQLModal } from './sql_connection_modal.fixture.mjs';
import { setField, click, statusType, statusText, flush } from './sql_connection_modal_testkit.mjs';

test('SQL connection modal test request', async () => {
  const successCalls = [];
  const successFetch = async (url, opts) => {
    successCalls.push({ url, opts });
    return { json: async () => ({ ok: true, message: 'Conectado a srv/DB', latency_ms: 12.3 }) };
  };
  {
    const { modal, doc } = loadSQLModal({ fetchImpl: successFetch });
    modal.open();
    setField(doc, 'sqlm-host', 'srv');
    setField(doc, 'sqlm-db', 'DB');
    setField(doc, 'sqlm-user', 'sa');
    setField(doc, 'sqlm-pass', 'pw');
    click(doc, 'sqlm-test');
    await flush();
    assert.equal(statusType(doc), 'ok');
    assert.match(statusText(doc), /Conectado a srv\/DB/);
    assert.equal(successCalls.length, 1);
    assert.ok(successCalls[0].url.includes('/_test'));
  }

  const failFetch = async () => ({ json: async () => ({ ok: false, message: 'No se pudo conectar', latency_ms: 5.0 }) });
  {
    const { modal, doc } = loadSQLModal({ fetchImpl: failFetch });
    modal.open();
    setField(doc, 'sqlm-host', 'bad-host');
    setField(doc, 'sqlm-db', 'DB');
    setField(doc, 'sqlm-user', 'u');
    setField(doc, 'sqlm-pass', 'p');
    click(doc, 'sqlm-test');
    await flush();
    assert.equal(statusType(doc), 'error');
    assert.match(statusText(doc), /No se pudo conectar/);
  }

  const throwFetch = async () => { throw new Error('Network timeout'); };
  {
    const { modal, doc } = loadSQLModal({ fetchImpl: throwFetch });
    modal.open();
    setField(doc, 'sqlm-host', 'srv');
    setField(doc, 'sqlm-db', 'DB');
    setField(doc, 'sqlm-user', 'u');
    setField(doc, 'sqlm-pass', 'p');
    click(doc, 'sqlm-test');
    await flush();
    assert.equal(statusType(doc), 'error');
    assert.match(statusText(doc), /Error de red/);
  }
});
