'use strict';

(function initCommandRuntimeFile(global) {
  const { renderSectionsAndSelection, setStatus } = global.CommandRuntimeShared;

  function toJSON() {
    return JSON.stringify({
      name: 'Factura Electrónica', version: '1.0',
      pageWidth: CFG.PAGE_W,
      sections: DS.sections.map((s) => ({ ...s })),
      elements: DS.elements.map((e) => ({ ...e })),
      savedAt: new Date().toISOString(),
    }, null, 2);
  }

  function save() {
    const name = prompt('Nombre del reporte:', 'Factura Electrónica') || 'reporte';
    const safe = name.replace(/[^a-zA-Z0-9-_ ]/g, '').trim() || 'reporte';
    const key = `rfd_${safe}`;
    try {
      localStorage.setItem(key, toJSON());
      setStatus(`✓ Guardado: ${safe}`);
    } catch (error) {
      alert('No se pudo guardar en localStorage. Descarga el JSON en su lugar.');
      exportJSON();
    }
  }

  function load() {
    const keys = Object.keys(localStorage).filter((k) => k.startsWith('rfd_'));
    if (!keys.length) { alert('No hay reportes guardados.'); return; }
    const choice = prompt(`Reportes guardados:\n${keys.map((k) => k.replace('rfd_', '')).join('\n')}\n\nEscribe el nombre:`);
    if (!choice) return;
    const data = localStorage.getItem(`rfd_${choice}`) || localStorage.getItem(choice);
    if (!data) { alert('No encontrado.'); return; }
    try {
      const parsed = JSON.parse(data);
      DS.sections = parsed.sections;
      DS.elements = parsed.elements;
      DS.clearSelectionState();
      SectionEngine.render();
      SelectionEngine.clearSelection();
      setStatus(`✓ Abierto: ${choice}`);
    } catch (error) {
      alert(`Error al cargar: ${error.message}`);
    }
  }

  function exportJSON() {
    const blob = new Blob([toJSON()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'factura.rfd.json';
    a.click();
    URL.revokeObjectURL(a.href);
    setStatus('✓ JSON exportado');
  }

  function importJSON(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        DS.sections = data.sections;
        DS.elements = data.elements;
        DS.clearSelectionState();
        SectionEngine.render();
        SelectionEngine.clearSelection();
        setStatus('✓ Diseño importado');
      } catch (err) {
        alert(`Error: ${err.message}`);
      }
    };
    reader.readAsText(file);
  }

  global.CommandRuntimeFile = { toJSON, save, load, exportJSON, importJSON };
})(window);
