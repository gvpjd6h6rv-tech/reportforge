/**
 * DragEngine — ReportForge v19 Phase 2
 * ─────────────────────────────────────────────────────────────────
 * Manages element drag operations in MODEL SPACE.
 *
 * Pipeline:
 *   mouseMove (screen/client)
 *       ↓ RF.Geometry.viewToModel
 *   model delta
 *       ↓ SnapEngine.snap
 *   snapped model position
 *       ↓ AlignmentEngine.compute  → guide candidates
 *       ↓ GuideEngine.show
 *       ↓ ElementLayoutEngine.updatePosition (view = RF.Geometry.modelToView)
 *
 * This engine delegates actual DOM writes to the existing SelectionEngine
 * methods. It provides the v19 architecture wrapper with model-space
 * guarantees and RenderScheduler batching.
 */
'use strict';

const DragEngine = (() => {
  let _active = false;
  let _drag   = null;   // {elId, startModelX, startModelY, startPositions}

  /**
   * Begin a drag operation.
   * @param {object} params
   * @param {string} params.type          — 'move' | 'resize'
   * @param {string} params.elId          — primary element ID
   * @param {number} params.startClientX
   * @param {number} params.startClientY
   * @param {Array}  params.startPositions — [{id, x, y, w, h, sectionTop}]
   * @param {string} [params.handlePos]   — resize handle name
   */
  function begin(params) {
    const model = RF.Geometry.viewToModel(params.startClientX, params.startClientY);
    _drag = {
      type:           params.type || 'move',
      elId:           params.elId,
      startModelX:    model.x,
      startModelY:    model.y,
      startPositions: params.startPositions || [],
      handlePos:      params.handlePos || null,
    };
    _active = true;
  }

  /**
   * Update drag from a pointermove event.
   * Returns { snapX, snapY, guides } in model space.
   */
  function update(clientX, clientY) {
    if (!_active || !_drag) return null;
    if (typeof DS === 'undefined') return null;

    // Screen → model delta
    const model = RF.Geometry.viewToModel(clientX, clientY);
    const rawDX = model.x - _drag.startModelX;
    const rawDY = model.y - _drag.startModelY;

    if (_drag.type === 'move') {
      return _updateMove(rawDX, rawDY);
    } else {
      return _updateResize(rawDX, rawDY);
    }
  }

  function _updateMove(rawDX, rawDY) {
    // Snap the primary element's new position
    const primary = _drag.startPositions[0];
    if (!primary) return null;

    const rawX = primary.x + rawDX;
    const rawY = primary.y + rawDY;

    // Snap in model space
    const snappedX = SnapEngine.snap(rawX);
    const snappedY = SnapEngine.snap(rawY);

    // Alignment guides (only single-element drags)
    let guides = [];
    let alignSnapX = null, alignSnapY = null;
    if (_drag.startPositions.length === 1) {
      const movingEl = DS.getElementById(_drag.elId);
      if (movingEl && typeof AlignmentEngine !== 'undefined') {
        const result = AlignmentEngine.compute(movingEl);
        guides = result.guides;
        alignSnapX = result.snapX;
        alignSnapY = result.snapY;
        if (typeof GuideEngine !== 'undefined') GuideEngine.show(guides);
      }
    }

    // Apply positions to all selected elements
    const finalDX = (alignSnapX !== null ? alignSnapX : snappedX) - primary.x;
    const finalDY = (alignSnapY !== null ? alignSnapY : snappedY) - primary.y;

    RenderScheduler.layout(() => {
      _drag.startPositions.forEach(orig => {
        const el = DS.getElementById(orig.id); if (!el) return;
        const newX = Math.max(0, Math.min(CFG.PAGE_W - el.w, orig.x + finalDX));
        el.x = SnapEngine.snap(newX);

        const newAbsY = orig.sectionTop + orig.y + finalDY;
        const target  = DS.getSectionAtY(newAbsY + el.h / 2);
        if (target) {
          el.sectionId = target.section.id;
          el.y = SnapEngine.snap(Math.max(0, newAbsY - DS.getSectionTop(target.section.id)));
        } else {
          el.y = SnapEngine.snap(Math.max(0, orig.y + finalDY));
        }

        // Update DOM via RF.Geometry
        const div = document.querySelector(`.cr-element[data-id="${orig.id}"]`);
        if (div) {
          const p = RF.Geometry.modelToView(el.x, el.y);
          div.style.left = p.x + 'px';
          div.style.top  = p.y + 'px';
          div.classList.add('dragging');
        }
      });
    });

    return { guides, snappedX, snappedY, finalDX, finalDY };
  }

  function _updateResize(rawDX, rawDY) {
    const el = DS.getElementById(_drag.elId); if (!el) return null;
    const orig = _drag.startPositions[0]; if (!orig) return null;
    const p = _drag.handlePos || 'se';

    let { x, y, w, h } = orig;
    if (p.includes('e')) w = Math.max(CFG.MIN_EL_W || 10, SnapEngine.snap(w + rawDX));
    if (p.includes('s')) h = Math.max(CFG.MIN_EL_H || 4,  SnapEngine.snap(h + rawDY));
    if (p.includes('w')) { const nw = Math.max(CFG.MIN_EL_W || 10, SnapEngine.snap(w - rawDX)); x = SnapEngine.snap(x + w - nw); w = nw; }
    if (p.includes('n')) { const nh = Math.max(CFG.MIN_EL_H || 4,  SnapEngine.snap(h - rawDY)); y = SnapEngine.snap(y + h - nh); h = nh; }

    RenderScheduler.layout(() => {
      el.x = x; el.y = y; el.w = w; el.h = h;
      const div = document.querySelector(`.cr-element[data-id="${el.id}"]`);
      if (div) {
        const vp = RF.Geometry.modelToView(el.x, el.y);
        div.style.left   = vp.x + 'px';
        div.style.top    = vp.y + 'px';
        div.style.width  = RF.Geometry.scale(el.w) + 'px';
        div.style.height = RF.Geometry.scale(el.h) + 'px';
      }
    });

    return { resized: true };
  }

  /**
   * Commit the drag (on mouseup).
   * Removes dragging class, clears guides, saves history.
   */
  function commit() {
    if (!_active) return;
    _active = false;

    document.querySelectorAll('.cr-element.dragging').forEach(div => {
      div.classList.remove('dragging');
    });
    if (typeof GuideEngine !== 'undefined') GuideEngine.clear();
    if (typeof DS !== 'undefined') DS.saveHistory();
    _drag = null;
  }

  /** Cancel drag without committing */
  function cancel() {
    _active = false;
    document.querySelectorAll('.cr-element.dragging').forEach(div => div.classList.remove('dragging'));
    if (typeof GuideEngine !== 'undefined') GuideEngine.clear();
    _drag = null;
  }

  return {
    begin, update, commit, cancel,
    get isActive() { return _active; },
    get dragType()  { return _drag ? _drag.type : null; },
  };
})();

if (typeof module !== 'undefined') module.exports = DragEngine;
