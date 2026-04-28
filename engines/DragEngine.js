/**
 * DragEngine — ReportForge v19 Phase 2
 * ─────────────────────────────────────────────────────────────────
 * Manages element drag operations in MODEL SPACE.
 *
 * Pipeline:
 *   mouseMove (screen/client)
 *       ↓ RF.Geometry.viewToModel
 *   model delta
 *       ↓ _snap
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
  const S = typeof DragState !== 'undefined' ? DragState : (() => {
    // Inline fallback when DragState is not loaded (test / legacy context).
    let _a = false, _s = null;
    return { begin: (s) => { _s = s; _a = true; }, end: () => { _a = false; _s = null; },
      get isActive() { return _a; }, get session() { return _s; },
      get dragType() { return _s ? _s.type : null; }, get elId() { return _s ? _s.elId : null; } };
  })();

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

  function _snap(v) {
    return SnapCore.snapValue(v, SnapState.getGrid(), SnapState.isEnabled());
  }

  function begin(params) {
    const model = RF.Geometry.viewToModel(params.startClientX, params.startClientY);
    S.begin({
      type:           params.type || 'move',
      elId:           params.elId,
      startModelX:    model.x,
      startModelY:    model.y,
      startPositions: params.startPositions || [],
      handlePos:      params.handlePos || null,
    });
  }

  /**
   * Update drag from a pointermove event.
   * Returns { snapX, snapY, guides } in model space.
   */
  function update(clientX, clientY) {
    if (!S.isActive || !S.session) return null;
    if (typeof DS === 'undefined') return null;

    const drag = S.session;
    const model = RF.Geometry.viewToModel(clientX, clientY);
    const rawDX = model.x - drag.startModelX;
    const rawDY = model.y - drag.startModelY;

    if (drag.type === 'move') {
      return _updateMove(rawDX, rawDY);
    } else {
      return _updateResize(rawDX, rawDY);
    }
  }

  function _updateMove(rawDX, rawDY) {
    const drag = S.session;
    // Snap the primary element's new position
    const primary = drag.startPositions[0];
    if (!primary) return null;

    const rawX = primary.x + rawDX;
    const rawY = primary.y + rawDY;

    // Snap in model space
    const snappedX = _snap(rawX);
    const snappedY = _snap(rawY);

    // Alignment guides (only single-element drags)
    let guides = [];
    let alignSnapX = null, alignSnapY = null;
    if (drag.startPositions.length === 1) {
      const movingEl = DS.getElementById(drag.elId);
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
      drag.startPositions.forEach(orig => {
        const el = DS.getElementById(orig.id); if (!el) return;
        const newX = Math.max(0, Math.min(CFG.PAGE_W - el.w, orig.x + finalDX));
        el.x = _snap(newX);

        const newAbsY = orig.sectionTop + orig.y + finalDY;
        const target  = DS.getSectionAtY(newAbsY + el.h / 2);
        if (target) {
          el.sectionId = target.section.id;
          el.y = _snap(Math.max(0, newAbsY - DS.getSectionTop(target.section.id)));
        } else {
          el.y = _snap(Math.max(0, orig.y + finalDY));
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
    const drag = S.session;
    const el = DS.getElementById(drag.elId); if (!el) return null;
    const orig = drag.startPositions[0]; if (!orig) return null;
    const p = drag.handlePos || 'se';

    let { x, y, w, h } = orig;
    if (p.includes('e')) w = Math.max(CFG.MIN_EL_W || 10, _snap(w + rawDX));
    if (p.includes('s')) h = Math.max(CFG.MIN_EL_H || 4,  _snap(h + rawDY));
    if (p.includes('w')) { const nw = Math.max(CFG.MIN_EL_W || 10, _snap(w - rawDX)); x = _snap(x + w - nw); w = nw; }
    if (p.includes('n')) { const nh = Math.max(CFG.MIN_EL_H || 4,  _snap(h - rawDY)); y = _snap(y + h - nh); h = nh; }

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
    if (!S.isActive) return;
    document.querySelectorAll('.cr-element.dragging').forEach(div => {
      div.classList.remove('dragging');
    });
    if (typeof GuideEngine !== 'undefined') GuideEngine.clear();
    if (typeof DS !== 'undefined') DS.saveHistory();
    S.end();
  }

  /** Cancel drag without committing */
  function cancel() {
    document.querySelectorAll('.cr-element.dragging').forEach(div => div.classList.remove('dragging'));
    if (typeof GuideEngine !== 'undefined') GuideEngine.clear();
    S.end();
  }

  return {
    begin, update, commit, cancel,
    get isActive() { return S.isActive; },
    get dragType()  { return S.dragType; },
    state: S,
  };
})();

if (typeof module !== 'undefined') module.exports = DragEngine;
