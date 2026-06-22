'use strict';

(function initDocumentStoreUtils(global) {
  function install(target, newId, mkEl) {
    target.newId = newId;
    target.mkEl = mkEl;
  }

  global.DocumentStoreUtils = { install };
})(window);
