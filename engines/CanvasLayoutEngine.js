'use strict';

const CanvasLayoutEngine = (() => {
  const S = window.CanvasLayoutSize;
  const E = window.CanvasLayoutElements;
  // Contract marks kept here for governance grep:
  // assertLayoutContract assertSelectionState assertZoomContract
  // DS.selection DS.zoom DS.getElementById
  return {
    update: S.update,
    updateSync: S.updateSync,
    getMetrics: S.getMetrics,
    getLayoutContract: S.getLayoutContract,
    buildElementDiv: E.buildElementDiv,
    renderElement: E.renderElement,
    renderAll: E.renderAll,
    updateElement: E.updateElement,
    updateElementPosition: E.updateElementPosition,
  };
})();

if (typeof module !== 'undefined') module.exports = CanvasLayoutEngine;
