'use strict';

(function initCommandRuntimeSelection(global) {
  const { setStatus, syncSelectionPanels, renderSelectionHandles } = global.CommandRuntimeShared;

  function updateSelectedLayouts(partial) {
    DS.getSelectedElements().forEach((el) => {
      DS.updateElementLayout(el.id, partial(el));
      _canonicalCanvasWriter().updateElementPosition(el.id);
    });
  }

  function copy() {
    const sel = DS.getSelectedElements();
    if (!sel.length) return;
    DS.clipboard = sel.map((el) => JSON.stringify(el));
    setStatus(`${sel.length} elemento(s) copiado(s)`);
  }

  function cut() {
    copy();
    removeSelection();
  }

  function paste() {
    if (!DS.clipboard.length) return;
    DS.clearSelectionState();
    DS.clipboard.forEach((json) => {
      const el = JSON.parse(json);
      el.id = newId();
      el.x = DS.snap(el.x + 8);
      el.y = DS.snap(el.y + 8);
      DS.elements.push(el);
      _canonicalCanvasWriter().renderElement(el);
      DS.addSelection(el.id);
    });
    syncSelectionPanels();
    DS.saveHistory();
  }

  function removeSelection() {
    const sel = [...DS.selection];
    if (!sel.length) return;
    sel.forEach((id) => {
      DS.elements = DS.elements.filter((e) => e.id !== id);
      const div = document.querySelector(`.cr-element[data-id="${id}"]`);
      if (div) div.remove();
    });
    DS.clearSelectionState();
    syncSelectionPanels();
    DS.saveHistory();
  }

  function selectAll() {
    DS.clearSelectionState();
    DS.elements.forEach((e) => DS.addSelection(e.id));
    syncSelectionPanels();
  }

  function alignLefts() {
    const sel = DS.getSelectedElements();
    if (sel.length < 2) return;
    const minX = Math.min(...sel.map((e) => e.x));
    updateSelectedLayouts(() => ({ x: minX }));
    syncSelectionPanels();
    DS.saveHistory();
  }

  function alignCenters() {
    const sel = DS.getSelectedElements();
    if (sel.length < 2) return;
    const c = sel.reduce((a, e) => a + (e.x + e.w / 2), 0) / sel.length;
    updateSelectedLayouts((e) => ({ x: DS.snap(c - e.w / 2) }));
    syncSelectionPanels();
    DS.saveHistory();
  }

  function alignRights() {
    const sel = DS.getSelectedElements();
    if (sel.length < 2) return;
    const maxR = Math.max(...sel.map((e) => e.x + e.w));
    updateSelectedLayouts((e) => ({ x: maxR - e.w }));
    syncSelectionPanels();
    DS.saveHistory();
  }

  function alignTops() {
    const sel = DS.getSelectedElements();
    if (sel.length < 2) return;
    const minY = Math.min(...sel.map((e) => e.y));
    updateSelectedLayouts(() => ({ y: minY }));
    syncSelectionPanels();
    DS.saveHistory();
  }

  function alignBottoms() {
    const sel = DS.getSelectedElements();
    if (sel.length < 2) return;
    const maxB = Math.max(...sel.map((e) => e.y + e.h));
    updateSelectedLayouts((e) => ({ y: maxB - e.h }));
    syncSelectionPanels();
    DS.saveHistory();
  }

  function sameWidth() {
    const sel = DS.getSelectedElements();
    if (sel.length < 2) return;
    const ref = sel[0];
    sel.slice(1).forEach((e) => { DS.updateElementLayout(e.id, { w: ref.w }); _canonicalCanvasWriter().updateElementPosition(e.id); });
    syncSelectionPanels();
    DS.saveHistory();
  }

  function sameHeight() {
    const sel = DS.getSelectedElements();
    if (sel.length < 2) return;
    const ref = sel[0];
    sel.slice(1).forEach((e) => { DS.updateElementLayout(e.id, { h: ref.h }); _canonicalCanvasWriter().updateElementPosition(e.id); });
    syncSelectionPanels();
    DS.saveHistory();
  }

  function bringFront() {
    const sel = DS.getSelectedElements();
    if (!sel.length) return;
    const maxZ = Math.max(0, ...DS.elements.map((e) => e.zIndex || 0));
    sel.forEach((e) => { e.zIndex = maxZ + 1; _canonicalCanvasWriter().updateElement(e.id); });
    DS.saveHistory();
  }

  function sendBack() {
    const sel = DS.getSelectedElements();
    if (!sel.length) return;
    const minZ = Math.min(0, ...DS.elements.map((e) => e.zIndex || 0));
    sel.forEach((e) => { e.zIndex = minZ - 1; _canonicalCanvasWriter().updateElement(e.id); });
    DS.saveHistory();
  }

  function bringForward() {
    const sel = DS.getSelectedElements();
    if (!sel.length) return;
    sel.forEach((e) => { e.zIndex = (e.zIndex || 0) + 1; _canonicalCanvasWriter().updateElement(e.id); });
    DS.saveHistory();
    setStatus('Traer adelante');
  }

  function sendBackward() {
    const sel = DS.getSelectedElements();
    if (!sel.length) return;
    sel.forEach((e) => { e.zIndex = (e.zIndex || 0) - 1; _canonicalCanvasWriter().updateElement(e.id); });
    DS.saveHistory();
    setStatus('Enviar atrás');
  }

  function group() {
    const sel = DS.getSelectedElements();
    if (sel.length < 2) return;
    const gid = `grp-${Date.now()}`;
    sel.forEach((e) => { e.groupId = gid; });
    DS.saveHistory();
    setStatus(`Agrupado (${sel.length} objetos)`);
  }

  function ungroup() {
    const sel = DS.getSelectedElements();
    if (!sel.length) return;
    sel.forEach((e) => { delete e.groupId; });
    DS.saveHistory();
    setStatus('Desagrupado');
  }

  function invertSelection() {
    const allIds = new Set(DS.elements.map((e) => e.id));
    const curSel = new Set(DS.selection);
    DS.clearSelectionState();
    allIds.forEach((id) => { if (!curSel.has(id)) DS.addSelection(id); });
    renderSelectionHandles();
    setStatus('Selección invertida');
  }

  global.CommandRuntimeSelection = {
    copy,
    cut,
    paste,
    delete: removeSelection,
    selectAll,
    alignLefts,
    alignCenters,
    alignRights,
    alignTops,
    alignBottoms,
    sameWidth,
    sameHeight,
    bringFront,
    sendBack,
    bringForward,
    sendBackward,
    group,
    ungroup,
    invertSelection,
  };
})(window);
