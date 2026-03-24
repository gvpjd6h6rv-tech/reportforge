/**
 * ZoomEngineV19 — ReportForge v19 Phase 2
 * ─────────────────────────────────────────────────────────────────
 * Unified zoom management facade.
 * Wraps DesignZoomEngine + PreviewZoomEngine into one API surface.
 *
 * Pipeline:
 *   ZoomEngine.set(z)
 *       ↓ DesignZoomEngine._apply(z)  — DS.zoom = z, DOM updates
 *       ↓ rf:zoom-changed event
 *       ↓ GridEngine, WorkspaceScrollEngine, RulerEngine react
 *       ↓ canonical preview refresh if preview mode
 *
 * Architecture:
 *   ZoomEngine never reads DS.zoom directly.
 *   It delegates all reads to RF.Geometry.zoom().
 */
'use strict';

const ZoomEngineV19 = (() => {
  // Discrete zoom steps (same as legacy ZOOM_STEPS)
  const STEPS = [0.25, 0.5, 0.75, 1.0, 1.5, 2.0, 3.0, 4.0];

  // Registered zoom-change listeners
  const _listeners = [];

  function _snapToStep(z) {
    return STEPS.reduce((a, b) => Math.abs(b - z) < Math.abs(a - z) ? b : a, STEPS[0]);
  }

  function _notify(z) {
    for (const fn of _listeners) {
      try { fn(z); } catch (e) { console.error('[ZoomEngine]', e); }
    }
  }

  return {
    STEPS,

    /**
     * Set zoom to a discrete step value.
     * @param {number} z           — zoom factor (will be snapped to step)
     * @param {number} [anchorX]   — client X for scroll anchor
     * @param {number} [anchorY]   — client Y for scroll anchor
     */
    set(z, anchorX, anchorY) {
      const snapped = Math.max(0.25, Math.min(4.0, _snapToStep(parseFloat(z))));
      DesignZoomEngine.set(snapped, anchorX, anchorY);
      _notify(snapped);
    },

    /**
     * Set zoom to an exact value (continuous, for wheel/pinch).
     */
    setFree(z, anchorX, anchorY) {
      const clamped = Math.max(0.25, Math.min(4.0, parseFloat(z)));
      DesignZoomEngine.setFree(clamped, anchorX, anchorY);
      _notify(clamped);
    },

    zoomIn(ax, ay)  { DesignZoomEngine.zoomIn(ax, ay);  _notify(RF.Geometry.zoom()); },
    zoomOut(ax, ay) { DesignZoomEngine.zoomOut(ax, ay); _notify(RF.Geometry.zoom()); },
    reset()         { this.set(1.0); },

    /** Current zoom (reads through RF.Geometry — never DS.zoom directly) */
    get zoom() { return RF.Geometry.zoom(); },

    /** Fit canvas width to workspace */
    fitWidth() {
      const ws  = document.getElementById('workspace');
      const lay = typeof computeLayout === 'function' ? computeLayout() : { rulerWidth: 22 };
      if (!ws) return;
      const avail = ws.clientWidth - lay.rulerWidth - 32;
      this.setFree(avail / CFG.PAGE_W);
    },

    /** Fit entire page height to workspace */
    fitPage() {
      const ws  = document.getElementById('workspace');
      const lay = typeof computeLayout === 'function' ? computeLayout() : { rulerWidth: 22, rulerHeight: 16 };
      if (!ws || typeof DS === 'undefined') return;
      const availW = ws.clientWidth  - lay.rulerWidth  - 32;
      const availH = ws.clientHeight - lay.rulerHeight - 32;
      const totalH = DS.getTotalHeight();
      this.setFree(Math.min(availW / CFG.PAGE_W, availH / Math.max(totalH, 100)));
    },

    /**
     * Register a zoom-change listener.
     * @param {Function} fn  — called with new zoom value
     */
    onChange(fn) { _listeners.push(fn); },
  };
})();

if (typeof module !== 'undefined') module.exports = ZoomEngineV19;
