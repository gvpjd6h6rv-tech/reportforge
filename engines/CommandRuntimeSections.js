'use strict';

(function initCommandRuntimeSections(global) {
  const { setStatus } = global.CommandRuntimeShared;

  function insertSection() {
    const sel = DS.selection.size > 0 ? [...DS.selection][0] : null;
    const el = sel ? DS.getElementById(sel) : null;
    const afterId = el ? el.sectionId : DS.sections[DS.sections.length - 1]?.id;
    const afterIdx = DS.sections.findIndex((s) => s.id === afterId);
    const newId = `s-det-${Date.now()}`;
    const newSec = { id: newId, stype: 'det', label: 'Detalle', abbr: 'D', height: 20, visible: true };
    DS.sections.splice(afterIdx + 1, 0, newSec);
    DS.saveHistory();
    _canonicalCanvasWriter().renderAll();
    setStatus(`Sección insertada: ${newSec.label}`);
  }

  function deleteSection() {
    const sel = DS.selection.size > 0 ? [...DS.selection][0] : null;
    const el = sel ? DS.getElementById(sel) : null;
    const secId = el ? el.sectionId : DS.sections[DS.sections.length - 1]?.id;
    const sec = DS.sections.find((s) => s.id === secId);
    if (!sec || DS.sections.length <= 1) {
      setStatus('No se puede eliminar la última sección');
      return;
    }
    DS.elements = DS.elements.filter((e) => e.sectionId !== secId);
    DS.sections = DS.sections.filter((s) => s.id !== secId);
    DS.saveHistory();
    _canonicalCanvasWriter().renderAll();
    setStatus('Sección eliminada');
  }

  function moveSectionUp() {
    const secId = DS.sections[1]?.id;
    if (!secId) return;
    const idx = DS.sections.findIndex((s) => s.id === secId);
    if (idx > 0) [DS.sections[idx - 1], DS.sections[idx]] = [DS.sections[idx], DS.sections[idx - 1]];
    DS.saveHistory();
    _canonicalCanvasWriter().renderAll();
    setStatus('Sección movida arriba');
  }

  function moveSectionDown() {
    const idx = 1;
    if (idx < DS.sections.length - 1) [DS.sections[idx], DS.sections[idx + 1]] = [DS.sections[idx + 1], DS.sections[idx]];
    DS.saveHistory();
    _canonicalCanvasWriter().renderAll();
    setStatus('Sección movida abajo');
  }

  function renameSection() {
    const sec = DS.sections[0];
    if (!sec) return;
    const name = prompt('Nombre de sección:', sec.label || sec.stype || sec.id);
    if (name) {
      sec.label = name;
      sec.label = name;
      DS.saveHistory();
      _canonicalCanvasWriter().renderAll();
    }
  }

  function lockObject() {
    DS.getSelectedElements().forEach((e) => { e.locked = true; });
    DS.saveHistory();
    _canonicalCanvasWriter().renderAll();
    setStatus('Objeto(s) bloqueado(s)');
  }

  function unlockObject() {
    DS.getSelectedElements().forEach((e) => { delete e.locked; });
    DS.saveHistory();
    _canonicalCanvasWriter().renderAll();
    setStatus('Objeto(s) desbloqueado(s)');
  }

  function hideObject() {
    DS.getSelectedElements().forEach((e) => { e.hidden = true; _canonicalCanvasWriter().updateElement(e.id); });
    DS.saveHistory();
    setStatus('Objeto(s) oculto(s)');
  }

  function showObject() {
    DS.getSelectedElements().forEach((e) => { delete e.hidden; _canonicalCanvasWriter().updateElement(e.id); });
    DS.saveHistory();
    setStatus('Objeto(s) visible(s)');
  }

  function toggleSectionVisibility(sectionId) {
    const sec = DS.sections.find((s) => s.id === sectionId);
    if (!sec) return;
    sec.visible = !sec.visible;
    DS.saveHistory();
    _canonicalCanvasWriter().renderAll();
    setStatus(`Sección ${sec.label}: ${sec.visible ? 'visible' : 'oculta'}`);
  }

  global.CommandRuntimeSections = {
    insertSection,
    deleteSection,
    moveSectionUp,
    moveSectionDown,
    renameSection,
    lockObject,
    unlockObject,
    hideObject,
    showObject,
    toggleSectionVisibility,
  };
})(window);
