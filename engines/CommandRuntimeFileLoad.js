'use strict';

(function initCommandRuntimeFileLoad(global) {
  function refreshLoadedLayout(layout, name, fileHandle) {
    if (DS.state && Array.isArray(DS.state.history)) {
      DS.state.history.length = 0;
      DS.state.historyIndex = -1;
    }

    DS.setSections(layout.sections, 'CommandRuntimeFile.loadLayoutIntoEditor');
    DS.setElements(layout.elements, 'CommandRuntimeFile.loadLayoutIntoEditor');
    DS.clearSelectionState('CommandRuntimeFile.loadLayoutIntoEditor');

    if (typeof applyLayout === 'function') applyLayout();
    if (typeof DesignZoomEngine !== 'undefined' && typeof DesignZoomEngine.set === 'function') {
      DesignZoomEngine.set(DS.zoom || 1.0);
    }
    if (typeof SectionEngine !== 'undefined' && typeof SectionEngine.render === 'function') {
      SectionEngine.render();
    }
    if (typeof SelectionEngine !== 'undefined' && typeof SelectionEngine.clearSelection === 'function') {
      SelectionEngine.clearSelection();
    }
    if (typeof DS.saveHistory === 'function') DS.saveHistory();

    DS.layout = { ...(DS.layout || {}), parameters: layout.parameters || [] };
    if (typeof LeftParametersPanel !== 'undefined') LeftParametersPanel.render();
    DS.parameterValues = (layout.parameterValues && typeof layout.parameterValues === 'object')
      ? { ...layout.parameterValues }
      : {};

    if (typeof SqlCommandStore !== 'undefined' && typeof SqlCommandStore.clear === 'function') {
      SqlCommandStore.clear();
      (Array.isArray(layout.sqlCommands) ? layout.sqlCommands : []).forEach((sqlCommand) => {
        SqlCommandStore.add(sqlCommand);
      });
    }

    if (typeof DocumentTabManager !== 'undefined' && typeof DocumentTabManager._switchToNewTab === 'function') {
      DocumentTabManager._switchToNewTab(name, fileHandle);
    }
    if (typeof DocumentTabManager !== 'undefined') {
      DocumentTabManager.updateCurrent({ name, fileHandle });
      DocumentTabManager.markCurrentSaved();
    }
  }

  global.CommandRuntimeFileLoad = {
    refreshLoadedLayout,
    _refreshLoadedLayout: refreshLoadedLayout,
  };
})(window);
