/**
 * SnapEngine — ReportForge v19
 * ─────────────────────────────────────────────────────────────────
 * All snap operations occur in MODEL SPACE.
 *
 * Pipeline:
 *   screen/client coords
 *       ↓ RF.Geometry.viewToModel(clientX, clientY)
 *   model coords
 *       ↓ SnapEngine.snap(modelX)
 *   snapped model coords
 *       ↓ RF.Geometry.modelToView(snappedX, snappedY)
 *   view coords → DOM styles
 *
 * Architecture rule:
 *   NEVER snap in view space.
 *   NEVER use DS.zoom directly — always RF.Geometry.
 */
'use strict';

window.SnapEngine = (() => {
  /**
   * Snap grid in MODEL SPACE (document units).
   * This is the authoritative snap resolution.
   * At zoom=1.0 this is the visual pixel snap distance.
   */
  let _gridModel = 4; // default, overridden by CFG.GRID on init

  /** Whether snapping is enabled */
  let _enabled = true;

  /**
   * Snap a single model-space value to the grid.
   * @param {number} v  — value in MODEL SPACE
   * @returns {number}  — snapped value in MODEL SPACE
   */
  function snapModel(v) {
    if (!_enabled || _gridModel <= 0) return v;
    return Math.round(v / _gridModel) * _gridModel;
  }

  /**
   * Full pipeline: client coords → snapped view coords.
   * @param {number} clientX
   * @param {number} clientY
   * @returns {{ x: number, y: number }}  — view-space coords
   */
  function snapFromClient(clientX, clientY) {
    // Step 1: screen → model
    const model = RF.Geometry.viewToModel(clientX, clientY);
    // Step 2: snap in model space
    const snapped = { x: snapModel(model.x), y: snapModel(model.y) };
    // Step 3: model → view
    return RF.Geometry.modelToView(snapped.x, snapped.y);
  }

  /**
   * Snap a model-space point, return snapped model coords.
   * Use this when you need the model value (e.g. to store in DS.elements).
   */
  function snapModelPoint(modelX, modelY) {
    return {
      x: snapModel(modelX),
      y: snapModel(modelY),
    };
  }

  /**
   * Compute alignment guide candidates for a given element during drag.
   * Returns array of { axis, modelPos, label } for nearby element edges.
   *
   * @param {object} movingEl  — DS element being dragged
   * @param {number} threshold — snap proximity in model units (default 4)
   */
  function getAlignmentGuides(movingEl, threshold = 4) {
    if (typeof DS === 'undefined') return [];
    const guides = [];
    const secTop = DS.getSectionTop(movingEl.sectionId);

    DS.elements.forEach(el => {
      if (el.id === movingEl.id) return;
      const eSec = DS.getSectionTop(el.sectionId);

      // Left edge / right edge / center-x
      const candidates = [
        { axis: 'x', pos: el.x,             label: 'left' },
        { axis: 'x', pos: el.x + el.w,      label: 'right' },
        { axis: 'x', pos: el.x + el.w / 2,  label: 'cx' },
        // Top edge / bottom edge / center-y (absolute in section)
        { axis: 'y', pos: eSec + el.y,       label: 'top' },
        { axis: 'y', pos: eSec + el.y + el.h,label: 'bottom' },
        { axis: 'y', pos: eSec + el.y + el.h/2, label: 'cy' },
      ];

      candidates.forEach(c => {
        const movingPos = c.axis === 'x'
          ? movingEl.x + (c.label === 'right' ? movingEl.w : c.label === 'cx' ? movingEl.w/2 : 0)
          : (secTop + movingEl.y + (c.label === 'bottom' ? movingEl.h : c.label === 'cy' ? movingEl.h/2 : 0));

        if (Math.abs(movingPos - c.pos) <= threshold) {
          guides.push({ axis: c.axis, modelPos: c.pos, label: c.label });
        }
      });
    });

    return guides;
  }

  return {
    init() {
      _gridModel = (typeof CFG !== 'undefined' && CFG.GRID) ? CFG.GRID : 4;
      _enabled   = (typeof DS !== 'undefined') ? (DS.snapToGrid !== false) : true;
    },

    /** Snap a scalar model value */
    snap: snapModel,

    /** Snap a model-space point {x,y} → snapped {x,y} in model space */
    snapPoint: snapModelPoint,

    /**
     * Full pipeline: client → snap → view.
     * Use when positioning DOM elements from a mouse event.
     */
    snapFromClient,

    /** Returns alignment guide candidates (model space) */
    getAlignmentGuides,

    /** Enable/disable snapping */
    setEnabled(v) {
      _enabled = !!v;
      if (typeof DS !== 'undefined') DS.snapToGrid = _enabled;
    },

    toggle() { this.setEnabled(!_enabled); },
    isEnabled() { return _enabled; },

    /** Override grid size (model units) */
    setGrid(g) { _gridModel = Math.max(1, g); },
    getGrid()  { return _gridModel; },

    /**
     * Compatibility shim — replaces DS.snap() in legacy code.
     * DS.snap(v) operated in model space; this is a drop-in replacement.
     */
    legacySnap: snapModel,
  };
})();

if (typeof module !== 'undefined') module.exports = window.SnapEngine;
