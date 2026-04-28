'use strict';

const HistorySnapshot = (() => {
  function captureHistorySnapshot() {
    if (typeof DS === 'undefined') return null;
    return JSON.stringify({
      elements: DS.elements,
      sections: DS.sections,
      zoom: DS.zoom,
    });
  }

  function applyHistorySnapshot(snap) {
    if (!snap || typeof DS === 'undefined') return false;
    try {
      const state = JSON.parse(snap);
      DS.elements = state.elements;
      DS.sections = state.sections;
      if (typeof CanvasLayoutEngine !== 'undefined' && typeof CanvasLayoutEngine.update === 'function') CanvasLayoutEngine.update();
      if (typeof SectionLayoutEngine !== 'undefined' && typeof SectionLayoutEngine.update === 'function') SectionLayoutEngine.update();
      if (typeof ElementLayoutEngine !== 'undefined' && typeof ElementLayoutEngine.update === 'function') ElementLayoutEngine.update();
      if (typeof OverlayEngine !== 'undefined' && typeof OverlayEngine.render === 'function') OverlayEngine.render();
      return true;
    } catch (e) {
      console.error('[HistorySnapshot] apply failed:', e);
      return false;
    }
  }

  return {
    captureHistorySnapshot,
    applyHistorySnapshot,
  };
})();

if (typeof module !== 'undefined') module.exports = HistorySnapshot;
