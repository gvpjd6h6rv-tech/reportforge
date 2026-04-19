'use strict';

(function initCommandRuntimeShared(global) {
  function setStatus(message) {
    const status = document.getElementById('sb-msg');
    if (status) status.textContent = message;
  }

  function syncSelectionPanels() {
    SelectionEngine.renderHandles();
    PropertiesEngine.render();
    FormatEngine.updateToolbar();
  }

  function renderSelectionHandles() {
    SelectionEngine.renderHandles && SelectionEngine.renderHandles();
  }

  function renderSectionsAndSelection() {
    SectionEngine.render();
    SelectionEngine.clearSelection();
  }

  global.CommandRuntimeShared = {
    setStatus,
    syncSelectionPanels,
    renderSelectionHandles,
    renderSectionsAndSelection,
  };
})(window);
