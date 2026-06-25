'use strict';

(function initCommandRuntimeHandlersDialog(global) {
  const { dispatchActionMap } = global.CommandRuntimeShared;

  function runNewReport() {
    DocumentTabManager.create();
  }

  function handleDialogCommands(action) {
    return dispatchActionMap(action, {
      new: runNewReport,
      quit: () => { if (confirm('¿Cerrar ReportForge?')) window.close(); },
    });
  }

  global.CommandRuntimeHandlersDialog = { handleDialogCommands };
})(window);
