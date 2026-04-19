'use strict';

(function initCommandRuntimeInit(global) {
  function initCommandRuntimeState() {
    DS._sampleData = SAMPLE_DATA;
    const items = SAMPLE_DATA.items || [];
    document.getElementById('sb-records').textContent = `Items: ${items.length}`;
    console.log('[ReportForge] Multi-doc engine listo — 5 tipos: factura, remision, nota_credito, retencion, liquidacion');
  }

  (function patchSaveHistoryForPreview() {
    const origSave = DS.saveHistory.bind(DS);
    DS.saveHistory = function() {
      origSave();
      if (DS.previewMode) _canonicalPreviewWriter().refresh();
    };
  })();

  global.CommandRuntimeInit = { initCommandRuntimeState };
})(window);
