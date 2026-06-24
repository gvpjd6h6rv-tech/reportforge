'use strict';

const SelectionInteractionPointer = (() => {
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
    const shiftKey = SelectionHitTest.isShiftSelection(e);
    if (!shiftKey && !SelectionState.isSelected(id)) {
      SelectionState.clearSelectionState();
    }
    if (shiftKey && SelectionState.isSelected(id)) {
      SelectionState.removeSelection(id);
    } else {
      SelectionState.addSelection(id);
    }
    if (typeof engine.enableSelectionOverlay === 'function') engine.enableSelectionOverlay();
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
    // Design's .cr-element wraps its text in .el-content (CanvasLayoutElements.js);
    // the real server-rendered Preview node wraps it in .cr-el-inner (_div() in
    // element_renderers.py) — both are valid editable targets depending on mode.
    const span = div.querySelector('.el-content, .cr-el-inner');
    if (!span) return;
    span.contentEditable = 'true';
    span.style.pointerEvents = 'all';
    span.focus();
    const range = document.createRange();
    range.selectNodeContents(span);
    const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
    const commit = () => {
      const text = (span.textContent || '').trim();
      const idx = DS.elements.findIndex(item => item.id === el.id);
      if (idx >= 0) {
        const model = DS.elements[idx];
        if (model.type === 'field') {
          const bindingLike = /^[A-Za-z_][A-Za-z0-9_.]*$/.test(text);
          if ((text.startsWith('{') && text.endsWith('}')) || bindingLike) {
            model.fieldPath = text.startsWith('{') && text.endsWith('}')
              ? text.slice(1, -1).trim()
              : text;
            model.content = '';
          } else {
            model.content = text;
          }
        } else {
          model.content = text;
        }
        _canonicalCanvasWriter().updateElement(model.id);
        if (typeof SelectionEngine !== 'undefined' && typeof SelectionEngine.renderHandles === 'function') {
          SelectionEngine.renderHandles();
        }
        if (typeof PropertiesEngine !== 'undefined' && typeof PropertiesEngine.render === 'function') {
          PropertiesEngine.render();
        }
      }
      span.contentEditable = 'false';
      span.style.pointerEvents = 'none';
      div.classList.remove('editing');
      SelectionState.saveHistory();
    };
    span.addEventListener('blur', commit, { once: true });
    span.addEventListener('keydown', ke => { if (ke.key === 'Escape' || ke.key === 'Enter') span.blur(); });
  }

  // RF-DESIGN-PREVIEW-DBLCLICK-EDIT-PARITY-1: pointerdown.detail is always
  // 0 (Pointer Events spec), so this is wired from a real 'dblclick'
  // listener (GlobalEventHandlers.js) instead of e.detail===2. In Preview
  // the clicked .pv-el is the invisible hit-layer proxy — editing it would
  // show no caret — so this resolves the REAL visible node in
  // #preview-content .preview-render-layer (kept in sync by
  // SelectionDragPreviewSync during drag) and edits THAT instead.
  function resolvePreviewEditableDiv(id, sectionId, rowIndexAttr) {
    const candidates = SelectionDragPreviewSync.findPreviewRenderNodes({ id, sectionId });
    if (candidates.length <= 1) return candidates[0] || null;
    if (rowIndexAttr == null) return candidates[0];
    return candidates.find((node) => node.closest(`[data-row="${rowIndexAttr}"]`)) || candidates[0];
  }

  function handleDoubleClick(e) {
    const pvNode = e.target.closest?.('.pv-el[data-origin-id]');
    const designNode = e.target.closest?.('.cr-element[data-id]');
    const id = pvNode ? pvNode.dataset.originId : (designNode ? designNode.dataset.id : null);
    if (!id) return;
    const el = SelectionState.getElementById(id);
    if (!el || (el.type !== 'text' && el.type !== 'field')) return;
    const div = pvNode
      ? resolvePreviewEditableDiv(id, el.sectionId, pvNode.dataset.rowIndex)
      : designNode;
    if (!div) return;
    e.preventDefault();
    startTextEdit(null, div, el);
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
    handleDoubleClick,
    startRubberBand,
    attachHandleEvent,
  };
})();

if (typeof module !== 'undefined') module.exports = SelectionInteractionPointer;
