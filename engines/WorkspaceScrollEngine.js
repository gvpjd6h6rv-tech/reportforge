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
  let _lastGeometrySignature = null;

  function _trace(event, payload) {
    if (typeof window === 'undefined' || typeof window.rfTrace !== 'function') return;
    if (!window.DebugTrace?.isEnabled('scroll')) return;
    const frame = (typeof RenderScheduler !== 'undefined' && typeof RenderScheduler.frame === 'number')
      ? RenderScheduler.frame
      : null;
    window.rfTrace('scroll', event, {
      frame,
      source: 'WorkspaceScrollEngine',
      phase: 'layout',
      payload: payload || null,
    });
  }

  function _computeLayoutContract() {
    const canvasContract = (typeof CanvasLayoutEngine !== 'undefined' &&
      CanvasLayoutEngine &&
      typeof CanvasLayoutEngine.getLayoutContract === 'function')
      ? CanvasLayoutEngine.getLayoutContract()
      : null;
    const sectionContract = (typeof SectionLayoutEngine !== 'undefined' &&
      SectionLayoutEngine &&
      typeof SectionLayoutEngine.getLayoutContract === 'function')
      ? SectionLayoutEngine.getLayoutContract()
      : null;
    const fallbackTotalH = (typeof DS !== 'undefined')
      ? Math.round(RF.Geometry.scale(DS.getTotalHeight()))
      : 0;
    return {
      ready: !!(canvasContract || sectionContract || typeof DS !== 'undefined'),
      scaledW: canvasContract && canvasContract.ready !== false
        ? canvasContract.width
        : sectionContract && sectionContract.ready !== false
          ? sectionContract.pageWidth
          : Math.round(RF.Geometry.scale(CFG.PAGE_W)),
      scaledH: canvasContract && canvasContract.ready !== false
        ? canvasContract.height
        : sectionContract && sectionContract.ready !== false
          ? sectionContract.totalHeight
          : fallbackTotalH,
      padding: SCROLL_PADDING,
    };
  }

  /**
   * Schedule an update via requestAnimationFrame.
   * Multiple calls within one frame are coalesced.
   */
  function scheduleUpdate() {
    const contract = _computeLayoutContract();
    _trace('update-schedule', contract);
    if (typeof RenderScheduler !== 'undefined') {
      RenderScheduler.invalidateLayer('scroll', 'WorkspaceScrollEngine');
      RenderScheduler.post(_apply, 'WorkspaceScrollEngine.apply');
      return;
    }
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
    const contract = _computeLayoutContract();
    const signature = JSON.stringify(contract);
    _trace('updateSync-apply', contract);
    if (_lastGeometrySignature === signature) return;
    _lastGeometrySignature = signature;

    // Workspace min-content size = canvas + padding
    // We set min-width/min-height on the viewport instead of width
    // so the workspace scroll region is large enough
    const vp = document.getElementById('viewport');
    if (vp) {
      // Viewport is already sized by ZoomEngine; ensure bottom margin
      const nextMarginBottom = `${contract.padding}px`;
      if (vp.style.marginBottom !== nextMarginBottom) {
        vp.style.marginBottom = nextMarginBottom;
      }
    }

    // Emit a custom event so other systems can react
    ws.dispatchEvent(new CustomEvent('rf:scroll-geometry', {
      detail: { scaledW: contract.scaledW, scaledH: contract.scaledH, padding: contract.padding },
      bubbles: false,
    }));
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
    updateSync() {
      if (typeof RenderScheduler !== 'undefined') {
        RenderScheduler.assertDomWriteAllowed('WorkspaceScrollEngine.updateSync');
      }
      if (typeof RenderScheduler !== 'undefined') {
        RenderScheduler.invalidateLayer('scroll', 'WorkspaceScrollEngine');
      }
      _trace('updateSync-enter', _computeLayoutContract());
      _apply();
    },

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
      return _computeLayoutContract();
    },

    getLayoutContract() {
      return _computeLayoutContract();
    },
  };
})();

// Export for module consumers
if (typeof module !== 'undefined') module.exports = window.WorkspaceScrollEngine;
