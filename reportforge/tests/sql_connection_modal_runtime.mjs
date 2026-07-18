import { createMockDocument } from './sql_connection_modal_dom.mjs';
export function loadSQLModalRuntime({ sources = [], fetchImpl = null } = {}) {
  const doc = createMockDocument();
  const window = { document: doc, globalThis: null, module: { exports: {} } };
  window.globalThis = window;
  if (fetchImpl) window.fetch = fetchImpl;
  new Function('window', 'document', 'module', 'globalThis', sources.join('\n'))(window, doc, window.module, window);
  return { modal: window.SQLConnectionModal, doc };
}
