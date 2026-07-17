'use strict';

(function initCommandRuntimeFile(global) {
  const { setStatus } = global.CommandRuntimeShared;
  const A = global.CommandRuntimeFileApply;
  const L = global.CommandRuntimeFileLoad;
  let _currentLayout = {
    name: 'Factura Electrónica', version: '1.0',
    pageWidth: typeof CFG !== 'undefined' ? CFG.PAGE_W : 754,
    pageHeight: typeof CFG !== 'undefined' ? CFG.PAGE_H : 1123, pageSize: 'A4',
    docType: typeof DS !== 'undefined' ? DS._docType || null : null, margins: null,
  };
  let _currentLayoutFileHandle = null;

  const _ELEMENT_DEFAULTS = {
    fontFamily: 'Arial', fontSize: 8, bold: false, italic: false, underline: false,
    align: 'left', color: '#000000', bgColor: 'transparent',
    borderColor: 'transparent', borderWidth: 0, borderStyle: 'solid',
    content: '', fieldPath: '', fieldFmt: null,
    lineWidth: 1, zIndex: 0,
  };

  function _normalizeLayout(raw) {
    const layout = raw && typeof raw === 'object' && !Array.isArray(raw) && raw.layout && typeof raw.layout === 'object'
      ? raw.layout
      : raw;

    if (!layout || typeof layout !== 'object' || Array.isArray(layout)) {
      throw new Error('El archivo no contiene un layout JSON válido');
    }

    const sections = Array.isArray(layout.sections) ? layout.sections.map((section) => ({ ...section })) : [];
    const elements = Array.isArray(layout.elements)
      ? layout.elements.map((element) => ({ ..._ELEMENT_DEFAULTS, ...element }))
      : [];

    if (!sections.length) {
      throw new Error('El archivo no contiene secciones');
    }

    return { ...layout, sections, elements };
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
    A._applyPageMetrics(_currentLayout, _currentLayout);
    A._applyLayoutChrome(_currentLayout);
    if (_currentLayout.docType) A._syncDocTypeUi(_currentLayout.docType);
    L.refreshLoadedLayout(_currentLayout, name, fileHandle);
    setStatus(statusMessage || `✓ Abierto: ${file ? file.name : name}`);
  }

  function _slugifyName(name) {
    return String(name || 'reporte')
      .replace(/\.json$/i, '')
      .replace(/[^a-zA-Z0-9-_ ]/g, '')
      .trim()
      .replace(/\s+/g, '_') || 'reporte';
  }

  function _currentLayoutName() {
    return _currentLayout.name;
  }

  function _setFileHandle(fileHandle, name) {
    _currentLayoutFileHandle = fileHandle;
    if (name) _currentLayout = { ..._currentLayout, name };
  }

  global.CommandRuntimeFile = {
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
  if (global.CommandRuntimeFileSerialization && typeof global.CommandRuntimeFileSerialization.attach === 'function') {
    global.CommandRuntimeFileSerialization.attach(global.CommandRuntimeFile, () => ({
      currentLayout: _currentLayout,
      ds: DS,
      cfg: CFG,
      sqlCommandStore: SqlCommandStore,
    }));
  }
})(window);
