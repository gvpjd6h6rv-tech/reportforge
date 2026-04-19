'use strict';

const SelectionInteraction = (() => {
  function useCentralRouter() {
    return window.RF?.RuntimeServices?.isEngineCoreInteractionEnabled?.() !== false;
  }

  function onElementPointerDown(engine, e, id) {
    if (e.button !== 0) return;
    const el = SelectionState.getElementById(id); if (!el) return;
    const div = SelectionHitTest.resolveElementDiv(e.target, id);
    if (!div) return;
    const pointerId = SelectionHitTest.resolvePointerId(e);
    if (div.setPointerCapture && typeof pointerId === 'number') div.setPointerCapture(pointerId);
    if (e.detail === 2 && el.type === 'text') {
      startTextEdit(engine, div, el); return;
    }
    const shiftKey = SelectionHitTest.isShiftSelection(e);
    if (!shiftKey && !SelectionState.isSelected(id)) {
      SelectionState.clearSelectionState();
    }
    if (shiftKey && SelectionState.isSelected(id)) {
      SelectionState.removeSelection(id);
    } else {
      SelectionState.addSelection(id);
    }
    engine.renderHandles();
    PropertiesEngine.render();
    FormatEngine.updateToolbar();
    const canvasPos = getCanvasPos(e);
    const selectedElements = DS.getSelectedElements();
    engine._drag = {
      type: 'move',
      startX: canvasPos.x,
      startY: canvasPos.y,
      subjectIds: selectedElements.map(item => item.id),
      startPositions: selectedElements.map(item => ({ id: item.id, x: item.x, y: item.y, sectionId: item.sectionId, sectionTop: SelectionState.getSectionTop(item.sectionId) })),
      moved: false,
    };
  }

  function onHandlePointerDown(engine, e, pos) {
    if (e.button !== 0) return;
    const pos2 = getCanvasPos(e);
    const sel = DS.getSelectedElements();
    if (sel.length === 0) return;
    const el = sel[0];
    engine._drag = {
      type: 'resize',
      handlePos: pos,
      elId: el.id,
      startX: pos2.x,
      startY: pos2.y,
      origX: el.x,
      origY: el.y,
      origW: el.w,
      origH: el.h,
    };
  }

  function attachElementEvents(engine, div, id) {
    if (!useCentralRouter()) {
      div.addEventListener('pointerdown', e => {
        e.stopPropagation();
        e.preventDefault();
        onElementPointerDown(engine, e, id);
      });
    }
    div.addEventListener('contextmenu', e => {
      e.preventDefault();
      e.stopPropagation();
      if (!SelectionState.isSelected(id)) {
        SelectionState.selectOnly(id);
        engine.renderHandles();
      }
      ContextMenuEngine.show(e.clientX, e.clientY, 'element');
    });
  }

  function startTextEdit(engine, div, el) {
    SelectionState.selectOnly(el.id);
    div.classList.add('editing', 'selected');
    const span = div.querySelector('.el-content');
    if (!span) return;
    span.contentEditable = 'true';
    span.style.pointerEvents = 'all';
    span.focus();
    const range = document.createRange();
    range.selectNodeContents(span);
    const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
    const commit = () => {
      span.contentEditable = 'false';
      span.style.pointerEvents = 'none';
      div.classList.remove('editing');
      SelectionState.saveHistory();
      const idx = DS.elements.findIndex(item => item.id === el.id);
      if (idx >= 0) { DS.elements[idx].content = span.textContent; }
    };
    span.addEventListener('blur', commit, { once: true });
    span.addEventListener('keydown', ke => { if (ke.key === 'Escape' || ke.key === 'Enter') span.blur(); });
  }

  function startRubberBand(engine, e) {
    const pos = getCanvasPos(e);
    engine._drag = {
      type: 'rubber',
      startX: pos.x,
      startY: pos.y,
      curX: pos.x,
      curY: pos.y,
    };
    const rb = document.getElementById('rubber-band');
    rb.style.display = 'block';
    rb.style.left = pos.x + 'px';
    rb.style.top = pos.y + 'px';
    rb.style.width = '0';
    rb.style.height = '0';
  }

  function attachHandleEvent(engine, handleDiv, pos) {
    if (!useCentralRouter()) {
      handleDiv.addEventListener('pointerdown', e => {
        e.stopPropagation();
        e.preventDefault();
        onHandlePointerDown(engine, e, pos);
      });
    }
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
    d.moved = true;
    const dx = pos.x - d.startX;
    const dy = pos.y - d.startY;
    const zoom = RF.Geometry.zoom();
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
        });
      } else {
        DS.updateElementLayout(el.id, { y: SelectionState.snap(Math.max(0, orig.y + dy)) });
      }
      DS.updateElementLayout(el.id, { x: SelectionState.snap(Math.max(0, Math.min(CFG.PAGE_W - el.w, newX))) });
      const div = document.querySelector(`.cr-element[data-id="${orig.id}"]`);
      if (div) {
        div.classList.add('dragging');
        const _mp = RF.Geometry.modelToView(el.x, el.y);
        div.style.left = _mp.x + 'px';
        div.style.top = _mp.y + 'px';
        const snappedAbsY = SelectionState.getSectionTop(el.sectionId) + el.y;
        div.style.transform = `translate(${((rawAbsX - el.x) * zoom).toFixed(3)}px, ${((rawAbsY - snappedAbsY) * zoom).toFixed(3)}px)`;
      }
      if (DS.previewMode) {
        document.querySelectorAll(`.pv-el[data-origin-id="${orig.id}"]`).forEach(pv => {
          pv.classList.add('dragging');
          const _pp = RF.Geometry.rectToView(el);
          pv.style.left = _pp.left + 'px';
          pv.style.top = _pp.top + 'px';
          const snappedAbsY = SelectionState.getSectionTop(el.sectionId) + el.y;
          pv.style.transform = `translate(${((rawAbsX - el.x) * zoom).toFixed(3)}px, ${((rawAbsY - snappedAbsY) * zoom).toFixed(3)}px)`;
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
    DS.updateElementLayout(el.id, { x, y, w, h });
    _canonicalCanvasWriter().updateElementPosition(d.elId);
    if (DS.previewMode) {
      document.querySelectorAll(`.pv-el[data-origin-id="${d.elId}"]`).forEach(pv => {
        const _pp = RF.Geometry.rectToView(el);
        pv.style.left = _pp.left + 'px';
        pv.style.top = _pp.top + 'px';
        pv.style.width = _pp.width + 'px';
        pv.style.height = _pp.height + 'px';
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
      const rect = CanvasGeometry.elementViewRect(el, SelectionState.getSectionTop(el.sectionId), RF.Geometry.zoom());
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
    useCentralRouter,
    onElementPointerDown,
    onHandlePointerDown,
    attachElementEvents,
    startTextEdit,
    startRubberBand,
    attachHandleEvent,
    onMouseMove,
    onMouseUp,
    _doMove,
    _doResize,
    _doRubberBand,
  };
})();

if (typeof module !== 'undefined') module.exports = SelectionInteraction;
