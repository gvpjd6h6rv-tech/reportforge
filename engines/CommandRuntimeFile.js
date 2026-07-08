'use strict';

(function initCommandRuntimeFile(global) {
  const { renderSectionsAndSelection, setStatus } = global.CommandRuntimeShared;
  // Layout-chrome/page-metrics/doc-type application lives in
  // CommandRuntimeFileApply.js — extracted to stay under this file's
  // governance byte threshold. Only _refreshEditor calls into it.
  const A = global.CommandRuntimeFileApply;
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
    A._applyPageMetrics(layout, _currentLayout);
    A._applyLayoutChrome(layout);
    if (layout.docType) A._syncDocTypeUi(layout.docType);

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

    // RF-CR-PARAMS-PANEL-2 (Fase 10): non-destructive sync so
    // LeftParametersPanel.render() (Fase 9) reads the parameters that
    // were just loaded — DS.layout has no other producer, so this only
    // ever adds/overwrites the `parameters` key, never drops unrelated
    // fields a future producer might set on DS.layout.
    DS.layout = { ...(DS.layout || {}), parameters: layout.parameters || [] };
    if (typeof LeftParametersPanel !== 'undefined') LeftParametersPanel.render();
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
    // Fase 10: restore parameter VALUES separately from DS.layout
    // (definitions) — old files without parameterValues fall back to {},
    // never inheriting whatever was in memory from a previously open doc.
    DS.parameterValues = (layout.parameterValues && typeof layout.parameterValues === 'object') ? { ...layout.parameterValues } : {};
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
      // Fase 10: persist parameter definitions (DS.layout.parameters —
      // synced by _refreshEditor, Fase 9's only producer/consumer) and
      // their current in-memory values (DS.parameterValues) so a
      // reload restores both, not just layout/sections/elements.
      parameters: (DS.layout && Array.isArray(DS.layout.parameters)) ? DS.layout.parameters : [],
      parameterValues: { ...(DS.parameterValues || {}) },
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
