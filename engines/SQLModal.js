'use strict';

(function initSQLModal(global) {
  const SQLModal = global.SQLConnectionModal || { open() {}, close() {} };
  global.SQLModal = SQLModal;
  if (typeof module !== 'undefined') module.exports = SQLModal;
})(typeof window !== 'undefined' ? window : globalThis);
