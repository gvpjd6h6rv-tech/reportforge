/**
 * GridEngine — ReportForge v19
 * ─────────────────────────────────────────────────────────────────
 * Manages the visual grid overlay.
 *
 * Grid base size is defined in MODEL SPACE (document units).
 * Visual grid size = RF.Geometry.scale(GRID_BASE_MODEL).
 *
 * Architecture rule:
 *   background-size is always computed via RF.Geometry.scale().
 *   Never: 4 * DS.zoom + 'px'
 *   Always: RF.Geometry.scale(GRID_BASE_MODEL) + 'px'
 */
'use strict';

window.GridEngine = (() => {
  /**
   * Base grid unit in MODEL SPACE (document px).
   * At zoom=1.0 this equals the visual grid dot spacing.
   * Default: 10px model units (matches CFG.GRID which is typically 4px snap;
   * visual grid uses a larger 10px base for readability).
   */
  const GRID_BASE_MODEL = 10;

  /**
   * Minimum grid pixel size below which the grid is hidden
   * (prevents a cluttered dot-storm at very low zoom).
   */
  const MIN_GRID_PX = 3;

  let _rafId    = null;
  let _visible  = true;

  function scheduleUpdate() {
    if (typeof RenderScheduler !== 'undefined') {
      RenderScheduler.visual(_apply, 'GridEngine._apply');
    } else {
      if (_rafId) return;
      _rafId = requestAnimationFrame(() => { _rafId = null; _apply(); });
    }
  }

  function _apply() {
    const overlay = document.getElementById('grid-overlay');
    if (!overlay) return;

    const gridPx = RF.Geometry.scale(GRID_BASE_MODEL);

    if (!_visible || gridPx < MIN_GRID_PX) {
      overlay.classList.add('hidden');
      return;
    }

    overlay.classList.toggle('hidden', !_visible);
    // Update background-size — two values for x and y spacing
    overlay.style.backgroundSize = `${gridPx}px ${gridPx}px`;
  }

  return {
    GRID_BASE_MODEL,

    init() {
      // Sync initial state from DS
      _visible = (typeof DS !== 'undefined') ? (DS.gridVisible !== false) : true;
      this.update();

      // Listen for zoom changes via custom event
      const ws = document.getElementById('workspace');
      if (ws) ws.addEventListener('rf:zoom-changed', () => this.update());
    },

    /** Show or hide the grid */
    setVisible(v) {
      _visible = !!v;
      if (typeof DS !== 'undefined') DS.gridVisible = _visible;
      scheduleUpdate();
    },

    toggle() { this.setVisible(!_visible); },
    isVisible() { return _visible; },

    /** Batched update on zoom/canvas change */
    update() { scheduleUpdate(); },

    /** Synchronous update (for initial render) */
    updateSync() { _apply(); },

    /**
     * Return current grid size in view-space px.
     * Useful for snap calculations.
     */
    getGridPx() { return RF.Geometry.scale(GRID_BASE_MODEL); },
  };
})();

if (typeof module !== 'undefined') module.exports = window.GridEngine;
