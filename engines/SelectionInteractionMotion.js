'use strict';

const SelectionInteractionMotion = (() => {
  function _sectionBounds(sectionId) {
    const section = DS.getSection(sectionId);
    return {
      section,
      top: section ? DS.getSectionTop(sectionId) : 0,
      height: section ? Number(section.height) || 0 : 0,
    };
  }

  function _clampRectToSection(sectionId, rect) {
    const bounds = _sectionBounds(sectionId);
    const pageWidth = Number(CFG.PAGE_W) || 0;
    const maxX = Math.max(0, pageWidth - rect.w);
    const maxY = Math.max(0, bounds.height - rect.h);
    const next = {
      x: SelectionState.snap(Math.max(0, Math.min(rect.x, maxX))),
      y: SelectionState.snap(Math.max(0, Math.min(rect.y, maxY))),
      w: SelectionState.snap(Math.max(CFG.MIN_EL_W, Math.min(rect.w, pageWidth))),
      h: SelectionState.snap(Math.max(CFG.MIN_EL_H, Math.min(rect.h, bounds.height || rect.h))),
    };
    next.w = SelectionState.snap(Math.max(CFG.MIN_EL_W, Math.min(next.w, Math.max(CFG.MIN_EL_W, pageWidth - next.x))));
    next.h = SelectionState.snap(Math.max(CFG.MIN_EL_H, Math.min(next.h, Math.max(CFG.MIN_EL_H, bounds.height - next.y))));
    return next;
  }

  function onMouseMove(engine, e) {
    const pos = getCanvasPos(e);
    document.getElementById('sb-pos').textContent = `X: ${Math.round(pos.x)}   Y: ${Math.round(pos.y)}`;
    RulerEngine.updateCursor(pos.x, pos.y);
    if (!engine._drag) return;
    const { type } = engine._drag;
    if (type === 'move') _doMove(engine, pos, e);
    else if (type === 'resize') _doResize(engine, pos, e);
    else if (type === 'rubber') _doRubberBand(engine, pos);
    else if (type === 'insert') InsertEngine.onMouseMove(pos);
  }

  function _doMove(engine, pos, e) {
    const d = engine._drag;
    // RF-PARITY-AUDIT-1: no pre-push — HistoryEngine.push delegates to
    // DS.saveHistory() now; the post-drag SelectionState.saveHistory()
    // below already covers this, a pre-push would just double-save.
    d.moved = true;
    const dx = pos.x - d.startX;
    const dy = pos.y - d.startY;
    d.startPositions.forEach(orig => {
      const el = SelectionState.getElementById(orig.id); if (!el) return;
      const sectionBounds = _sectionBounds(orig.sectionId);
      const newX = SelectionState.snap(Math.max(0, Math.min(orig.x + dx, Math.max(0, CFG.PAGE_W - el.w))));
      const newY = SelectionState.snap(Math.max(0, Math.min(orig.y + dy, Math.max(0, sectionBounds.height - el.h))));
      engine.updateElementLayout(el.id, {
        x: newX,
        y: newY,
      }, 'SelectionInteraction.move');
      const div = document.querySelector(`.cr-element[data-id="${orig.id}"]`);
      if (div) {
        div.classList.add('dragging');
        SelectionDragPreviewSync.dragTransformStyle(div, el, orig, sectionBounds.top, dx, dy);
      }
      if (DS.previewMode) {
        document.querySelectorAll(`.pv-el[data-origin-id="${orig.id}"]`).forEach(pv => {
          pv.classList.add('dragging');
          SelectionDragPreviewSync.dragTransformStyle(pv, el, orig, sectionBounds.top, dx, dy);
        });
        SelectionDragPreviewSync.findPreviewRenderNodes(orig).forEach(node => {
          SelectionDragPreviewSync.dragTransformStyle(node, el, orig, sectionBounds.top, dx, dy);
        });
      }
    });
    if (!d._rafPending) {
      d._rafPending = true;
      requestAnimationFrame(() => {
        d._rafPending = false;
        if (typeof RenderSchedulerScope !== 'undefined' && typeof RenderSchedulerScope.flushSync === 'function') {
          RenderSchedulerScope.flushSync(() => {
            engine.renderHandles();
            if (typeof PropertiesEngine !== 'undefined' && DS.getSelectedElements().length === 1) {
              const el = DS.getSelectedElements()[0];
              if (el) PropertiesEngine.updatePositionFields(el);
            }
            if (DS.selection.size === 1) {
              const el = DS.getElementById([...DS.selection][0]);
              if (el) document.getElementById('sb-pos').textContent = `X: ${el.x}   Y: ${el.y}`;
            }
          }, 'SelectionInteraction.move.renderHandles');
        } else {
          engine.renderHandles();
          if (typeof PropertiesEngine !== 'undefined' && DS.getSelectedElements().length === 1) {
            const el = DS.getSelectedElements()[0];
            if (el) PropertiesEngine.updatePositionFields(el);
          }
          if (DS.selection.size === 1) {
            const el = DS.getElementById([...DS.selection][0]);
            if (el) document.getElementById('sb-pos').textContent = `X: ${el.x}   Y: ${el.y}`;
          }
        }
      });
    }
  }

  function _doResize(engine, pos, e) {
    const d = engine._drag;
    const el = SelectionState.getElementById(d.elId); if (!el) return;
    const dx = pos.x - d.startX;
    const dy = pos.y - d.startY;
    let { origX: x, origY: y, origW: w, origH: h } = d;
    const p = d.handlePos;
    if (p.includes('e')) w = Math.max(CFG.MIN_EL_W, SelectionState.snap(w + dx));
    if (p.includes('s')) h = Math.max(CFG.MIN_EL_H, SelectionState.snap(h + dy));
    if (p.includes('w')) { const nw = Math.max(CFG.MIN_EL_W, SelectionState.snap(w - dx)); x = SelectionState.snap(x + w - nw); w = nw; }
    if (p.includes('n')) { const nh = Math.max(CFG.MIN_EL_H, SelectionState.snap(h - dy)); y = SelectionState.snap(y + h - nh); h = nh; }
    const clamped = _clampRectToSection(el.sectionId, { x, y, w, h });
    engine.updateElementLayout(el.id, clamped, 'SelectionInteraction.resize');
    _canonicalCanvasWriter().updateElementPosition(d.elId);
    if (DS.previewMode) {
      document.querySelectorAll(`.pv-el[data-origin-id="${d.elId}"]`).forEach(pv => {
        pv.style.left = el.x + 'px';
        pv.style.top = el.y + 'px';
        pv.style.width = el.w + 'px';
        pv.style.height = el.h + 'px';
      });
      SelectionDragPreviewSync.findPreviewRenderNodes({ id: d.elId, sectionId: el.sectionId }).forEach(node => {
        node.style.left = el.x + 'px';
        node.style.top = el.y + 'px';
        node.style.width = el.w + 'px';
        node.style.height = el.h + 'px';
      });
    }
    engine.renderHandles();
    document.getElementById('sb-size').textContent = `W: ${w}  H: ${h}`;
    document.getElementById('sb-size').style.display = 'flex';
    PropertiesEngine.updatePositionFields(el);
  }

  function _doRubberBand(engine, pos) {
    const d = engine._drag;
    const rb = document.getElementById('rubber-band');
    const band = SelectionGeometry.rubberBandRect(
      { x: d.startX, y: d.startY },
      { x: pos.x, y: pos.y },
    );
    rb.style.left = band.left + 'px';
    rb.style.top = band.top + 'px';
    rb.style.width = band.width + 'px';
    rb.style.height = band.height + 'px';
    SelectionState.clearSelectionState();
    DS.elements.forEach(el => {
      const rect = {
        left: el.x,
        top: SelectionState.getSectionTop(el.sectionId) + el.y,
        width: el.w,
        height: el.h,
      };
      if (rect && SelectionGeometry.rectOverlapsBand(rect, band)) SelectionState.addSelection(el.id);
    });
    engine.renderHandles();
  }

  function onMouseUp(engine, e) {
    if (!engine._drag) return;
    const d = engine._drag;
    const isCancel = e && e.phase === 'cancel';
    document.querySelectorAll('.cr-element.dragging').forEach(div => {
      div.classList.remove('dragging');
      div.style.transform = '';
    });
    document.querySelectorAll('.pv-el.dragging').forEach(div => {
      div.classList.remove('dragging');
      div.style.transform = '';
    });
    if (!isCancel && d.type === 'move' && d.moved) SelectionState.saveHistory();
    if (!isCancel && d.type === 'resize') SelectionState.saveHistory();
    if (d.type === 'rubber') {
      document.getElementById('rubber-band').style.display = 'none';
      if (!isCancel && SelectionState.selectedIds().size > 0) {
        PropertiesEngine.render(); FormatEngine.updateToolbar();
      }
    }
    if (!isCancel && d.type === 'insert') InsertEngine.onMouseUp(e);
    engine._drag = null;
    if (!isCancel && (d.type === 'move' || d.type === 'resize')) {
      engine.renderHandles();
    }
  }

  return {
    onMouseMove,
    _doMove,
    _doResize,
    _doRubberBand,
    onMouseUp,
  };
})();

if (typeof module !== 'undefined') module.exports = SelectionInteractionMotion;
