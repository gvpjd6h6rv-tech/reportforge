'use strict';

(function initDocumentStore(global) {
  const { state, invariants, newId, mkEl } = DocumentState.createDocumentState(global);
  const selectors = DocumentSelectors.createDocumentSelectors(state, global);
  let api = null;
  const history = DocumentHistory.createDocumentHistory(state, () => {
    if (api) api.notify();
  }, global, () => api);
  const actions = DocumentActions.createDocumentActions(state, selectors, invariants, history, () => api);

  function forward(source, names) {
    const out = {};
    for (const name of names) out[name] = (...args) => source[name](...args);
    return out;
  }

  api = {
    state, actions, selectors, invariants,
    ...forward(actions, [
      'subscribe', 'notify', 'saveHistory', 'undo', 'redo', '_updateUndoRedo',
      'clearSelectionState', 'replaceSelection', 'selectOnly', 'addSelection',
      'removeSelection', 'toggleSelection', 'setZoom', 'setZoomDesign', 'setZoomPreview',
      'setSections', 'setElements', 'setTool', 'setPreviewMode', 'setGridVisible',
      'setSnapToGrid', 'setPageMarginLeft', 'setPageMarginTop', 'updateElementLayout',
    ]),
    ...forward(selectors, [
      'getSection', 'getSectionTop', 'getSectionAtY', 'getTotalHeight', 'isSelected',
      'getSelectedElements', 'getElementById', 'snap',
    ]),
  };

  const _GUARDED = 'sections|elements|selection|zoom|zoomDesign|zoomPreview|tool|previewMode|pageMarginLeft|pageMarginTop';
  for (const key of ['sections','elements','selection','tool','zoom','zoomDesign','zoomPreview','gridVisible','snapToGrid','previewMode','pageMarginLeft','pageMarginTop','previewZoom','clipboard','history','historyIndex','_subs']) {
    Object.defineProperty(api, key, {
      enumerable: true, configurable: false,
      get() { return state[key]; },
      set(value) {
        if (_GUARDED.includes(key)) throw new Error(`[DS] DS.${key}= forbidden; use set${key[0].toUpperCase()+key.slice(1)}(v, source)`);
        state[key] = value;
      },
    });
  }

  Object.freeze(api.actions);
  Object.freeze(api.selectors);
  Object.freeze(api.invariants);

  if (!global.DocumentStoreUtils) throw new Error('DocumentStoreUtils must be loaded before DocumentStore');
  global.DocumentStoreUtils.install(global, newId, mkEl);
  global.DS = api; // DS.state + DS.actions + DS.selectors + DS.invariants
  actions.saveHistory();
})(window);
