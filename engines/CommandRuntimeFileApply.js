'use strict';

/* Applies a loaded layout to the live runtime. Page-format decisions live in
 * PageFormatModel.js; this file only synchronizes runtime state and chrome.
 */
(function initCommandRuntimeFileApply(global) {
  function syncDocTypeUi(docType) {
    if (!docType || typeof DOC_TYPES === 'undefined' || !DOC_TYPES[docType]) return;
    DS._docType = docType;
    const def = DOC_TYPES[docType];
    window.FIELD_TREE = def.fieldTree || FIELD_TREE;
    document.querySelectorAll('.doc-type-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.doctype === docType);
    });
    FieldExplorerEngine.render();
    if (typeof LeftParametersPanel !== 'undefined') LeftParametersPanel.render();
    DS._sampleData = def.sampleData || SAMPLE_DATA;
  }

  function applyLayoutChrome(layout) {
    const title = layout.name || 'Reporte';
    const titleBar = document.getElementById('titlebar-text');
    if (titleBar) titleBar.textContent = `SAP Crystal Reports for SAP Business One - [${title}]`;
    if (global.DocumentTabManager) global.DocumentTabManager.updateCurrent({ name: title });
    document.title = `SAP Crystal Reports for SAP Business One - [${title}]`;
  }

  function applyPageMetrics(layout, currentLayout) {
    const width = Number(layout.pageWidth);
    if (Number.isFinite(width) && width > 0) CFG.PAGE_W = currentLayout.pageWidth = width;

    const height = Number(layout.pageHeight);
    CFG.PAGE_H = Number.isFinite(height) && height > 0
      ? height
      : (Number.isFinite(Number(CFG.PAGE_H)) && Number(CFG.PAGE_H) > 0 ? CFG.PAGE_H : 1123);
    currentLayout.pageHeight = CFG.PAGE_H;
    if (layout.pageSize) currentLayout.pageSize = layout.pageSize;
    currentLayout.ticketWidthMm = layout.ticketWidthMm || null;

    if (!layout.margins || typeof layout.margins !== 'object') return;
    currentLayout.margins = { ...layout.margins };
    if (Number.isFinite(layout.margins.left)) {
      DS.setPageMarginLeft(layout.margins.left, 'CommandRuntimeFile.loadLayoutIntoEditor');
    }
    if (Number.isFinite(layout.margins.top)) {
      DS.setPageMarginTop(layout.margins.top, 'CommandRuntimeFile.loadLayoutIntoEditor');
    }
  }

  function refreshPageLayout() {
    if (typeof global.applyLayout === 'function') global.applyLayout();
    if (global.SectionEngine && typeof global.SectionEngine.render === 'function') global.SectionEngine.render();
    if (typeof DS !== 'undefined' && DS.previewMode && global.PreviewEngineRenderer) {
      global.PreviewEngineRenderer.refresh();
    }
  }

  global.CommandRuntimeFileApply = {
    _syncDocTypeUi: syncDocTypeUi,
    _applyLayoutChrome: applyLayoutChrome,
    _applyPageMetrics: applyPageMetrics,
    applyPageMetrics,
    refreshPageLayout,
  };
})(window);
