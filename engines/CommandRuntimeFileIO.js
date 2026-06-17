'use strict';

(function initCommandRuntimeFileIO(global) {
  const { setStatus } = global.CommandRuntimeShared;

  const OPEN_PICKER_REENTRY_MS = 900;
  let _openLayoutPickerActive = false;
  let _openLayoutPickerBlockedUntil = 0;
  let _openLayoutPickerInput = null;

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

  function _readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error || new Error('No se pudo leer el archivo'));
      reader.readAsText(file, 'utf-8');
    });
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
    const CRF = global.CommandRuntimeFile;
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
      const text = await _readFileAsText(file);
      const parsed = JSON.parse(text);
      const layout = CRF._normalizeLayout(parsed);
      CRF._applyLoadedLayout(layout, file, fileHandle, `✓ Abierto: ${file.name}`);
    } catch (error) {
      if (error && error.name !== 'AbortError') {
        alert(`Error al cargar: ${error.message}`);
      }
    } finally {
      _resetOpenLayoutPicker(null);
    }
  }

  async function save() {
    const CRF = global.CommandRuntimeFile;
    const handle = CRF._currentLayoutFileHandle;
    if (handle && typeof handle.createWritable === 'function') {
      try {
        const allowed = await _ensureWritablePermission(handle);
        if (!allowed) { setStatus('Guardado cancelado'); return false; }
        await _writeTextToFileHandle(handle, CRF.toJSON());
        setStatus(`✓ Guardado: ${handle.name || CRF._currentLayoutName() || 'reporte'}`);
        return true;
      } catch (error) {
        alert(`No se pudo guardar el archivo abierto: ${error.message}`);
        return false;
      }
    }

    const name = prompt('Nombre del reporte:', CRF._currentLayoutName() || 'Factura Electrónica') || 'reporte';
    const safe = CRF._slugifyName(name);
    const key = `rfd_${safe}`;
    try {
      localStorage.setItem(key, CRF.toJSON());
      setStatus(`✓ Guardado: ${safe}`);
      return true;
    } catch (error) {
      alert('No se pudo guardar en localStorage. Descarga el JSON en su lugar.');
      exportJSON();
      return false;
    }
  }

  function load() {
    const CRF = global.CommandRuntimeFile;
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
        const text = await _readFileAsText(file);
        const parsed = JSON.parse(text);
        const layout = CRF._normalizeLayout(parsed);
        CRF._applyLoadedLayout(layout, file, null, `✓ Abierto: ${file.name}`);
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
    const CRF = global.CommandRuntimeFile;
    const blob = new Blob([CRF.toJSON()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${CRF._slugifyName(CRF._currentLayoutName() || 'reporte')}.rfd.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    setStatus('✓ JSON exportado');
  }

  async function exportPDF() {
    const CRF = global.CommandRuntimeFile;
    const layout = JSON.parse(CRF.toJSON());
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
    a.download = `${CRF._slugifyName(layout.name || CRF._currentLayoutName() || 'reporte')}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus('✓ PDF exportado');
  }

  function importJSON(file) {
    const CRF = global.CommandRuntimeFile;
    _readFileAsText(file)
      .then((text) => {
        const parsed = JSON.parse(text);
        const layout = CRF._normalizeLayout(parsed);
        CRF._applyLoadedLayout(layout, file, null, '✓ Diseño importado');
      })
      .catch((err) => {
        alert(`Error: ${err.message}`);
      });
  }

  global.CommandRuntimeFileIO = { save, load, exportJSON, exportPDF, importJSON };
})(window);
