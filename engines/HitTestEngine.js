/**
 * HitTestEngine — ReportForge v19 Phase 2
 * ─────────────────────────────────────────────────────────────────
 * Detects which elements and sections are under a pointer position.
 * All detection operates in MODEL SPACE.
 *
 * Pipeline:
 *   clientXY (screen)
 *       ↓ RF.Geometry.viewToModel
 *   modelXY
 *       ↓ compare against DS.elements (model coords)
 *   hit result
 *
 * Architecture rule:
 *   Never compare pixel coordinates directly against model values.
 *   Always convert via RF.Geometry before testing.
 */
'use strict';

const HitTestEngine = (() => {
  /**
   * Test a single element against a model-space point.
   * @param {object} el        — DS element
   * @param {number} modelX
   * @param {number} modelY
   * @param {number} [padding] — extra hit padding in model units
   */
  function _hitEl(el, modelX, modelY, padding = 0) {
    const secTop = (typeof DS !== 'undefined') ? DS.getSectionTop(el.sectionId) : 0;
    const elAbsY = secTop + el.y;
    return (
      modelX >= el.x - padding &&
      modelX <= el.x + el.w + padding &&
      modelY >= elAbsY - padding &&
      modelY <= elAbsY + el.h + padding
    );
  }

  /**
   * Test a section div against a model-space Y position.
   * Returns true if modelY is within the section's vertical band.
   */
  function _hitSection(sec, modelY) {
    if (typeof DS === 'undefined') return false;
    const top = DS.getSectionTop(sec.id);
    return modelY >= top && modelY < top + sec.height;
  }

  return {
    /**
     * Find all elements under clientX/clientY.
     * Returns array sorted front-to-back (highest zIndex first).
     *
     * @param {number} clientX
     * @param {number} clientY
     * @param {number} [padding]  — hit padding in model units (default 2)
     * @returns {Array<object>}   — matching DS elements
     */
    elementsAt(clientX, clientY, padding = 2) {
      if (typeof DS === 'undefined') return [];
      const model = RF.Geometry.viewToModel(clientX, clientY);
      return DS.elements
        .filter(el => _hitEl(el, model.x, model.y, padding))
        .sort((a, b) => (b.zIndex || 0) - (a.zIndex || 0));
    },

    /**
     * Find the topmost element under clientX/clientY.
     * @returns {object|null}
     */
    elementAt(clientX, clientY, padding = 2) {
      return this.elementsAt(clientX, clientY, padding)[0] || null;
    },

    /**
     * Find the section under clientX/clientY.
     * @returns {object|null}  — DS section
     */
    sectionAt(clientX, clientY) {
      if (typeof DS === 'undefined') return null;
      const model = RF.Geometry.viewToModel(clientX, clientY);
      return DS.sections.find(sec => _hitSection(sec, model.y)) || null;
    },

    /**
     * Test if a model-space rect {x,y,w,h} intersects any of the selection
     * (used for rubber-band selection).
     * Returns array of matching element IDs.
     *
     * @param {number} x1  — model rect left
     * @param {number} y1  — model rect top
     * @param {number} x2  — model rect right
     * @param {number} y2  — model rect bottom
     */
    elementsInRect(x1, y1, x2, y2) {
      if (typeof DS === 'undefined') return [];
      const rx = Math.min(x1, x2), ry = Math.min(y1, y2);
      const rw = Math.abs(x2 - x1), rh = Math.abs(y2 - y1);
      return DS.elements
        .filter(el => {
          const secTop = DS.getSectionTop(el.sectionId);
          const ey = secTop + el.y;
          return (
            el.x < rx + rw && el.x + el.w > rx &&
            ey    < ry + rh && ey + el.h  > ry
          );
        })
        .map(el => el.id);
    },

    /**
     * Convert a rubber-band DOM rect (view space) to model-space bounds.
     * Useful for rubber-band selection from mouse drag.
     *
     * @param {number} startClientX
     * @param {number} startClientY
     * @param {number} endClientX
     * @param {number} endClientY
     */
    rubberBandToModel(startClientX, startClientY, endClientX, endClientY) {
      const p1 = RF.Geometry.viewToModel(startClientX, startClientY);
      const p2 = RF.Geometry.viewToModel(endClientX, endClientY);
      return {
        x1: Math.min(p1.x, p2.x),
        y1: Math.min(p1.y, p2.y),
        x2: Math.max(p1.x, p2.x),
        y2: Math.max(p1.y, p2.y),
      };
    },

    /**
     * Test a handle zone — returns handle position name if clientX/Y
     * is within a handle of the given element.
     * Handle positions: 'n','s','e','w','nw','ne','sw','se','move'
     *
     * @param {object} el       — DS element
     * @param {number} clientX
     * @param {number} clientY
     * @param {number} [r]      — handle radius in view px (default 5)
     */
    handleAt(el, clientX, clientY, r = 5) {
      if (!el) return null;
      const secTop = (typeof DS !== 'undefined') ? DS.getSectionTop(el.sectionId) : 0;
      // Convert handle corners to view space
      const vx = RF.Geometry.scale(el.x);
      const vy = RF.Geometry.scale(secTop + el.y);
      const vw = RF.Geometry.scale(el.w);
      const vh = RF.Geometry.scale(el.h);

      // Get canvas offset
      const cR = RF.Geometry.canvasRect();
      const px  = clientX - cR.left;
      const py  = clientY - cR.top;

      const handles = [
        { pos: 'nw', x: vx,          y: vy          },
        { pos: 'n',  x: vx + vw/2,   y: vy          },
        { pos: 'ne', x: vx + vw,     y: vy          },
        { pos: 'w',  x: vx,          y: vy + vh/2   },
        { pos: 'e',  x: vx + vw,     y: vy + vh/2   },
        { pos: 'sw', x: vx,          y: vy + vh      },
        { pos: 's',  x: vx + vw/2,   y: vy + vh      },
        { pos: 'se', x: vx + vw,     y: vy + vh      },
      ];

      for (const h of handles) {
        if (Math.abs(px - h.x) <= r && Math.abs(py - h.y) <= r) return h.pos;
      }

      // Check move zone (interior)
      if (px >= vx && px <= vx + vw && py >= vy && py <= vy + vh) return 'move';
      return null;
    },
  };
})();

if (typeof module !== 'undefined') module.exports = HitTestEngine;
