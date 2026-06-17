'use strict';

const DocumentActionsSelection = (() => {
  function createSelectionActions(state, selectors, invariants, _clone, _assertSource, _audit, _record) {
    return {
      clearSelectionState(s) {
        _assertSource(s, 'clearSelectionState');
        invariants.assertSelectionState(state.selection);
        const before = _clone(state.selection);
        state.selection.clear();
        _record('selection', state.selection, s);
        _audit('clearSelectionState', { field: 'selection', source: s, before, after: _clone(state.selection), result: 'ok' });
        return state.selection;
      },
      replaceSelection(ids, s) {
        _assertSource(s, 'replaceSelection');
        const before = _clone(state.selection);
        const next = ids instanceof Set ? [...ids] : Array.from(ids || []);
        state.selection.clear();
        next.forEach((id) => state.selection.add(id));
        _record('selection', state.selection, s);
        _audit('replaceSelection', { field: 'selection', source: s, before, after: _clone(state.selection), result: 'ok' });
        return state.selection;
      },
      selectOnly(id, s) {
        _assertSource(s, 'selectOnly');
        const before = _clone(state.selection);
        state.selection.clear();
        if (id != null) state.selection.add(id);
        _record('selection', state.selection, s);
        _audit('selectOnly', { field: 'selection', elementId: id ?? null, source: s, before, after: _clone(state.selection), result: 'ok' });
        return state.selection;
      },
      addSelection(id, s) {
        _assertSource(s, 'addSelection');
        const before = _clone(state.selection);
        if (id != null) state.selection.add(id);
        _record('selection', state.selection, s);
        _audit('addSelection', { field: 'selection', elementId: id ?? null, source: s, before, after: _clone(state.selection), result: 'ok' });
        return state.selection;
      },
      removeSelection(id, s) {
        _assertSource(s, 'removeSelection');
        const before = _clone(state.selection);
        state.selection.delete(id);
        _record('selection', state.selection, s);
        _audit('removeSelection', { field: 'selection', elementId: id ?? null, source: s, before, after: _clone(state.selection), result: 'ok' });
        return state.selection;
      },
      toggleSelection(id, s) {
        _assertSource(s, 'toggleSelection');
        const before = _clone(state.selection);
        const had = state.selection.has(id);
        had ? state.selection.delete(id) : state.selection.add(id);
        _record('selection', state.selection, s);
        _audit('toggleSelection', { field: 'selection', elementId: id ?? null, source: s, before, after: _clone(state.selection), result: had ? 'removed' : 'added' });
        return !had;
      },
    };
  }

  return { createSelectionActions };
})();

if (typeof module !== 'undefined') {
  module.exports = DocumentActionsSelection;
}
