'use strict';

const DocumentActions = (() => {
  function createDocumentActions(state, selectors, invariants, history, getApi) {

    function _assertSource(src, fn) {
      if (!src) throw new Error(`[DocumentActions.${fn}] source is required`);
      if (src === 'UNKNOWN') throw new Error(`[DocumentActions.${fn}] source "UNKNOWN" is forbidden`);
    }
    function _getPhase() {
      return (typeof RenderSchedulerScope !== 'undefined' && typeof RenderSchedulerScope.currentWriteScope === 'function')
        ? (RenderSchedulerScope.currentWriteScope() ?? null) : null;
    }
    function _record(field, value, source) {
      const wl = typeof RuntimeWriteLog !== 'undefined' ? RuntimeWriteLog : null;
      wl?.recordWrite({ field, value, source, phase: _getPhase() });
    }

    const actions = {
      subscribe(fn) { state._subs.push(fn); },
      notify() { const api = typeof getApi === 'function' ? getApi() : null; state._subs.forEach((fn) => fn(api)); },
      saveHistory() { history.saveHistory(); },
      undo() { history.undo(); },
      redo() { history.redo(); },
      _updateUndoRedo() { history.updateUndoRedo(); },

      // Selection
      clearSelectionState() { invariants.assertSelectionState(state.selection); state.selection.clear(); return state.selection; },
      replaceSelection(ids) { const next = ids instanceof Set ? [...ids] : Array.from(ids || []); state.selection.clear(); next.forEach((id) => state.selection.add(id)); return state.selection; },
      selectOnly(id) { state.selection.clear(); if (id != null) state.selection.add(id); return state.selection; },
      addSelection(id) { if (id != null) state.selection.add(id); return state.selection; },
      removeSelection(id) { state.selection.delete(id); return state.selection; },
      toggleSelection(id) { if (state.selection.has(id)) { state.selection.delete(id); return false; } state.selection.add(id); return true; },

      // Zoom
      setZoom(zoom, s) { _assertSource(s, 'setZoom'); state.zoom = invariants.assertZoom(zoom); _record('zoom', zoom, s); return state.zoom; },
      setZoomDesign(zoom, s) { _assertSource(s, 'setZoomDesign'); state.zoomDesign = invariants.assertZoom(zoom); _record('zoomDesign', zoom, s); return state.zoomDesign; },
      setZoomPreview(zoom, s) { _assertSource(s, 'setZoomPreview'); state.zoomPreview = invariants.assertZoom(zoom); _record('zoomPreview', zoom, s); return state.zoomPreview; },

      // Document structure
      setSections(sections, s) { _assertSource(s, 'setSections'); state.sections = sections; _record('sections', sections, s); return state.sections; },
      setElements(elements, s) { _assertSource(s, 'setElements'); state.elements = elements; _record('elements', elements, s); return state.elements; },

      // UI state
      setTool(tool, s) { _assertSource(s, 'setTool'); state.tool = tool; _record('tool', tool, s); return state.tool; },
      setPreviewMode(enabled, s) { _assertSource(s, 'setPreviewMode'); state.previewMode = !!enabled; _record('previewMode', !!enabled, s); return state.previewMode; },
      setGridVisible(visible, s) { _assertSource(s, 'setGridVisible'); state.gridVisible = !!visible; _record('gridVisible', !!visible, s); return state.gridVisible; },
      setSnapToGrid(enabled, s) { _assertSource(s, 'setSnapToGrid'); state.snapToGrid = !!enabled; _record('snapToGrid', !!enabled, s); return state.snapToGrid; },

      // Page geometry
      setPageMarginLeft(value, s) { _assertSource(s, 'setPageMarginLeft'); state.pageMarginLeft = Math.max(0, value); _record('pageMarginLeft', state.pageMarginLeft, s); return state.pageMarginLeft; },
      setPageMarginTop(value, s) { _assertSource(s, 'setPageMarginTop'); state.pageMarginTop = Math.max(0, value); _record('pageMarginTop', state.pageMarginTop, s); return state.pageMarginTop; },

      // Element layout
      updateElementLayout(id, patch = {}, source) {
        _assertSource(source, 'updateElementLayout');
        invariants.assertLayoutPatch(patch);
        const element = selectors.getElementById(id);
        if (!element) return null;
        for (const key of ['sectionId', 'x', 'y', 'w', 'h']) {
          if (Object.prototype.hasOwnProperty.call(patch, key)) {
            element[key] = patch[key];
            _record(`element.${key}`, patch[key], source);
          }
        }
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
