import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSQLModal } from './sql_connection_modal.fixture.mjs';
import { loadSQLModalRuntime } from './sql_connection_modal_runtime.mjs';
import { setField, click, statusType, statusText, flush } from './sql_connection_modal_testkit.mjs';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SOURCES_WITHOUT_FIELDS = [
  'engines/SQLConnectionDiagnosis.js',
  'engines/SQLConnectionModalView.js',
  'engines/SQLConnectionModalApi.js',
  'engines/SQLConnectionModalStorage.js',
  'engines/SQLConnectionModal.js',
].map((path) => fs.readFileSync(`${ROOT}/${path}`, 'utf8'));

test('SQL connection modal validation', async () => {
  {
    const { modal, doc } = loadSQLModal();
    modal.open();
    setField(doc, 'sqlm-host', '');
    setField(doc, 'sqlm-db', 'SBO');
    setField(doc, 'sqlm-user', 'sa');
    setField(doc, 'sqlm-pass', 'pw');
    click(doc, 'sqlm-test');
    await flush();
    assert.equal(statusType(doc), 'error');
    assert.match(statusText(doc), /Servidor, base de datos, usuario y contraseña son obligatorios/);
  }

  {
    const { modal, doc } = loadSQLModal();
    modal.open();
    setField(doc, 'sqlm-alias', '');
    setField(doc, 'sqlm-host', 'srv');
    setField(doc, 'sqlm-db', 'DB');
    setField(doc, 'sqlm-user', 'u');
    setField(doc, 'sqlm-pass', 'p');
    click(doc, 'sqlm-save');
    await flush();
    assert.equal(statusType(doc), 'error');
    assert.match(statusText(doc), /El alias es obligatorio/);
  }

  {
    const { modal, doc } = loadSQLModal();
    modal.open();
    setField(doc, 'sqlm-alias', 'sap_b1');
    setField(doc, 'sqlm-host', '');
    setField(doc, 'sqlm-db', 'DB');
    setField(doc, 'sqlm-user', 'u');
    setField(doc, 'sqlm-pass', 'p');
    click(doc, 'sqlm-save');
    await flush();
    assert.match(statusText(doc), /Servidor, base de datos, usuario y contraseña son obligatorios/);
  }

  {
    const { modal, doc } = loadSQLModalRuntime({ sources: SOURCES_WITHOUT_FIELDS });
    modal.open();
    await assert.rejects(
      modal.runAction('test'),
      /SQLConnectionModalFields is required before opening the SQL connection modal/,
    );
    assert.equal(doc.body._children.length, 1);
  }
});
