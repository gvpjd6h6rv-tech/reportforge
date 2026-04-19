'use strict';

const DocumentActions = (() => {
  function createDocumentActions(state, selectors, invariants, history, getApi) {
    const actions = {
      subscribe(fn) {
        state._subs.push(fn);
      },
      notify() {
        const api = typeof getApi === 'function' ? getApi() : null;
        state._subs.forEach((fn) => fn(api));
      },
      saveHistory() {
        history.saveHistory();
      },
      undo() {
        history.undo();
      },
      redo() {
        history.redo();
      },
      _updateUndoRedo() {
        history.updateUndoRedo();
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

    return Object.freeze(actions);
  }

  return { createDocumentActions };
})();

if (typeof module !== 'undefined') {
  module.exports = DocumentActions;
}

