'use strict';

(function initCommandRuntimeHandlersDialog(global) {
  const { dispatchActionMap } = global.CommandRuntimeShared;

  function runNewReport() {
    if (!confirm('¿Nuevo reporte? Se perderán los cambios no guardados.')) return;
    DS.setElements([], 'CommandRuntimeHandlers.new');
    DS.sections.forEach((s) => { s.height = s.stype === 'det' ? 14 : 60; });
    DS.clearSelectionState('CommandRuntimeHandlers.new');
    SectionEngine.render();
    SelectionEngine.clearSelection();
    DS.saveHistory();
  }

  function handleDialogCommands(action) {
    return dispatchActionMap(action, {
      new: runNewReport,
      quit: () => { if (confirm('¿Cerrar ReportForge?')) window.close(); },
    });
  }

  global.CommandRuntimeHandlersDialog = { handleDialogCommands };
})(window);
