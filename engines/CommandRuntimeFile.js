'use strict';

(function initCommandRuntimeFile(global) {
  const { renderSectionsAndSelection, setStatus } = global.CommandRuntimeShared;
  let _currentLayout = {
    name: 'Factura Electrónica',
    version: '1.0',
    pageWidth: typeof CFG !== 'undefined' ? CFG.PAGE_W : 754,
    pageSize: 'A4',
    docType: typeof DS !== 'undefined' ? DS._docType || null : null,
    margins: null,
  };

  const OPEN_PICKER_REENTRY_MS = 900;
  let _openLayoutPickerActive = false;
  let _openLayoutPickerBlockedUntil = 0;
  let _openLayoutPickerInput = null;
  let _currentLayoutFileHandle = null;

  function _isOpenLayoutPickerBlocked() {
    return _openLayoutPickerActive || Date.now() < _openLayoutPickerBlockedUntil;
  }

  function _resetOpenLayoutPicker(input) {
    if (_openLayoutPickerInput === input) _openLayoutPickerInput = null;
    _openLayoutPickerActive = false;
    _openLayoutPickerBlockedUntil = Date.now() + OPEN_PICKER_REENTRY_MS;
    input?.remove();
  }

  function _releaseOpenLayoutPickerOnFocus(input) {
    window.setTimeout(() => {
      if (_openLayoutPickerInput !== input) return;
      if (input.files && input.files.length > 0) return;
      _resetOpenLayoutPicker(input);
    }, 250);
  }

  function _cloneSection(section) {
    return { ...section };
  }

  function _cloneElement(element) {
    return { ...element };
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

    return {
      ...layout,
      sections,
      elements,
    };
  }

  function _refreshEditor(layout) {
    _applyPageMetrics(layout);
    _applyLayoutChrome(layout);
    if (layout.docType) {
      _syncDocTypeUi(layout.docType);
    }

    if (DS.state && Array.isArray(DS.state.history)) {
      DS.state.history.length = 0;
      DS.state.historyIndex = -1;
    }
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

  function _readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error || new Error('No se pudo leer el archivo'));
      reader.readAsText(file, 'utf-8');
    });
  }

  function _applyLoadedLayout(layout, file, fileHandle = null, statusMessage = null) {
    _currentLayout = {
      ..._currentLayout,
      ...layout,
      name: layout.name || file.name.replace(/\.json$/i, ''),
      version: layout.version || _currentLayout.version,
      docType: layout.docType || null,
      margins: layout.margins && typeof layout.margins === 'object' ? { ...layout.margins } : _currentLayout.margins,
    };
    _currentLayoutFileHandle = fileHandle;
    _refreshEditor(_currentLayout);
    setStatus(statusMessage || `✓ Abierto: ${file.name}`);
  }

  async function _loadFileIntoEditor(file, fileHandle = null) {
    const text = await _readFileAsText(file);
    const parsed = JSON.parse(text);
    const layout = _normalizeLayout(parsed);
    _applyLoadedLayout(layout, file, fileHandle, `✓ Abierto: ${file.name}`);
  }

  async function _ensureWritablePermission(fileHandle) {
    if (!fileHandle) return false;
    if (typeof fileHandle.queryPermission !== 'function') return true;

    const options = { mode: 'readwrite' };
    const current = await fileHandle.queryPermission(options);
    if (current === 'granted') return true;
    if (typeof fileHandle.requestPermission !== 'function') return false;

    return await fileHandle.requestPermission(options) === 'granted';
  }

  async function _writeTextToFileHandle(fileHandle, text) {
    const writable = await fileHandle.createWritable();
    try {
      await writable.write(text);
    } finally {
      await writable.close();
    }
  }

  async function _loadWithFileSystemPicker() {
    try {
      const [fileHandle] = await window.showOpenFilePicker({
        multiple: false,
        types: [{
          description: 'ReportForge JSON',
          accept: { 'application/json': ['.json'] },
        }],
      });

      if (!fileHandle) return;
      const file = await fileHandle.getFile();
      await _loadFileIntoEditor(file, fileHandle);
    } catch (error) {
      if (error && error.name !== 'AbortError') {
        alert(`Error al cargar: ${error.message}`);
      }
    } finally {
      _resetOpenLayoutPicker(null);
    }
  }

  function _slugifyName(name) {
    return String(name || 'reporte')
      .replace(/\.json$/i, '')
      .replace(/[^a-zA-Z0-9-_ ]/g, '')
      .trim()
      .replace(/\s+/g, '_') || 'reporte';
  }

  function _liveMargins() {
    const margins = _currentLayout.margins && typeof _currentLayout.margins === 'object'
      ? { ..._currentLayout.margins }
      : {};
    if (Number.isFinite(DS.pageMarginLeft)) margins.left = DS.pageMarginLeft;
    if (Number.isFinite(DS.pageMarginTop)) margins.top = DS.pageMarginTop;
    return Object.keys(margins).length ? margins : null;
  }

  function _liveLayoutMeta() {
    return {
      name: _currentLayout.name || 'Reporte',
      version: _currentLayout.version || '1.0',
      pageWidth: Number.isFinite(CFG.PAGE_W) ? CFG.PAGE_W : _currentLayout.pageWidth,
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

  async function save() {
    if (_currentLayoutFileHandle && typeof _currentLayoutFileHandle.createWritable === 'function') {
      try {
        const allowed = await _ensureWritablePermission(_currentLayoutFileHandle);
        if (!allowed) {
          setStatus('Guardado cancelado');
          return false;
        }

        await _writeTextToFileHandle(_currentLayoutFileHandle, toJSON());
        setStatus(`✓ Guardado: ${_currentLayoutFileHandle.name || _currentLayout.name || 'reporte'}`);
        return true;
      } catch (error) {
        alert(`No se pudo guardar el archivo abierto: ${error.message}`);
        return false;
      }
    }

    const name = prompt('Nombre del reporte:', _currentLayout.name || 'Factura Electrónica') || 'reporte';
    const safe = _slugifyName(name);
    const key = `rfd_${safe}`;
    try {
      localStorage.setItem(key, toJSON());
      setStatus(`✓ Guardado: ${safe}`);
      return true;
    } catch (error) {
      alert('No se pudo guardar en localStorage. Descarga el JSON en su lugar.');
      exportJSON();
      return false;
    }
  }

  function load() {
    if (_isOpenLayoutPickerBlocked()) return false;

    if (typeof window.showOpenFilePicker === 'function') {
      _openLayoutPickerActive = true;
      _loadWithFileSystemPicker();
      return true;
    }

    document.getElementById('rf-open-layout-file')?.remove();
    const input = document.createElement('input');
    input.id = 'rf-open-layout-file';
    input.type = 'file';
    input.accept = '.json,application/json';
    input.style.display = 'none';

    _openLayoutPickerActive = true;
    _openLayoutPickerInput = input;

    const releaseOnFocus = () => _releaseOpenLayoutPickerOnFocus(input);
    window.addEventListener('focus', releaseOnFocus, { once: true });

    input.addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      try {
        await _loadFileIntoEditor(file, null);
      } catch (error) {
        alert(`Error al cargar: ${error.message}`);
      } finally {
        window.removeEventListener('focus', releaseOnFocus);
        _resetOpenLayoutPicker(input);
      }
    }, { once: true });

    document.body.appendChild(input);
    input.value = '';

    try {
      input.click();
    } catch (error) {
      window.removeEventListener('focus', releaseOnFocus);
      _resetOpenLayoutPicker(input);
      throw error;
    }

    return true;
  }

  function exportJSON() {
    const blob = new Blob([toJSON()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${_slugifyName(_currentLayout.name || 'reporte')}.rfd.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    setStatus('✓ JSON exportado');
  }

  async function exportPDF() {
    const layout = JSON.parse(toJSON());
    const data = DS._sampleData || SAMPLE_DATA || {};
    const response = await fetch('/render', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ layout, data, format: 'pdf' }),
    });
    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || `HTTP ${response.status}`);
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${_slugifyName(layout.name || _currentLayout.name || 'reporte')}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus('✓ PDF exportado');
  }

  function importJSON(file) {
    _readFileAsText(file)
      .then((text) => {
        const parsed = JSON.parse(text);
        const layout = _normalizeLayout(parsed);
        _applyLoadedLayout(layout, file, null, '✓ Diseño importado');
      })
      .catch((err) => {
        alert(`Error: ${err.message}`);
      });
  }

  global.CommandRuntimeFile = { toJSON, save, load, exportJSON, exportPDF, importJSON };
})(window);
