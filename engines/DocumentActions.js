'use strict';

const DAS = (() => {
  if (typeof DocumentActionsSelection !== 'undefined') {
    return DocumentActionsSelection;
  }
  if (typeof globalThis !== 'undefined' && globalThis.DocumentActionsSelection) {
    return globalThis.DocumentActionsSelection;
  }
  if (typeof require === 'function') {
    return require('./DocumentActionsSelection.js');
  }
  return null;
})();

const DocumentActions = (() => {
  function createDocumentActions(state, selectors, invariants, history, getApi) {
    if (!DAS || typeof DAS.createSelectionActions !== 'function') {
      throw new Error('DocumentActionsSelection module is required');
    }

    function _as(src, fn) {
      if (!src) throw new Error(`[DocumentActions.${fn}] source is required`);
      if (src === 'UNKNOWN') throw new Error(`[DocumentActions.${fn}] source "UNKNOWN" is forbidden`);
    }
    function _clone(value) {
      if (value instanceof Set) return [...value];
      if (Array.isArray(value)) return value.map((item) => _clone(item));
      if (value && typeof value === 'object') {
        try { return JSON.parse(JSON.stringify(value)); } catch (_) { return value; }
      }
      return value;
    }
    function _audit(action, detail) {
      if (typeof RF_AUDIT !== 'function') return;
      RF_AUDIT({ subsystem: 'document-state', owner: 'designer-runtime/document-state', action, ...detail });
    }
    function _getPhase() {
      return (typeof RenderSchedulerScope !== 'undefined' && typeof RenderSchedulerScope.currentWriteScope === 'function')
        ? (RenderSchedulerScope.currentWriteScope() ?? null) : null;
    }
    function _record(field, value, source) {
      const wl = typeof RuntimeWriteLog !== 'undefined' ? RuntimeWriteLog : null;
      wl?.recordWrite({ field, value, source, phase: _getPhase() });
    }

    const sa = DAS.createSelectionActions(state, selectors, invariants, _clone, _as, _audit, _record);

    const actions = {
      subscribe(fn) { state._subs.push(fn); },
      notify() { const api = typeof getApi === 'function' ? getApi() : null; state._subs.forEach((fn) => fn(api)); },
      saveHistory() { history.saveHistory(); },
      undo() { history.undo(); },
      redo() { history.redo(); },
      _updateUndoRedo() { history.updateUndoRedo(); },
      ...sa,
      setZoom(zoom, s) { _as(s, 'setZoom'); const before = state.zoom; state.zoom = invariants.assertZoom(zoom); _record('zoom', state.zoom, s); _audit('setZoom', { field: 'zoom', source: s, before, after: state.zoom, result: 'ok' }); return state.zoom; },
      setZoomDesign(zoom, s) { _as(s, 'setZoomDesign'); const before = state.zoomDesign; state.zoomDesign = invariants.assertZoom(zoom); _record('zoomDesign', state.zoomDesign, s); _audit('setZoomDesign', { field: 'zoomDesign', source: s, before, after: state.zoomDesign, result: 'ok' }); return state.zoomDesign; },
      setZoomPreview(zoom, s) { _as(s, 'setZoomPreview'); const before = state.zoomPreview; state.zoomPreview = invariants.assertZoom(zoom); _record('zoomPreview', state.zoomPreview, s); _audit('setZoomPreview', { field: 'zoomPreview', source: s, before, after: state.zoomPreview, result: 'ok' }); return state.zoomPreview; },
      setSections(sections, s) { _as(s, 'setSections'); const before = _clone(state.sections); state.sections = sections; _record('sections', state.sections, s); _audit('setSections', { field: 'sections', source: s, before, after: _clone(state.sections), result: 'ok' }); return state.sections; },
      setElements(elements, s) { _as(s, 'setElements'); const before = _clone(state.elements); state.elements = elements; _record('elements', state.elements, s); _audit('setElements', { field: 'elements', source: s, before, after: _clone(state.elements), result: 'ok' }); return state.elements; },
      setTool(tool, s) { _as(s, 'setTool'); const before = state.tool; state.tool = tool; _record('tool', state.tool, s); _audit('setTool', { field: 'tool', source: s, before, after: state.tool, result: 'ok' }); return state.tool; },
      setPreviewMode(enabled, s) { _as(s, 'setPreviewMode'); const before = state.previewMode; state.previewMode = !!enabled; _record('previewMode', state.previewMode, s); _audit('setPreviewMode', { field: 'previewMode', source: s, before, after: state.previewMode, result: 'ok' }); return state.previewMode; },
      setGridVisible(visible, s) { _as(s, 'setGridVisible'); const before = state.gridVisible; state.gridVisible = !!visible; _record('gridVisible', state.gridVisible, s); _audit('setGridVisible', { field: 'gridVisible', source: s, before, after: state.gridVisible, result: 'ok' }); return state.gridVisible; },
      setSnapToGrid(enabled, s) { _as(s, 'setSnapToGrid'); const before = state.snapToGrid; state.snapToGrid = !!enabled; _record('snapToGrid', state.snapToGrid, s); _audit('setSnapToGrid', { field: 'snapToGrid', source: s, before, after: state.snapToGrid, result: 'ok' }); return state.snapToGrid; },
      setPageMarginLeft(value, s) { _as(s, 'setPageMarginLeft'); const before = state.pageMarginLeft; state.pageMarginLeft = Math.max(0, value); _record('pageMarginLeft', state.pageMarginLeft, s); _audit('setPageMarginLeft', { field: 'pageMarginLeft', source: s, before, after: state.pageMarginLeft, result: 'ok' }); return state.pageMarginLeft; },
      setPageMarginTop(value, s) { _as(s, 'setPageMarginTop'); const before = state.pageMarginTop; state.pageMarginTop = Math.max(0, value); _record('pageMarginTop', state.pageMarginTop, s); _audit('setPageMarginTop', { field: 'pageMarginTop', source: s, before, after: state.pageMarginTop, result: 'ok' }); return state.pageMarginTop; },
      updateElementLayout(id, patch = {}, source) {
        _as(source, 'updateElementLayout');
        invariants.assertLayoutPatch(patch);
        const element = selectors.getElementById(id);
        if (!element) {
          _audit('updateElementLayout', { field: 'elements', elementId: id, source, before: null, after: null, patch: _clone(patch), result: 'noop', reason: 'element-not-found' });
          return null;
        }
        const before = { id: element.id, sectionId: element.sectionId, x: element.x, y: element.y, w: element.w, h: element.h };
        for (const key of ['sectionId', 'x', 'y', 'w', 'h']) {
          if (Object.prototype.hasOwnProperty.call(patch, key)) { element[key] = patch[key]; _record(`element.${key}`, { v: element[key], id }, source); }
        }
        _audit('updateElementLayout', { field: 'elements', elementId: id, source, before, after: { id: element.id, sectionId: element.sectionId, x: element.x, y: element.y, w: element.w, h: element.h }, patch: _clone(patch), result: 'ok' });
        return element;
      },
    };

    return Object.freeze(actions);
  }

  return { createDocumentActions };
})();

if (typeof module !== 'undefined') {
  module.exports = DocumentActions;
}
