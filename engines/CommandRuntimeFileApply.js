'use strict';

/* CommandRuntimeFileApply — apply a loaded layout's chrome/metrics/doc-type
 * to the live DOM/DS, for CommandRuntimeFile.js's _refreshEditor(). Extracted
 * verbatim (no behavior change) to keep that file under its governance byte
 * threshold. Owner boundary unchanged: only _refreshEditor calls into this.
 */
(function initCommandRuntimeFileApply(global) {
  function _syncDocTypeUi(docType) {
    if (!docType) return;
    if (typeof DOC_TYPES === 'undefined' || !DOC_TYPES[docType]) return;

    DS._docType = docType;
    const activeTree = DOC_TYPES[docType].fieldTree || FIELD_TREE;
    window.FIELD_TREE = activeTree;

    document.querySelectorAll('.doc-type-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.doctype === docType);
    });

    FieldExplorerEngine.render();
    if (typeof LeftParametersPanel !== 'undefined') LeftParametersPanel.render();
    DS._sampleData = DOC_TYPES[docType].sampleData || SAMPLE_DATA;
  }

  function _applyLayoutChrome(layout) {
    const title = layout.name || 'Reporte';
    const titleBar = document.getElementById('titlebar-text');
    if (titleBar) titleBar.textContent = `SAP Crystal Reports for SAP Business One - [${title}]`;

    const activeTab = document.querySelector('#tabs-row .file-tab.active');
    if (activeTab) activeTab.childNodes[0].nodeValue = `${title} `;

    document.title = `SAP Crystal Reports for SAP Business One - [${title}]`;
  }

  function _applyPageMetrics(layout, _currentLayout) {
    const nextWidth = Number(layout.pageWidth);
    if (Number.isFinite(nextWidth) && nextWidth > 0) {
      CFG.PAGE_W = nextWidth;
      _currentLayout.pageWidth = nextWidth;
    }

    // RF-GEOMETRY-UNIFY-1: sync page HEIGHT from the layout too (source of
    // truth), mirroring pageWidth. When the layout omits pageHeight, keep the
    // server default (advanced_engine _page_h = 1123, seeded in CFG.PAGE_H) so
    // Design, Preview and PDF all resolve the same page box.
    const nextHeight = Number(layout.pageHeight);
    CFG.PAGE_H = (Number.isFinite(nextHeight) && nextHeight > 0) ? nextHeight
      : (Number.isFinite(Number(CFG.PAGE_H)) && Number(CFG.PAGE_H) > 0 ? CFG.PAGE_H : 1123);
    _currentLayout.pageHeight = CFG.PAGE_H;

    if (layout.pageSize) _currentLayout.pageSize = layout.pageSize;
    if (layout.margins && typeof layout.margins === 'object') {
      _currentLayout.margins = { ...layout.margins };
      if (Number.isFinite(layout.margins.left)) {
        DS.setPageMarginLeft(layout.margins.left, 'CommandRuntimeFile.loadLayoutIntoEditor');
      }
      if (Number.isFinite(layout.margins.top)) {
        DS.setPageMarginTop(layout.margins.top, 'CommandRuntimeFile.loadLayoutIntoEditor');
      }
    }
  }

  global.CommandRuntimeFileApply = { _syncDocTypeUi, _applyLayoutChrome, _applyPageMetrics };
})(window);
