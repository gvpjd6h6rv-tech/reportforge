'use strict';

const DAS = typeof DocumentActionsSelection !== 'undefined' ? DocumentActionsSelection
  : (typeof globalThis !== 'undefined' && globalThis.DocumentActionsSelection) ? globalThis.DocumentActionsSelection
  : typeof require === 'function' ? require('./DocumentActionsSelection.js') : null;

const DALC = typeof DocumentActionsLayoutClamp !== 'undefined' ? DocumentActionsLayoutClamp
  : (typeof globalThis !== 'undefined' && globalThis.DocumentActionsLayoutClamp) ? globalThis.DocumentActionsLayoutClamp
  : typeof require === 'function' ? require('./DocumentActionsLayoutClamp.js') : null;

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

    // Generic field setters: same shape as each hand-written setZoom/setTool/
    // setSections/... method (assert source -> capture before -> assign ->
    // record -> audit -> return). _arraySetter clones before/after since
    // sections/elements are mutable array references.
    function _simpleSetter(action, field, transform) {
      return (value, s) => { _as(s, action); const before = state[field]; state[field] = transform ? transform(value) : value; _record(field, state[field], s); _audit(action, { field, source: s, before, after: state[field], result: 'ok' }); return state[field]; };
    }
    function _arraySetter(action, field) {
      return (value, s) => { _as(s, action); const before = _clone(state[field]); state[field] = value; _record(field, state[field], s); _audit(action, { field, source: s, before, after: _clone(state[field]), result: 'ok' }); return state[field]; };
    }

    const actions = {
      subscribe(fn) { state._subs.push(fn); },
      notify() { const api = typeof getApi === 'function' ? getApi() : null; state._subs.forEach((fn) => fn(api)); },
      saveHistory() { history.saveHistory(); },
      undo() { history.undo(); },
      redo() { history.redo(); },
      _updateUndoRedo() { history.updateUndoRedo(); },
      ...sa,
      setZoom: _simpleSetter('setZoom', 'zoom', (v) => invariants.assertZoom(v)),
      setZoomDesign: _simpleSetter('setZoomDesign', 'zoomDesign', (v) => invariants.assertZoom(v)),
      setZoomPreview: _simpleSetter('setZoomPreview', 'zoomPreview', (v) => invariants.assertZoom(v)),
      setSections: _arraySetter('setSections', 'sections'),
      setElements: _arraySetter('setElements', 'elements'),
      setTool: _simpleSetter('setTool', 'tool'),
      setPreviewMode: _simpleSetter('setPreviewMode', 'previewMode', (v) => !!v),
      setGridVisible: _simpleSetter('setGridVisible', 'gridVisible', (v) => !!v),
      setSnapToGrid: _simpleSetter('setSnapToGrid', 'snapToGrid', (v) => !!v),
      setPageMarginLeft: _simpleSetter('setPageMarginLeft', 'pageMarginLeft', (v) => Math.max(0, v)),
      setPageMarginTop: _simpleSetter('setPageMarginTop', 'pageMarginTop', (v) => Math.max(0, v)),
      updateElementLayout(id, patch = {}, source) {
        _as(source, 'updateElementLayout');
        invariants.assertLayoutPatch(patch);
        const element = selectors.getElementById(id);
        if (!element) {
          _audit('updateElementLayout', { field: 'elements', elementId: id, source, before: null, after: null, patch: _clone(patch), result: 'noop', reason: 'element-not-found' });
          return null;
        }
        const before = { id: element.id, sectionId: element.sectionId, x: element.x, y: element.y, w: element.w, h: element.h };

        // RF-SECTION-MOVE-INK-1: clamp x/y into the target section's own
        // bounds on a sectionId change -- see DocumentActionsLayoutClamp.js
        // for the full incident writeup. Single source of truth: this is
        // the canonical state-mutation path both the Properties-panel
        // dropdown AND any programmatic caller funnel through.
        const finalPatch = DALC && DALC.clampSectionMovePatch
          ? DALC.clampSectionMovePatch(element, patch, selectors)
          : patch;

        for (const key of ['sectionId', 'x', 'y', 'w', 'h']) {
          if (Object.prototype.hasOwnProperty.call(finalPatch, key)) { element[key] = finalPatch[key]; _record(`element.${key}`, { v: element[key], id }, source); }
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
