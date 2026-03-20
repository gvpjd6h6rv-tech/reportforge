/**
 * OverlayEngineV19 — ReportForge v19.7
 * ─────────────────────────────────────────────────────────────────
 * Unified overlay compositor.
 * Method names verified against real engine APIs:
 *   RulerEngine.render() / .renderSync() / .updateCursor() / .clearCursor()
 *   HandlesEngine.render()           (NOT .update)
 *   GuideEngine.render()             (NOT .flush — re-renders active guides)
 */
'use strict';

const OverlayEngineV19 = (() => {
  function renderAll() {
    if (typeof RF !== 'undefined') RF.Geometry.invalidate();
    if (typeof RulerEngine   !== 'undefined') RulerEngine.render();
    if (typeof HandlesEngine !== 'undefined') HandlesEngine.render();
    if (typeof GuideEngine   !== 'undefined' && GuideEngine.hasGuides) GuideEngine.render();
  }

  function _schedule() {
    if (typeof RenderScheduler !== 'undefined') {
      RenderScheduler.visual(() => renderAll(), 'OverlayEngineV19.renderAll');
    } else {
      requestAnimationFrame(renderAll);
    }
  }

  return {
    render()     { _schedule(); },
    renderSync() {
      if (typeof RF         !== 'undefined') RF.Geometry.invalidate();
      if (typeof RulerEngine !== 'undefined') RulerEngine.renderSync();
    },
    updateCursor(modelX, modelY) {
      if (typeof RulerEngine !== 'undefined') RulerEngine.updateCursor(modelX, modelY);
    },
    clearCursor() {
      if (typeof RulerEngine !== 'undefined') RulerEngine.clearCursor();
    },
  };
})();

if (typeof module !== 'undefined') module.exports = OverlayEngineV19;
