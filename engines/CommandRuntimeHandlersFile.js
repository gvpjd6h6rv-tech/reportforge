'use strict';

(function initCommandRuntimeHandlersFile(global) {
  const { dispatchActionMap } = global.CommandRuntimeShared;

  function runExportPdf() {
    FileEngine.exportPDF().catch((error) => alert(`Error al exportar PDF: ${error.message}`));
  }

  function handleFileCommands(action) {
    return dispatchActionMap(action, {
      open() { FileEngine.load(); },
      save() { FileEngine.save(); },
      'save-as': () => FileEngine.saveAs(),
      'export-json': () => FileEngine.exportJSON(),
      'export-pdf': runExportPdf,
    });
  }

  global.CommandRuntimeHandlersFile = { handleFileCommands };
})(window);
