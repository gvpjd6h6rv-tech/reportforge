/**
 * HandlesEngine — ReportForge v19 Phase 2
 * ─────────────────────────────────────────────────────────────────
 * Manages selection handles (resize grips) rendering.
 * All handle positions computed in VIEW SPACE via RF.Geometry.
 *
 * Delegates actual DOM manipulation to the existing
 * SelectionEngine.renderHandles() — this engine provides
 * the v19 API surface and geometry correctness guarantee.
 */
'use strict';

const HandlesEngine = (() => {
  // Handle configuration
  const HANDLE_SIZE   = 8;   // CSS px, view space
  const HANDLE_RADIUS = 2;   // border-radius
  const POSITIONS     = ['nw','n','ne','w','e','sw','s','se'];

  /**
   * Compute view-space positions of all handles for an element.
   * @param {object} el  — DS element
   * @returns {Array<{pos, x, y}>}  — view-space handle coords
   */
  function computeHandlePositions(el) {
    if (!el || typeof DS === 'undefined') return [];
    const secTop = DS.getSectionTop(el.sectionId);

    // Model → view
    const vx = RF.Geometry.scale(el.x);
    const vy = RF.Geometry.scale(secTop + el.y);
    const vw = RF.Geometry.scale(el.w);
    const vh = RF.Geometry.scale(el.h);
    const hs = HANDLE_SIZE / 2;

    return [
      { pos: 'nw', x: vx - hs,        y: vy - hs        },
      { pos: 'n',  x: vx + vw/2 - hs, y: vy - hs        },
      { pos: 'ne', x: vx + vw - hs,   y: vy - hs        },
      { pos: 'w',  x: vx - hs,        y: vy + vh/2 - hs },
      { pos: 'e',  x: vx + vw - hs,   y: vy + vh/2 - hs },
      { pos: 'sw', x: vx - hs,        y: vy + vh - hs   },
      { pos: 's',  x: vx + vw/2 - hs, y: vy + vh - hs   },
      { pos: 'se', x: vx + vw - hs,   y: vy + vh - hs   },
    ];
  }

  /**
   * Compute the selection bounding box for a set of elements.
   * @param {Array<object>} elements — DS elements
   * @returns {{x,y,w,h}}  — view-space bounding box
   */
  function selectionBounds(elements) {
    if (!elements || !elements.length) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const el of elements) {
      const secTop = (typeof DS !== 'undefined') ? DS.getSectionTop(el.sectionId) : 0;
      const vx = RF.Geometry.scale(el.x);
      const vy = RF.Geometry.scale(secTop + el.y);
      const vw = RF.Geometry.scale(el.w);
      const vh = RF.Geometry.scale(el.h);
      if (vx        < minX) minX = vx;
      if (vy        < minY) minY = vy;
      if (vx + vw   > maxX) maxX = vx + vw;
      if (vy + vh   > maxY) maxY = vy + vh;
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }

  /**
   * Delegate rendering to SelectionEngine (existing battle-tested code).
   * This satisfies the v19 API contract while preserving stability.
   */
  function render() {
    RenderScheduler.handles(() => {
      if (typeof SelectionEngine !== 'undefined' &&
          typeof SelectionEngine.renderHandles === 'function') {
        SelectionEngine.renderHandles();
      }
    });
  }

  /**
   * Synchronous render for immediate feedback.
   */
  function renderSync() {
    if (typeof SelectionEngine !== 'undefined' &&
        typeof SelectionEngine.renderHandles === 'function') {
      SelectionEngine.renderHandles();
    }
  }

  /**
   * Update handle positions on zoom change.
   * Since handles are in view space, they must be re-rendered on zoom.
   */
  function onZoomChanged() { render(); }

  return {
    HANDLE_SIZE,
    POSITIONS,
    computeHandlePositions,
    selectionBounds,
    render,
    renderSync,
    onZoomChanged,
  };
})();

if (typeof module !== 'undefined') module.exports = HandlesEngine;
