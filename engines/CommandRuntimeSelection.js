'use strict';

(function initCommandRuntimeSelection(global) {
  const { setStatus, syncSelectionPanels, renderSelectionHandles } = global.CommandRuntimeShared;

  function updateSelectedLayouts(partial) {
    DS.getSelectedElements().forEach((el) => {
      DS.updateElementLayout(el.id, partial(el), 'CommandRuntimeSelection.updateLayout');
      _canonicalCanvasWriter().updateElementPosition(el.id);
    });
  }

  // Section-reference helpers for single-element alignment.
  // Width: CFG.PAGE_W is the content column width used by the canvas for all layouts.
  // Height: DS.sections carries the model height for each section band.
  function _sectionContentW() {
    return (typeof CFG !== 'undefined' && Number.isFinite(CFG.PAGE_W)) ? CFG.PAGE_W : 750;
  }
  function _sectionH(sectionId) {
    const sec = DS.sections && DS.sections.find(function(s) { return s.id === sectionId; });
    return (sec && Number.isFinite(sec.height)) ? sec.height : 0;
  }

  // copy/cut/paste delegate to ClipboardEngine whenever it is loaded (always
  // true in production — designer-v4.html). This unifies the menu/toolbar
  // path with the Ctrl+C/X/V path onto one shared clipboard storage (P23A/B
  // — they previously used two separate, non-syncing stores: DS.clipboard
  // here vs ClipboardEngine's own storage, so copying via one path and
  // pasting via the other silently failed).
  //
  // The DS.clipboard-based logic below is kept ONLY as a fallback for a
  // context where ClipboardEngine isn't loaded (mirrors the same
  // typeof-guard fallback idiom ClipboardEngine itself uses for
  // ClipboardState) — it must keep working standalone, but is no longer the
  // path production actually takes.

  function copy() {
    if (typeof ClipboardEngine !== 'undefined') { ClipboardEngine.copy(); return; }
    const sel = DS.getSelectedElements();
    if (!sel.length) return;
    DS.clipboard = sel.map((el) => JSON.stringify(el));
    setStatus(`${sel.length} elemento(s) copiado(s)`);
  }

  function cut() {
    if (typeof ClipboardEngine !== 'undefined') { ClipboardEngine.cut(); return; }
    copy();
    removeSelection();
  }

  function paste() {
    if (typeof ClipboardEngine !== 'undefined') { ClipboardEngine.paste(); return; }
    if (!DS.clipboard.length) return;
    DS.clearSelectionState('CommandRuntimeSelection.paste');
    const newEls = DS.clipboard.map((json) => {
      const el = JSON.parse(json);
      el.id = newId();
      el.x = DS.snap(el.x + 8);
      el.y = DS.snap(el.y + 8);
      return el;
    });
    DS.setElements([...DS.elements, ...newEls], 'CommandRuntimeSelection.paste');
    newEls.forEach((el) => {
      _canonicalCanvasWriter().renderElement(el);
      DS.addSelection(el.id, 'CommandRuntimeSelection.paste');
    });
    syncSelectionPanels();
    DS.saveHistory();
  }

  function removeSelection() {
    const sel = [...DS.selection];
    if (!sel.length) return;
    sel.forEach((id) => {
      DS.setElements(DS.elements.filter((e) => e.id !== id), 'CommandRuntimeSelection.removeSelection');
    });
    // DOM cleanup goes through the canonical canvas writer's own full-resync
    // (P25B — this used to query the DOM directly via document.querySelector
    // (...).remove(), bypassing _canonicalCanvasWriter() entirely).
    _canonicalCanvasWriter().renderAll();
    DS.clearSelectionState('CommandRuntimeSelection.removeSelection');
    syncSelectionPanels();
    DS.saveHistory();
  }

  function selectAll() {
    DS.clearSelectionState('CommandRuntimeSelection.selectAll');
    DS.elements.forEach((e) => DS.addSelection(e.id, 'CommandRuntimeSelection.selectAll'));
    syncSelectionPanels();
  }

  function alignLefts() {
    const sel = DS.getSelectedElements();
    if (sel.length === 0) return;
    if (sel.length === 1) {
      DS.updateElementLayout(sel[0].id, { x: 0 }, 'CommandRuntimeSelection.alignLefts');
      _canonicalCanvasWriter().updateElementPosition(sel[0].id);
    } else {
      const minX = Math.min(...sel.map((e) => e.x));
      updateSelectedLayouts(() => ({ x: minX }));
    }
    syncSelectionPanels();
    DS.saveHistory();
  }

  function alignCenters() {
    const sel = DS.getSelectedElements();
    if (sel.length === 0) return;
    if (sel.length === 1) {
      const e = sel[0];
      DS.updateElementLayout(e.id, { x: DS.snap((_sectionContentW() - e.w) / 2) }, 'CommandRuntimeSelection.alignCenters');
      _canonicalCanvasWriter().updateElementPosition(e.id);
    } else {
      const c = sel.reduce((a, e) => a + (e.x + e.w / 2), 0) / sel.length;
      updateSelectedLayouts((e) => ({ x: DS.snap(c - e.w / 2) }));
    }
    syncSelectionPanels();
    DS.saveHistory();
  }

  function alignRights() {
    const sel = DS.getSelectedElements();
    if (sel.length === 0) return;
    if (sel.length === 1) {
      const e = sel[0];
      DS.updateElementLayout(e.id, { x: DS.snap(_sectionContentW() - e.w) }, 'CommandRuntimeSelection.alignRights');
      _canonicalCanvasWriter().updateElementPosition(e.id);
    } else {
      const maxR = Math.max(...sel.map((e) => e.x + e.w));
      updateSelectedLayouts((e) => ({ x: maxR - e.w }));
    }
    syncSelectionPanels();
    DS.saveHistory();
  }

  function alignTops() {
    const sel = DS.getSelectedElements();
    if (sel.length === 0) return;
    if (sel.length === 1) {
      DS.updateElementLayout(sel[0].id, { y: 0 }, 'CommandRuntimeSelection.alignTops');
      _canonicalCanvasWriter().updateElementPosition(sel[0].id);
    } else {
      const minY = Math.min(...sel.map((e) => e.y));
      updateSelectedLayouts(() => ({ y: minY }));
    }
    syncSelectionPanels();
    DS.saveHistory();
  }

  function alignBottoms() {
    const sel = DS.getSelectedElements();
    if (sel.length === 0) return;
    if (sel.length === 1) {
      const e = sel[0];
      DS.updateElementLayout(e.id, { y: DS.snap(_sectionH(e.sectionId) - e.h) }, 'CommandRuntimeSelection.alignBottoms');
      _canonicalCanvasWriter().updateElementPosition(e.id);
    } else {
      const maxB = Math.max(...sel.map((e) => e.y + e.h));
      updateSelectedLayouts((e) => ({ y: maxB - e.h }));
    }
    syncSelectionPanels();
    DS.saveHistory();
  }

  function alignMiddles() {
    const sel = DS.getSelectedElements();
    if (sel.length === 0) return;
    if (sel.length === 1) {
      const e = sel[0];
      DS.updateElementLayout(e.id, { y: DS.snap((_sectionH(e.sectionId) - e.h) / 2) }, 'CommandRuntimeSelection.alignMiddles');
      _canonicalCanvasWriter().updateElementPosition(e.id);
    } else {
      const m = sel.reduce((a, e) => a + (e.y + e.h / 2), 0) / sel.length;
      updateSelectedLayouts((e) => ({ y: DS.snap(m - e.h / 2) }));
    }
    syncSelectionPanels();
    DS.saveHistory();
  }

  function sameWidth() {
    const sel = DS.getSelectedElements();
    if (sel.length < 2) { setStatus('Mismo ancho: seleccione 2 o más elementos'); return; }
    const ref = sel[0];
    sel.slice(1).forEach((e) => { DS.updateElementLayout(e.id, { w: ref.w }, 'CommandRuntimeSelection.sameWidth'); _canonicalCanvasWriter().updateElementPosition(e.id); });
    syncSelectionPanels();
    DS.saveHistory();
  }

  function sameHeight() {
    const sel = DS.getSelectedElements();
    if (sel.length < 2) { setStatus('Misma altura: seleccione 2 o más elementos'); return; }
    const ref = sel[0];
    sel.slice(1).forEach((e) => { DS.updateElementLayout(e.id, { h: ref.h }, 'CommandRuntimeSelection.sameHeight'); _canonicalCanvasWriter().updateElementPosition(e.id); });
    syncSelectionPanels();
    DS.saveHistory();
  }

  function sameSize() {
    const sel = DS.getSelectedElements();
    if (sel.length < 2) { setStatus('Mismo tamaño: seleccione 2 o más elementos'); return; }
    const ref = sel[0];
    sel.slice(1).forEach((e) => { DS.updateElementLayout(e.id, { w: ref.w, h: ref.h }, 'CommandRuntimeSelection.sameSize'); _canonicalCanvasWriter().updateElementPosition(e.id); });
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
    DS.clearSelectionState('CommandRuntimeSelection.invertSelection');
    allIds.forEach((id) => { if (!curSel.has(id)) DS.addSelection(id, 'CommandRuntimeSelection.invertSelection'); });
    // P26B — was renderSelectionHandles() only (handles, but no properties
    // panel / format toolbar refresh), unlike selectAll() which already used
    // the full syncSelectionPanels() chain for the same kind of selection
    // change.
    syncSelectionPanels();
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
    alignMiddles,
    sameWidth,
    sameHeight,
    sameSize,
    bringFront,
    sendBack,
    bringForward,
    sendBackward,
    group,
    ungroup,
    invertSelection,
  };
})(window);
