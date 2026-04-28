'use strict';

const SelectionInteractionPointer = (() => {
  function useCentralRouter() {
    return typeof window !== 'undefined' && window.RF?.RuntimeServices?.isEngineCoreInteractionEnabled?.() !== false;
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

  return {
    useCentralRouter,
    onElementPointerDown,
    onHandlePointerDown,
    attachElementEvents,
    startTextEdit,
    startRubberBand,
    attachHandleEvent,
  };
})();

if (typeof module !== 'undefined') module.exports = SelectionInteractionPointer;
