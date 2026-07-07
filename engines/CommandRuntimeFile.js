'use strict';

(function initCommandRuntimeFile(global) {
  const { renderSectionsAndSelection, setStatus } = global.CommandRuntimeShared;
  let _currentLayout = {
    name: 'Factura Electrónica', version: '1.0',
    pageWidth: typeof CFG !== 'undefined' ? CFG.PAGE_W : 754,
    pageHeight: typeof CFG !== 'undefined' ? CFG.PAGE_H : 1123, pageSize: 'A4',
    docType: typeof DS !== 'undefined' ? DS._docType || null : null, margins: null,
  };
  let _currentLayoutFileHandle = null;

  // mkEl fills these for in-app elements; a loaded external JSON skipping
  // a field (e.g. borderStyle) stayed undefined, breaking _setBorder()'s
  // CSS. lineDir excluded: must stay falsy for aspect-ratio inference.
  const _ELEMENT_DEFAULTS = {
    fontFamily: 'Arial', fontSize: 8, bold: false, italic: false, underline: false,
    align: 'left', color: '#000000', bgColor: 'transparent',
    borderColor: 'transparent', borderWidth: 0, borderStyle: 'solid',
    content: '', fieldPath: '', fieldFmt: null,
    lineWidth: 1, zIndex: 0,
  };

  function _cloneSection(section) { return { ...section }; }
  function _cloneElement(element) { return { ..._ELEMENT_DEFAULTS, ...element }; }

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

  function _applyPageMetrics(layout) {
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

  function _normalizeLayout(raw) {
    const layout = raw && typeof raw === 'object' && !Array.isArray(raw) && raw.layout && typeof raw.layout === 'object'
      ? raw.layout
      : raw;

    if (!layout || typeof layout !== 'object' || Array.isArray(layout)) {
      throw new Error('El archivo no contiene un layout JSON válido');
    }

    const sections = Array.isArray(layout.sections) ? layout.sections.map(_cloneSection) : [];
    const elements = Array.isArray(layout.elements) ? layout.elements.map(_cloneElement) : [];

    if (!sections.length) {
      throw new Error('El archivo no contiene secciones');
    }

    return { ...layout, sections, elements };
  }

  function _refreshEditor(layout) {
    _applyPageMetrics(layout);
    _applyLayoutChrome(layout);
    if (layout.docType) _syncDocTypeUi(layout.docType);

    if (DS.state && Array.isArray(DS.state.history)) { DS.state.history.length = 0; DS.state.historyIndex = -1; }
    DS.setSections(layout.sections, 'CommandRuntimeFile.loadLayoutIntoEditor');
    DS.setElements(layout.elements, 'CommandRuntimeFile.loadLayoutIntoEditor');
    DS.clearSelectionState('CommandRuntimeFile.loadLayoutIntoEditor');

    if (typeof applyLayout === 'function') applyLayout();
    if (typeof DesignZoomEngine !== 'undefined' && typeof DesignZoomEngine.set === 'function') {
      DesignZoomEngine.set(DS.zoom || 1.0);
    }
    SectionEngine.render();
    SelectionEngine.clearSelection();
    if (typeof DS.saveHistory === 'function') DS.saveHistory();
  }

  function _applyLoadedLayout(layout, file, fileHandle = null, statusMessage = null) {
    const name = layout.name || (file && file.name ? file.name.replace(/\.json$/i, '') : 'Reporte');
    _currentLayout = {
      ..._currentLayout,
      ...layout,
      name,
      version: layout.version || _currentLayout.version,
      docType: layout.docType || null,
      margins: layout.margins && typeof layout.margins === 'object' ? { ...layout.margins } : _currentLayout.margins,
    };
    _currentLayoutFileHandle = fileHandle;
    if (typeof DocumentTabManager !== 'undefined' && typeof DocumentTabManager._switchToNewTab === 'function') {
      DocumentTabManager._switchToNewTab(name, fileHandle);
    }
    _refreshEditor(_currentLayout);
    if (typeof DocumentTabManager !== 'undefined') {
      DocumentTabManager.updateCurrent({ name, fileHandle });
      DocumentTabManager.markCurrentSaved();
    }
    setStatus(statusMessage || `✓ Abierto: ${file ? file.name : name}`);
  }

  function _slugifyName(name) {
    return String(name || 'reporte').replace(/\.json$/i, '').replace(/[^a-zA-Z0-9-_ ]/g, '').trim().replace(/\s+/g, '_') || 'reporte';
  }

  function _liveMargins() {
    const margins = _currentLayout.margins && typeof _currentLayout.margins === 'object' ? { ..._currentLayout.margins } : {};
    if (Number.isFinite(DS.pageMarginLeft)) margins.left = DS.pageMarginLeft;
    if (Number.isFinite(DS.pageMarginTop)) margins.top = DS.pageMarginTop;
    return Object.keys(margins).length ? margins : null;
  }

  function _liveLayoutMeta() {
    return {
      name: _currentLayout.name || 'Reporte',
      version: _currentLayout.version || '1.0',
      pageWidth: Number.isFinite(CFG.PAGE_W) ? CFG.PAGE_W : _currentLayout.pageWidth,
      pageHeight: Number.isFinite(CFG.PAGE_H) ? CFG.PAGE_H : _currentLayout.pageHeight,
      pageSize: _currentLayout.pageSize || 'A4',
      docType: DS._docType || _currentLayout.docType || null,
      margins: _liveMargins(),
    };
  }

  function toJSON() {
    const payload = {
      ..._liveLayoutMeta(),
      sections: DS.sections.map((s) => ({ ...s })),
      elements: DS.elements.map((e) => ({ ...e })),
      savedAt: new Date().toISOString(),
    };
    return JSON.stringify(payload, null, 2);
  }

  function _currentLayoutName() { return _currentLayout.name; }
  function _setFileHandle(fileHandle, name) {
    _currentLayoutFileHandle = fileHandle;
    if (name) _currentLayout = { ..._currentLayout, name };
  }

  global.CommandRuntimeFile = {
    toJSON,
    get save() { return global.CommandRuntimeFileIO.save; },
    get load() { return global.CommandRuntimeFileIO.load; },
    get exportJSON() { return global.CommandRuntimeFileIO.exportJSON; },
    get exportPDF() { return global.CommandRuntimeFileIO.exportPDF; },
    get importJSON() { return global.CommandRuntimeFileIO.importJSON; },
    get saveAs() { return global.CommandRuntimeFileIO.saveAs; },
    _normalizeLayout,
    _applyLoadedLayout,
    _slugifyName,
    _currentLayoutName,
    _setFileHandle,
    get _currentLayout()             { return _currentLayout; },
    set _currentLayout(v)            { _currentLayout = v; },
    get _currentLayoutFileHandle()   { return _currentLayoutFileHandle; },
    set _currentLayoutFileHandle(v)  { _currentLayoutFileHandle = v; },
  };
})(window);
