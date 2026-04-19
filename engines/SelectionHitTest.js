'use strict';

const SelectionHitTest = (() => {
  function resolveElementDiv(target, id) {
    return (target && typeof target.closest === 'function'
      ? target.closest(`.cr-element[data-id="${id}"]`)
      : null) || document.querySelector(`.cr-element[data-id="${id}"]`);
  }

  function resolvePointerId(e) {
    return typeof e.pointerId === 'number'
      ? e.pointerId
      : (e.originalEvent ? e.originalEvent.pointerId : null);
  }

  function isShiftSelection(e) {
    return e.modifiers ? !!e.modifiers.shiftKey : !!e.shiftKey;
  }

  function resolveRenderSelectionIds(engine, selectedIds) {
    const drag = engine && engine._drag ? engine._drag : null;
    if (drag && drag.type === 'move' && Array.isArray(drag.subjectIds) && drag.subjectIds.length > 1) {
      return [...drag.subjectIds];
    }
    return [...(selectedIds || [])];
  }

  return {
    resolveElementDiv,
    resolvePointerId,
    isShiftSelection,
    resolveRenderSelectionIds,
  };
})();

if (typeof module !== 'undefined') module.exports = SelectionHitTest;
