'use strict';

(function initDocumentStore(global) {
  let elementCounter = 100;

  function newId() {
    return `e${++elementCounter}`;
  }

  function mkEl(type, sectionId, x, y, w, h, extra = {}) {
    return {
      id: newId(), type, sectionId, x, y, w, h,
      fontFamily: 'Arial', fontSize: 8, bold: false, italic: false, underline: false,
      align: 'left', color: '#000000', bgColor: 'transparent',
      borderColor: 'transparent', borderWidth: 0, borderStyle: 'solid',
      content: '', fieldPath: '', fieldFmt: null,
      lineDir: 'h', lineWidth: 1, zIndex: 0,
      ...extra
    };
  }

  const state = {
    sections: [
      { id: 's-rh', stype: 'rh',  label: 'Encabezado del informe', abbr: 'EI', height: 110, visible: true },
      { id: 's-ph', stype: 'ph',  label: 'Encabezado de página',   abbr: 'EP', height: 80,  visible: true },
      { id: 's-d1', stype: 'det', label: 'Detalle a',              abbr: 'D',  height: 14, iterates: 'items', visible: true },
      { id: 's-pf', stype: 'pf',  label: 'Pie de página',          abbr: 'PP', height: 120, visible: true },
      { id: 's-rf', stype: 'rf',  label: 'Resumen del informe',    abbr: 'RI', height: 30, visible: true },
    ],
    elements: [
      mkEl('field', 's-rh', 4, 4, 380, 16, { fieldPath: 'empresa.razon_social', fontSize: 11, bold: true, content: 'empresa.razon_social' }),
      mkEl('field', 's-rh', 4, 22, 220, 12, { fieldPath: 'empresa.ruc', fieldFmt: 'ruc_mask', fontSize: 8, content: 'empresa.ruc' }),
      mkEl('field', 's-rh', 4, 35, 380, 12, { fieldPath: 'empresa.direccion_matriz', fontSize: 8, content: 'empresa.direccion_matriz' }),
      mkEl('field', 's-rh', 4, 48, 340, 10, { fieldPath: 'empresa.obligado_contabilidad', fontSize: 7, content: 'empresa.obligado_contabilidad', bold: true }),
      mkEl('rect', 's-rh', 530, 4, 220, 96, { bgColor: 'transparent', borderColor: '#C0511A', borderWidth: 2, content: '' }),
      mkEl('text', 's-rh', 535, 8, 210, 16, { content: 'FACTURA', fontSize: 12, bold: true, align: 'center', color: '#C0511A' }),
      mkEl('field', 's-rh', 535, 28, 210, 14, { fieldPath: 'fiscal.numero_documento', fontSize: 10, bold: true, align: 'center', content: 'fiscal.numero_documento' }),
      mkEl('field', 's-rh', 535, 45, 210, 11, { fieldPath: 'fiscal.ambiente', fontSize: 8, align: 'center', color: '#856404', content: 'fiscal.ambiente' }),
      mkEl('field', 's-rh', 535, 58, 210, 11, { fieldPath: 'fiscal.tipo_emision', fontSize: 8, align: 'center', content: 'fiscal.tipo_emision' }),
      mkEl('field', 's-rh', 535, 72, 210, 10, { fieldPath: 'fiscal.fecha_autorizacion', fieldFmt: 'datetime', fontSize: 7, align: 'center', content: 'fiscal.fecha_autorizacion' }),
      mkEl('text', 's-ph', 4, 4, 60, 12, { content: 'Cliente:', fontSize: 8, bold: true }),
      mkEl('field', 's-ph', 68, 4, 380, 12, { fieldPath: 'cliente.razon_social', fontSize: 8, content: 'cliente.razon_social' }),
      mkEl('text', 's-ph', 4, 18, 60, 12, { content: 'RUC/CI:', fontSize: 8, bold: true }),
      mkEl('field', 's-ph', 68, 18, 160, 12, { fieldPath: 'cliente.identificacion', fontSize: 8, content: 'cliente.identificacion' }),
      mkEl('text', 's-ph', 4, 32, 60, 12, { content: 'Dirección:', fontSize: 8, bold: true }),
      mkEl('field', 's-ph', 68, 32, 380, 12, { fieldPath: 'cliente.direccion', fontSize: 8, content: 'cliente.direccion' }),
      mkEl('text', 's-ph', 4, 46, 60, 12, { content: 'Email:', fontSize: 8, bold: true }),
      mkEl('field', 's-ph', 68, 46, 200, 12, { fieldPath: 'cliente.email', fontSize: 8, content: 'cliente.email' }),
      mkEl('rect', 's-ph', 4, 62, 746, 16, { bgColor: '#C0511A', borderColor: '#A03010', borderWidth: 1 }),
      mkEl('text', 's-ph', 6, 63, 50, 14, { content: 'CÓDIGO', fontSize: 7, bold: true, color: '#FFF', bgColor: 'transparent', borderColor: 'transparent' }),
      mkEl('text', 's-ph', 60, 63, 340, 14, { content: 'DESCRIPCIÓN', fontSize: 7, bold: true, color: '#FFF', bgColor: 'transparent', borderColor: 'transparent' }),
      mkEl('text', 's-ph', 404, 63, 44, 14, { content: 'CANT.', fontSize: 7, bold: true, color: '#FFF', align: 'right', bgColor: 'transparent', borderColor: 'transparent' }),
      mkEl('text', 's-ph', 452, 63, 70, 14, { content: 'P.UNITARIO', fontSize: 7, bold: true, color: '#FFF', align: 'right', bgColor: 'transparent', borderColor: 'transparent' }),
      mkEl('text', 's-ph', 526, 63, 50, 14, { content: 'DESCUENTO', fontSize: 7, bold: true, color: '#FFF', align: 'right', bgColor: 'transparent', borderColor: 'transparent' }),
      mkEl('text', 's-ph', 580, 63, 70, 14, { content: 'SUBTOTAL', fontSize: 7, bold: true, color: '#FFF', align: 'right', bgColor: 'transparent', borderColor: 'transparent' }),
      mkEl('field', 's-d1', 4, 0, 52, 14, { fieldPath: 'item.codigo', fontSize: 7, content: 'item.codigo' }),
      mkEl('field', 's-d1', 60, 0, 340, 14, { fieldPath: 'item.descripcion', fontSize: 7, content: 'item.descripcion' }),
      mkEl('field', 's-d1', 404, 0, 44, 14, { fieldPath: 'item.cantidad', fieldFmt: 'float2', fontSize: 7, align: 'right', content: 'item.cantidad' }),
      mkEl('field', 's-d1', 452, 0, 70, 14, { fieldPath: 'item.precio_unitario', fieldFmt: 'currency', fontSize: 7, align: 'right', content: 'item.precio_unitario' }),
      mkEl('field', 's-d1', 526, 0, 50, 14, { fieldPath: 'item.descuento', fieldFmt: 'currency', fontSize: 7, align: 'right', content: 'item.descuento' }),
      mkEl('field', 's-d1', 580, 0, 70, 14, { fieldPath: 'item.subtotal', fieldFmt: 'currency', fontSize: 7, align: 'right', bold: true, content: 'item.subtotal' }),
      mkEl('text', 's-pf', 440, 5, 130, 12, { content: 'SUBTOTAL IVA 12%:', fontSize: 7, bold: true, align: 'right' }),
      mkEl('field', 's-pf', 574, 5, 70, 12, { fieldPath: 'totales.subtotal_12', fieldFmt: 'currency', fontSize: 7, align: 'right', bold: true, content: 'totales.subtotal_12' }),
      mkEl('text', 's-pf', 440, 19, 130, 12, { content: 'SUBTOTAL IVA 0%:', fontSize: 7, bold: true, align: 'right' }),
      mkEl('field', 's-pf', 574, 19, 70, 12, { fieldPath: 'totales.subtotal_0', fieldFmt: 'currency', fontSize: 7, align: 'right', content: 'totales.subtotal_0' }),
      mkEl('text', 's-pf', 440, 33, 130, 12, { content: 'SUBTOTAL:', fontSize: 7, bold: true, align: 'right' }),
      mkEl('field', 's-pf', 574, 33, 70, 12, { fieldPath: 'totales.subtotal_sin_impuestos', fieldFmt: 'currency', fontSize: 7, align: 'right', content: 'totales.subtotal_sin_impuestos' }),
      mkEl('line', 's-pf', 440, 47, 204, 2, { borderColor: '#C0511A', borderWidth: 1 }),
      mkEl('text', 's-pf', 440, 51, 130, 14, { content: 'IVA 12%:', fontSize: 8, bold: true, align: 'right' }),
      mkEl('field', 's-pf', 574, 51, 70, 14, { fieldPath: 'totales.iva_12', fieldFmt: 'currency', fontSize: 8, align: 'right', content: 'totales.iva_12' }),
      mkEl('line', 's-pf', 440, 67, 204, 2, { borderColor: '#333', borderWidth: 1 }),
      mkEl('text', 's-pf', 440, 71, 130, 16, { content: 'VALOR TOTAL:', fontSize: 10, bold: true, align: 'right', color: '#C0511A' }),
      mkEl('field', 's-pf', 574, 71, 70, 16, { fieldPath: 'totales.importe_total', fieldFmt: 'currency', fontSize: 10, align: 'right', bold: true, color: '#C0511A', content: 'totales.importe_total' }),
      mkEl('line', 's-rf', 4, 4, 746, 1, { borderColor: '#CCC', borderWidth: 1 }),
      mkEl('text', 's-rf', 4, 8, 400, 12, { content: 'Documento generado electrónicamente - ReportForge Linux', fontSize: 7, color: '#666' }),
      mkEl('field', 's-rf', 500, 8, 100, 12, { fieldPath: 'meta.doc_num', fontSize: 7, color: '#666', align: 'right', content: 'meta.doc_num' }),
    ],
    selection: new Set(),
    tool: 'pointer',
    zoom: 1.0,
    zoomDesign: 1.0,
    zoomPreview: 1.0,
    gridVisible: true,
    snapToGrid: true,
    previewMode: false,
    pageMarginLeft: 0,
    pageMarginTop: 0,
    previewZoom: 1.0,
    clipboard: [],
    history: [],
    historyIndex: -1,
    _subs: [],
  };

  const invariants = Object.freeze({
    assertSelectionState(selection) {
      if (!(selection instanceof Set)) throw new Error('INVALID SELECTION STATE');
      return selection;
    },
    assertZoom(zoom) {
      if (typeof zoom !== 'number' || !Number.isFinite(zoom)) throw new Error('INVALID ZOOM CONTRACT');
      return zoom;
    },
    assertLayoutPatch(patch) {
      for (const key of ['x', 'y', 'w', 'h']) {
        if (Object.prototype.hasOwnProperty.call(patch, key) && (typeof patch[key] !== 'number' || !Number.isFinite(patch[key]))) {
          throw new Error('INVALID LAYOUT CONTRACT');
        }
      }
      return patch;
    },
  });

  const selectors = Object.freeze({
    getSection(id) { return state.sections.find((section) => section.id === id); },
    getSectionTop(id) {
      let top = 0;
      for (const section of state.sections) {
        if (section.id === id) return top;
        top += section.height;
      }
      return 0;
    },
    getSectionAtY(y) {
      let top = 0;
      for (const section of state.sections) {
        if (y >= top && y < top + section.height) return { section, relY: y - top };
        top += section.height;
      }
      return null;
    },
    getTotalHeight() { return state.sections.reduce((sum, section) => sum + section.height, 0); },
    isSelected(id) { return state.selection.has(id); },
    getSelectedElements() { return state.elements.filter((element) => selectors.isSelected(element.id)); },
    getElementById(id) { return state.elements.find((element) => element.id === id); },
    snap(value) {
      const grid = typeof global.CFG === 'object' && Number.isFinite(global.CFG.GRID) ? global.CFG.GRID : 4;
      return state.snapToGrid ? Math.round(value / grid) * grid : value;
    },
  });

  function syncViewsAfterHistoryChange() {
    if (typeof SectionEngine !== 'undefined' && typeof SectionEngine.render === 'function') {
      SectionEngine.render();
    }
    if (typeof _canonicalCanvasWriter === 'function') {
      _canonicalCanvasWriter().renderAll();
    } else if (typeof CanvasLayoutEngine !== 'undefined' && typeof CanvasLayoutEngine.renderAll === 'function') {
      CanvasLayoutEngine.renderAll();
    }
    if (state.previewMode && typeof _canonicalPreviewWriter === 'function') {
      _canonicalPreviewWriter().refresh();
    } else if (state.previewMode && typeof PreviewEngineV19 !== 'undefined' && typeof PreviewEngineV19.refresh === 'function') {
      PreviewEngineV19.refresh();
    }
    if (typeof SelectionEngine !== 'undefined' && typeof SelectionEngine.renderHandles === 'function') {
      SelectionEngine.renderHandles();
    }
    if (typeof PropertiesEngine !== 'undefined' && typeof PropertiesEngine.render === 'function') {
      PropertiesEngine.render();
    }
    if (typeof FormatEngine !== 'undefined' && typeof FormatEngine.updateToolbar === 'function') {
      FormatEngine.updateToolbar();
    }
  }

  const actions = {
    subscribe(fn) { state._subs.push(fn); },
    notify() { state._subs.forEach((fn) => fn(api)); },
    saveHistory() {
      const snapshot = JSON.stringify({
        sections: state.sections.map((section) => ({ ...section })),
        elements: state.elements.map((element) => ({ ...element })),
      });
      state.history = state.history.slice(0, state.historyIndex + 1);
      state.history.push(snapshot);
      if (state.history.length > 80) state.history.shift();
      state.historyIndex = state.history.length - 1;
      actions._updateUndoRedo();
    },
    undo() {
      if (state.historyIndex <= 0) return;
      state.historyIndex -= 1;
      const snapshot = JSON.parse(state.history[state.historyIndex]);
      state.sections = snapshot.sections;
      state.elements = snapshot.elements;
      state.selection.clear();
      actions.notify();
      syncViewsAfterHistoryChange();
    },
    redo() {
      if (state.historyIndex >= state.history.length - 1) return;
      state.historyIndex += 1;
      const snapshot = JSON.parse(state.history[state.historyIndex]);
      state.sections = snapshot.sections;
      state.elements = snapshot.elements;
      state.selection.clear();
      actions.notify();
      syncViewsAfterHistoryChange();
    },
    _updateUndoRedo() {
      const undoButton = global.document && global.document.getElementById('btn-undo');
      const redoButton = global.document && global.document.getElementById('btn-redo');
      if (undoButton) undoButton.classList.toggle('disabled', state.historyIndex <= 0);
      if (redoButton) redoButton.classList.toggle('disabled', state.historyIndex >= state.history.length - 1);
    },
    clearSelectionState() {
      invariants.assertSelectionState(state.selection);
      state.selection.clear();
      return state.selection;
    },
    replaceSelection(ids) {
      const nextIds = ids instanceof Set ? [...ids] : Array.from(ids || []);
      state.selection.clear();
      nextIds.forEach((id) => state.selection.add(id));
      return state.selection;
    },
    selectOnly(id) {
      state.selection.clear();
      if (id != null) state.selection.add(id);
      return state.selection;
    },
    addSelection(id) {
      if (id != null) state.selection.add(id);
      return state.selection;
    },
    removeSelection(id) {
      state.selection.delete(id);
      return state.selection;
    },
    toggleSelection(id) {
      if (state.selection.has(id)) {
        state.selection.delete(id);
        return false;
      }
      state.selection.add(id);
      return true;
    },
    setZoom(zoom) {
      state.zoom = invariants.assertZoom(zoom);
      return state.zoom;
    },
    updateElementLayout(id, patch = {}) {
      invariants.assertLayoutPatch(patch);
      const element = selectors.getElementById(id);
      if (!element) return null;
      if (Object.prototype.hasOwnProperty.call(patch, 'sectionId')) element.sectionId = patch.sectionId;
      if (Object.prototype.hasOwnProperty.call(patch, 'x')) element.x = patch.x;
      if (Object.prototype.hasOwnProperty.call(patch, 'y')) element.y = patch.y;
      if (Object.prototype.hasOwnProperty.call(patch, 'w')) element.w = patch.w;
      if (Object.prototype.hasOwnProperty.call(patch, 'h')) element.h = patch.h;
      return element;
    },
  };

  const api = {
    state,
    actions: Object.freeze(actions),
    selectors,
    invariants,
    subscribe: (...args) => actions.subscribe(...args),
    notify: (...args) => actions.notify(...args),
    saveHistory: (...args) => actions.saveHistory(...args),
    undo: (...args) => actions.undo(...args),
    redo: (...args) => actions.redo(...args),
    _updateUndoRedo: (...args) => actions._updateUndoRedo(...args),
    getSection: (...args) => selectors.getSection(...args),
    getSectionTop: (...args) => selectors.getSectionTop(...args),
    getSectionAtY: (...args) => selectors.getSectionAtY(...args),
    getTotalHeight: (...args) => selectors.getTotalHeight(...args),
    isSelected: (...args) => selectors.isSelected(...args),
    clearSelectionState: (...args) => actions.clearSelectionState(...args),
    replaceSelection: (...args) => actions.replaceSelection(...args),
    selectOnly: (...args) => actions.selectOnly(...args),
    addSelection: (...args) => actions.addSelection(...args),
    removeSelection: (...args) => actions.removeSelection(...args),
    toggleSelection: (...args) => actions.toggleSelection(...args),
    getSelectedElements: (...args) => selectors.getSelectedElements(...args),
    getElementById: (...args) => selectors.getElementById(...args),
    setZoom: (...args) => actions.setZoom(...args),
    updateElementLayout: (...args) => actions.updateElementLayout(...args),
    snap: (...args) => selectors.snap(...args),
  };

  for (const key of [
    'sections', 'elements', 'selection', 'tool', 'zoom', 'zoomDesign', 'zoomPreview',
    'gridVisible', 'snapToGrid', 'previewMode', 'pageMarginLeft', 'pageMarginTop',
    'previewZoom', 'clipboard', 'history', 'historyIndex', '_subs'
  ]) {
    Object.defineProperty(api, key, {
      enumerable: true,
      configurable: false,
      get() {
        return state[key];
      },
      set(value) {
        state[key] = value;
      },
    });
  }

  Object.freeze(api.actions);
  Object.freeze(api.selectors);
  Object.freeze(api.invariants);

  global.newId = newId;
  global.mkEl = mkEl;
  global.DS = api;
  actions.saveHistory();
})(window);
