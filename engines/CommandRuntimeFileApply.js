'use strict';

/* CommandRuntimeFileApply — apply layout chrome, page metrics, page format,
 * and document type to the live designer runtime.
 */
(function initCommandRuntimeFileApply(global) {
  function _runtimeConfig() {
    return global.RF && global.RF.RuntimeConfig ? global.RF.RuntimeConfig : null;
  }

  function _pageFormats() {
    const cfg = _runtimeConfig();
    if (!cfg || !cfg.pageFormats) throw new Error('RuntimeConfig.pageFormats no está disponible');
    return cfg.pageFormats;
  }

  function _pxPerMm() {
    const cfg = _runtimeConfig();
    return cfg && cfg.units ? Number(cfg.units.cssPxPerMm) : 96 / 25.4;
  }

  function _formatKey(value) {
    return String(value || '').toUpperCase() === 'TICKET' ? 'TICKET' : 'A4';
  }

  function _ticketWidth(value) {
    const ticket = _pageFormats().TICKET;
    const width = Number(value);
    return ticket.widthsMm.includes(width) ? width : ticket.defaultWidthMm;
  }

  function _nearestTicketWidth(pageWidth) {
    const ticket = _pageFormats().TICKET;
    const mm = Number(pageWidth) / _pxPerMm();
    return ticket.widthsMm.reduce((best, width) => (
      Math.abs(width - mm) < Math.abs(best - mm) ? width : best
    ), ticket.defaultWidthMm);
  }

  function getPageFormatState(layout = {}) {
    const pageSize = String(layout.pageSize || '').toUpperCase();
    const format = pageSize === 'TICKET' ? 'TICKET' : 'A4';
    return {
      format,
      ticketWidthMm: format === 'TICKET'
        ? _ticketWidth(layout.ticketWidthMm || _nearestTicketWidth(layout.pageWidth))
        : _pageFormats().TICKET.defaultWidthMm,
    };
  }

  function _copyMargins(value, fallback) {
    const source = value && typeof value === 'object' ? value : fallback;
    return {
      top: Number(source.top),
      right: Number(source.right),
      bottom: Number(source.bottom),
      left: Number(source.left),
    };
  }

  function _buildPageFormatLayout(layout = {}, selection = {}) {
    const formats = _pageFormats();
    const current = getPageFormatState(layout);
    const format = _formatKey(selection.format);
    const preset = formats[format];
    const sameFormat = current.format === format;
    const margins = _copyMargins(sameFormat ? layout.margins : null, preset.marginsMm);

    if (format === 'A4') {
      return {
        ...layout,
        pageSize: preset.pageSize,
        pageWidth: preset.pageWidthPx,
        pageHeight: preset.pageHeightPx,
        orientation: 'portrait',
        ticketWidthMm: null,
        margins,
      };
    }

    const ticketWidthMm = _ticketWidth(selection.ticketWidthMm);
    const currentHeight = Number(layout.pageHeight);
    return {
      ...layout,
      pageSize: preset.pageSize,
      pageWidth: Math.round(ticketWidthMm * _pxPerMm()),
      pageHeight: Number.isFinite(currentHeight) && currentHeight > 0
        ? currentHeight
        : preset.pageHeightPx,
      orientation: 'portrait',
      ticketWidthMm,
      margins,
    };
  }

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

  function _applyPageMetrics(layout, currentLayout) {
    const nextWidth = Number(layout.pageWidth);
    if (Number.isFinite(nextWidth) && nextWidth > 0) {
      CFG.PAGE_W = nextWidth;
      currentLayout.pageWidth = nextWidth;
    }

    const nextHeight = Number(layout.pageHeight);
    CFG.PAGE_H = Number.isFinite(nextHeight) && nextHeight > 0
      ? nextHeight
      : (Number.isFinite(Number(CFG.PAGE_H)) && Number(CFG.PAGE_H) > 0 ? CFG.PAGE_H : 1123);
    currentLayout.pageHeight = CFG.PAGE_H;

    if (layout.pageSize) currentLayout.pageSize = layout.pageSize;
    currentLayout.ticketWidthMm = layout.ticketWidthMm || null;
    if (layout.margins && typeof layout.margins === 'object') {
      currentLayout.margins = { ...layout.margins };
      if (Number.isFinite(layout.margins.left)) {
        DS.setPageMarginLeft(layout.margins.left, 'CommandRuntimeFile.loadLayoutIntoEditor');
      }
      if (Number.isFinite(layout.margins.top)) {
        DS.setPageMarginTop(layout.margins.top, 'CommandRuntimeFile.loadLayoutIntoEditor');
      }
    }
  }

  function applyPageFormat(selection) {
    const file = global.CommandRuntimeFile;
    if (!file) throw new Error('CommandRuntimeFile no está disponible');

    const next = _buildPageFormatLayout(file._currentLayout, selection);
    file._currentLayout = next;
    _applyPageMetrics(next, next);

    if (typeof global.applyLayout === 'function') global.applyLayout();
    if (global.SectionEngine && typeof global.SectionEngine.render === 'function') {
      global.SectionEngine.render();
    }
    if (typeof DS !== 'undefined' && DS.previewMode &&
        global.PreviewEngineRenderer && typeof global.PreviewEngineRenderer.refresh === 'function') {
      global.PreviewEngineRenderer.refresh();
    }
    return getPageFormatState(next);
  }

  global.CommandRuntimeFileApply = {
    _syncDocTypeUi,
    _applyLayoutChrome,
    _applyPageMetrics,
    _buildPageFormatLayout,
    getPageFormatState,
    applyPageFormat,
  };
})(window);
