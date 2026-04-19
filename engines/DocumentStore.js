'use strict';

(function initDocumentStore(global) {
  const { state, invariants, newId, mkEl } = DocumentState.createDocumentState(global);
  const selectors = DocumentSelectors.createDocumentSelectors(state, global);
  let api = null;
  const history = DocumentHistory.createDocumentHistory(state, () => {
    if (api) api.notify();
  }, global);
  const actions = DocumentActions.createDocumentActions(state, selectors, invariants, history, () => api);

  // DS.state is the canonical source of truth for document runtime state.
  api = {
    state,
    actions,
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
