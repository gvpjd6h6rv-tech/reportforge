/**
 * WorkspaceScrollEngine — ReportForge v19
 * ─────────────────────────────────────────────────────────────────
 * Manages the workspace scroll container dimensions so it always
 * reflects the scaled canvas geometry.
 *
 * Architecture rule:
 *   All geometry through RF.Geometry — no raw DS.zoom multiplication.
 *
 * Coordinate spaces:
 *   MODEL SPACE  → DS coordinates (document px)
 *   VIEW SPACE   → MODEL × zoom  (DOM px)
 *   SCREEN SPACE → VIEW × devicePixelRatio
 */
'use strict';

window.WorkspaceScrollEngine = (() => {
  // Minimum padding around the canvas inside the scroll container (px)
  const SCROLL_PADDING = 32;

  // rAF handle — batches multiple rapid update calls into one frame
  let _rafId = null;
  let _lastBounds = null;

  function _computeBounds() {
    const canvas = (typeof CanvasLayoutEngine !== 'undefined' &&
      CanvasLayoutEngine &&
      typeof CanvasLayoutEngine.getLayoutContract === 'function')
      ? CanvasLayoutEngine.getLayoutContract()
      : null;

    return {
      scaledW: canvas ? canvas.width : RF.Geometry.scale(CFG.PAGE_W),
      scaledH: canvas ? canvas.height : RF.Geometry.scale(
        (typeof DS !== 'undefined') ? DS.getTotalHeight() : 0
      ),
      padding: SCROLL_PADDING,
    };
  }

  /**
   * Schedule an update via requestAnimationFrame.
   * Multiple calls within one frame are coalesced.
   */
  function scheduleUpdate() {
    if (_rafId) return;
    _rafId = requestAnimationFrame(() => {
      _rafId = null;
      _apply();
    });
  }

  /**
   * Compute and apply scroll container min-size.
   * Called once per rAF frame.
   */
  function _apply() {
    const ws = document.getElementById('workspace');
    if (!ws) return;

    const bounds = _computeBounds();

    // Workspace min-content size = canvas + padding
    // We set min-width/min-height on the viewport instead of width
    // so the workspace scroll region is large enough
    const vp = document.getElementById('viewport');
    if (vp) {
      // Viewport is already sized by ZoomEngine; ensure bottom margin
      const marginBottom = bounds.padding + 'px';
      if (vp.style.marginBottom !== marginBottom) {
        vp.style.marginBottom = marginBottom;
      }
    }

    if (_lastBounds &&
        _lastBounds.scaledW === bounds.scaledW &&
        _lastBounds.scaledH === bounds.scaledH &&
        _lastBounds.padding === bounds.padding) {
      return;
    }

    // Emit a custom event so other systems can react
    ws.dispatchEvent(new CustomEvent('rf:scroll-geometry', {
      detail: bounds,
      bubbles: false,
    }));
    _lastBounds = bounds;
  }

  /**
   * Preserve visual centre of canvas on zoom change.
   * Call BEFORE DS.zoom changes (pass old and new values).
   * @param {number} prevZoom
   * @param {number} newZoom
   */
  function adjustForZoom(prevZoom, newZoom) {
    const ws = document.getElementById('workspace');
    if (!ws || prevZoom === newZoom) return;

    // Viewport centre in view space (before zoom)
    const centreX = ws.scrollLeft + ws.clientWidth  / 2;
    const centreY = ws.scrollTop  + ws.clientHeight / 2;

    // Convert to model space
    const modelX = centreX / prevZoom;
    const modelY = centreY / prevZoom;

    // Equivalent scroll offset in new zoom
    const newScrollLeft = modelX * newZoom - ws.clientWidth  / 2;
    const newScrollTop  = modelY * newZoom - ws.clientHeight / 2;

    ws.scrollLeft = Math.max(0, newScrollLeft);
    ws.scrollTop  = Math.max(0, newScrollTop);
  }

  return {
    /**
     * Initialize — wire up listeners.
     * Called once on boot after all engines are ready.
     */
    init() {
      // Zoom changes
      const ws = document.getElementById('workspace');
      if (ws) {
        ws.addEventListener('rf:zoom-changed', () => this.update());
        ws.addEventListener('scroll', () => {
          // Re-emit cursor position to rulers on scroll
          if (typeof OverlayEngine !== 'undefined') OverlayEngine.render();
        });
      }
      // Resize
      if (typeof ResizeObserver !== 'undefined') {
        const cl = document.getElementById('canvas-layer');
        if (cl) {
          new ResizeObserver(() => this.update()).observe(cl);
        }
      }
      window.addEventListener('resize', () => this.update());
    },

    /** Immediate synchronous update (use sparingly) */
    updateSync() { _apply(); },

    /** Batched update — safe to call from any engine */
    update() { scheduleUpdate(); },

    /**
     * Call before zoom changes to preserve visual centre.
     * @param {number} prevZoom
     * @param {number} newZoom
     */
    adjustForZoom,

    /**
     * Return the current scroll geometry in view-space pixels.
     * Useful for rulers and overlays.
     */
    getGeometry() {
      return _computeBounds();
    },

    getLayoutContract() {
      return _computeBounds();
    },
  };
})();

// Export for module consumers
if (typeof module !== 'undefined') module.exports = window.WorkspaceScrollEngine;
