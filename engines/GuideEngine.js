/**
 * GuideEngine — ReportForge v19 Phase 2
 * ─────────────────────────────────────────────────────────────────
 * Renders temporary alignment guides during drag operations.
 * Guides are drawn as DOM overlays in VIEW SPACE.
 *
 * Architecture:
 *   Guide positions received in MODEL SPACE from AlignmentEngine.
 *   Converted to view space for display: RF.Geometry.scale(modelPos)
 */
'use strict';

const GuideEngine = (() => {
  const GUIDE_COLOR   = 'rgba(0, 120, 255, 0.7)';
  const GUIDE_COLOR_S = 'rgba(255, 80, 0, 0.75)';   // spacing guides
  let _container  = null;
  let _activeGuides = [];  // {axis:'x'|'y', modelPos, type:'edge'|'center'|'spacing'}

  function _getContainer() {
    if (_container && _container.isConnected) return _container;
    _container = document.getElementById('guide-layer');
    if (!_container) {
      // Create a guide layer inside canvas-layer
      _container = document.createElement('div');
      _container.id = 'guide-layer';
      _container.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:50;overflow:visible';
      const cl = document.getElementById('canvas-layer');
      if (cl) cl.appendChild(_container);
    }
    return _container;
  }

  function _renderGuide(axis, modelPos, type) {
    const c = _getContainer();
    if (!c) return;
    const div = document.createElement('div');
    div.className = 'rf-guide-line';

    const color = type === 'spacing' ? GUIDE_COLOR_S : GUIDE_COLOR;

    if (axis === 'x') {
      // Vertical line at x = scale(modelPos)
      const vx = RF.Geometry.scale(modelPos);
      div.style.cssText = [
        'position:absolute',
        `left:${vx}px`,
        'top:0', 'bottom:0',
        'width:1px',
        `background:${color}`,
        'pointer-events:none',
      ].join(';');
    } else {
      // Horizontal line at y = scale(modelPos)
      const vy = RF.Geometry.scale(modelPos);
      div.style.cssText = [
        'position:absolute',
        'left:0', 'right:0',
        `top:${vy}px`,
        'height:1px',
        `background:${color}`,
        'pointer-events:none',
      ].join(';');
    }
    c.appendChild(div);
  }

  return {
    /**
     * Show guides for a set of alignment results.
     * @param {Array} guides — [{axis, modelPos, type}] from AlignmentEngine
     */
    show(guides) {
      _activeGuides = guides || [];
      this.render();
    },

    /** Render current guides into DOM */
    render() {
      const c = _getContainer();
      if (!c) return;
      // Clear previous guide lines (keep non-guide children)
      c.querySelectorAll('.rf-guide-line').forEach(el => el.remove());
      for (const g of _activeGuides) {
        _renderGuide(g.axis, g.modelPos, g.type || 'edge');
      }
    },

    /** Clear all temporary guides */
    clear() {
      _activeGuides = [];
      const c = _getContainer();
      if (c) c.querySelectorAll('.rf-guide-line').forEach(el => el.remove());
    },

    /** Update guide positions on zoom change (model positions unchanged, just re-render) */
    onZoomChanged() {
      if (_activeGuides.length) this.render();
    },

    /** Check if any guides are active */
    get hasGuides() { return _activeGuides.length > 0; },
  };
})();

if (typeof module !== 'undefined') module.exports = GuideEngine;
