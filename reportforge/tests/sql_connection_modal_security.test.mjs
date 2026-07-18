import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSQLModal } from './sql_connection_modal.fixture.mjs';
import { setField, click, statusText, flush } from './sql_connection_modal_testkit.mjs';

test('SQL connection modal security', async () => {
  let call = null;
  const fetchImpl = async (url, opts) => {
    call = { url, headers: opts?.headers || {} };
    return {
      json: async () => ({
        ok: false,
        message: 'No se pudo conectar a srv/DB',
        details: {
          debugCode: 'RuntimeError: Login failed. Password=super_secret',
          suggestion: 'Verifica la conectividad entre el navegador y el servidor.',
        },
      }),
    };
  };

  const { modal, doc } = loadSQLModal({ fetchImpl });
  modal.open();
  setField(doc, 'sqlm-alias', 'sap_b1');
  setField(doc, 'sqlm-host', 'srv');
  setField(doc, 'sqlm-db', 'DB');
  setField(doc, 'sqlm-user', 'u');
  setField(doc, 'sqlm-pass', 'super_secret');
  click(doc, 'sqlm-test');
  await flush();

  assert.match(`${call.url}\n${JSON.stringify(call.headers)}\n${statusText(doc)}`, /^(?!.*super_secret).*Causa:[\s\S]*Sugerencia:/s);
});
