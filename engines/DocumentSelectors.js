'use strict';

const DocumentSelectors = (() => {
  function createDocumentSelectors(state, global) {
    return Object.freeze({
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
      getTotalHeight() {
        return state.sections.reduce((sum, section) => sum + section.height, 0);
      },
      isSelected(id) {
        return state.selection.has(id);
      },
      getSelectedElements() {
        return state.elements.filter((element) => state.selection.has(element.id));
      },
      getElementById(id) {
        return state.elements.find((element) => element.id === id);
      },
      snap(value) {
        const grid = typeof global.CFG === 'object' && Number.isFinite(global.CFG.MODEL_GRID)
          ? global.CFG.MODEL_GRID
          : (typeof global.CFG === 'object' && Number.isFinite(global.CFG.GRID) ? global.CFG.GRID : 4);
        return state.snapToGrid ? Math.round(value / grid) * grid : value;
      },
    });
  }

  return { createDocumentSelectors };
})();

if (typeof module !== 'undefined') {
  module.exports = DocumentSelectors;
}

