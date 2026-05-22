'use strict';

const SelectionInteractionMotion = (() => {
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
    d.moved = true;
    const dx = pos.x - d.startX;
    const dy = pos.y - d.startY;
    d.startPositions.forEach(orig => {
      const el = SelectionState.getElementById(orig.id); if (!el) return;
      const rawAbsX = orig.x + dx;
      const rawAbsY = orig.sectionTop + orig.y + dy;
      let newX = SelectionState.snap(rawAbsX);
      const target = SelectionState.getSectionAtY(rawAbsY + el.h / 2);
      if (target) {
        DS.updateElementLayout(el.id, {
          sectionId: target.section.id,
          y: SelectionState.snap(Math.max(0, rawAbsY - SelectionState.getSectionTop(target.section.id))),
        }, 'SelectionInteractionMotion.move');
      } else {
        DS.updateElementLayout(el.id, { y: SelectionState.snap(Math.max(0, orig.y + dy)) }, 'SelectionInteractionMotion.move');
      }
      DS.updateElementLayout(el.id, { x: SelectionState.snap(Math.max(0, Math.min(CFG.PAGE_W - el.w, newX))) }, 'SelectionInteractionMotion.move');
      const div = document.querySelector(`.cr-element[data-id="${orig.id}"]`);
      if (div) {
        div.classList.add('dragging');
        div.style.left = el.x + 'px';
        div.style.top = el.y + 'px';
        div.style.transform = `translate(${(rawAbsX - el.x).toFixed(3)}px, ${(rawAbsY - (SelectionState.getSectionTop(el.sectionId) + el.y)).toFixed(3)}px)`;
      }
      if (DS.previewMode) {
        document.querySelectorAll(`.pv-el[data-origin-id="${orig.id}"]`).forEach(pv => {
          pv.classList.add('dragging');
          pv.style.left = el.x + 'px';
          pv.style.top = el.y + 'px';
          pv.style.transform = `translate(${(rawAbsX - el.x).toFixed(3)}px, ${(rawAbsY - (SelectionState.getSectionTop(el.sectionId) + el.y)).toFixed(3)}px)`;
        });
      }
    });
    if (!d._rafPending) {
      d._rafPending = true;
      requestAnimationFrame(() => {
        d._rafPending = false;
        engine.renderHandles();
        if (DS.selection.size === 1) {
          const el = DS.getElementById([...DS.selection][0]);
          if (el) document.getElementById('sb-pos').textContent = `X: ${el.x}   Y: ${el.y}`;
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
    DS.updateElementLayout(el.id, { x, y, w, h }, 'SelectionInteractionMotion.resize');
    _canonicalCanvasWriter().updateElementPosition(d.elId);
    if (DS.previewMode) {
      document.querySelectorAll(`.pv-el[data-origin-id="${d.elId}"]`).forEach(pv => {
        pv.style.left = el.x + 'px';
        pv.style.top = el.y + 'px';
        pv.style.width = el.w + 'px';
        pv.style.height = el.h + 'px';
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
