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
  function _trace(event, payload) {
    if (typeof window === 'undefined' || typeof window.rfTrace !== 'function') return;
    if (!window.DebugTrace?.isEnabled('overlay')) return;
    const frame = (typeof RenderScheduler !== 'undefined' && typeof RenderScheduler.frame === 'number')
      ? RenderScheduler.frame
      : null;
    window.rfTrace('overlay', event, {
      frame,
      source: 'OverlayEngineV19',
      phase: 'visual',
      payload: payload || null,
    });
  }

  function renderAll() {
    _trace('renderAll-run', {
      hasRuler: typeof RulerEngine !== 'undefined',
      hasHandles: typeof HandlesEngine !== 'undefined',
      hasGuides: typeof GuideEngine !== 'undefined' && !!GuideEngine.hasGuides,
    });
    if (typeof RF !== 'undefined') RF.Geometry.invalidate();
    if (typeof RulerEngine   !== 'undefined') RulerEngine.render();
    if (typeof HandlesEngine !== 'undefined') HandlesEngine.render();
    if (typeof GuideEngine   !== 'undefined' && GuideEngine.hasGuides) GuideEngine.render();
  }

  function _schedule() {
    if (typeof RenderScheduler !== 'undefined') {
      RenderScheduler.invalidateLayer('overlay', 'OverlayEngineV19.render');
      _trace('render-schedule', { via: 'RenderScheduler.visual' });
      RenderScheduler.visual(() => renderAll(), 'OverlayEngineV19.renderAll');
    } else {
      _trace('render-schedule', { via: 'requestAnimationFrame' });
      requestAnimationFrame(renderAll);
    }
  }

  return {
    render()     { _trace('render-enter'); _schedule(); },
    renderSync() {
      if (typeof RenderScheduler !== 'undefined') {
        RenderScheduler.invalidateLayer('overlay', 'OverlayEngineV19.renderSync');
      }
      _trace('renderSync-run', {
        hasRuler: typeof RulerEngine !== 'undefined',
      });
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
