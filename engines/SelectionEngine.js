/**
 * SelectionEngineV19 — ReportForge v19.6
 * ─────────────────────────────────────────────────────────────────
 * FULL implementation — zero dependency on monolithic SelectionEngine.
 *
 * Owns:
 *   attachElementEvents()  — per-element pointer events
 *   attachHandleEvent()    — resize handle events
 *   renderHandles()        — selection box + handles rendering
 *   startTextEdit()        — in-place text editing
 *   startRubberBand()      — rubber-band start
 *   _doMove()              — drag move (model space via RF.Geometry)
 *   _doResize()            — drag resize (model space)
 *   _doRubberBand()        — rubber-band update
 *   clearSelection()       — clear DS.selection + re-render
 *   onMouseMove/Up/Down    — event routing
 *
 * Architecture: all positions via RF.Geometry — never raw DS.zoom.
 */
'use strict';

const SelectionEngineV19 = (() => {
  let _drag = null;

  // ── Helpers ───────────────────────────────────────────────────────
  function _CE() {
    return (typeof EngineRegistry !== 'undefined' && EngineRegistry.get('CanvasEngineV19'))
        || (typeof CanvasLayoutEngine !== 'undefined' ? CanvasLayoutEngine : null)
        || (typeof CanvasEngine !== 'undefined' ? CanvasEngine : null);
  }

  function _getCanvasPos(e) {
    return RF.Geometry.toCanvasSpace(e.clientX, e.clientY);
  }

  // ── renderHandles ────────────────────────────────────────────────
  function renderHandles() {
    RF.Geometry.invalidate();
    const layer = document.getElementById('handles-layer');
    if (!layer) return;
    while (layer.firstChild) layer.removeChild(layer.firstChild);

    document.querySelectorAll('.cr-element').forEach(d => {
      d.classList.toggle('selected', DS.selection.has(d.dataset.id));
    });
    if (DS.selection.size === 0) return;

    if (DS.selection.size === 1) {
      const id  = [...DS.selection][0];
      const el  = DS.getElementById(id);
      if (!el) return;
      const elDiv = document.querySelector(`.cr-element[data-id="${id}"]`);
      const gr  = RF.Geometry.elementRect(elDiv);
      let absX, absY, absW, absH;
      if (gr) {
        const clR = RF.Geometry.canvasRect();
        absX = gr.left - clR.left;
        absY = gr.top  - clR.top;
        absW = gr.width;
        absH = gr.height;
      } else {
        absX = RF.Geometry.scale(el.x);
        absY = RF.Geometry.scale(DS.getSectionTop(el.sectionId) + el.y);
        absW = RF.Geometry.scale(el.w);
        absH = RF.Geometry.scale(el.h);
      }

      // Selection box
      const box = document.createElement('div');
      box.className = 'sel-box';
      box.style.cssText = `position:absolute;left:${absX}px;top:${absY}px;width:${absW}px;height:${absH}px;pointer-events:none`;
      layer.appendChild(box);

      // Resize handles
      const POSITIONS = [
        {pos:'nw', sx:absX,           sy:absY          },
        {pos:'n',  sx:absX+absW/2,    sy:absY          },
        {pos:'ne', sx:absX+absW,      sy:absY          },
        {pos:'w',  sx:absX,           sy:absY+absH/2   },
        {pos:'e',  sx:absX+absW,      sy:absY+absH/2   },
        {pos:'sw', sx:absX,           sy:absY+absH     },
        {pos:'s',  sx:absX+absW/2,    sy:absY+absH     },
        {pos:'se', sx:absX+absW,      sy:absY+absH     },
      ];
      POSITIONS.forEach(({pos, sx, sy}) => {
        const h = document.createElement('div');
        h.className = `sel-handle sel-handle-${pos}`;
        h.dataset.handlePos = pos;
        h.style.cssText = `position:absolute;left:${sx-3}px;top:${sy-3}px;width:6px;height:6px;cursor:${pos}-resize`;
        attachHandleEvent(h, pos);
        layer.appendChild(h);
      });
    } else {
      // Multi-selection: show bounding box only
      let minX=Infinity, minY=Infinity, maxX=-Infinity, maxY=-Infinity;
      DS.getSelectedElements().forEach(el => {
        const st = DS.getSectionTop(el.sectionId);
        const vx = RF.Geometry.scale(el.x);
        const vy = RF.Geometry.scale(st + el.y);
        const vw = RF.Geometry.scale(el.w);
        const vh = RF.Geometry.scale(el.h);
        minX = Math.min(minX, vx); minY = Math.min(minY, vy);
        maxX = Math.max(maxX, vx+vw); maxY = Math.max(maxY, vy+vh);
      });
      const box = document.createElement('div');
      box.className = 'sel-box sel-box-multi';
      box.style.cssText = `position:absolute;left:${minX}px;top:${minY}px;width:${maxX-minX}px;height:${maxY-minY}px;pointer-events:none`;
      layer.appendChild(box);
    }
  }

  // ── Event attachment ─────────────────────────────────────────────
  function attachElementEvents(div, id) {
    div.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      e.stopPropagation(); e.preventDefault();
      div.setPointerCapture && div.setPointerCapture(e.pointerId);
      const el = DS.getElementById(id);
      if (!el) return;

      // Double-click: edit text
      if (e.detail === 2 && el.type === 'text') {
        startTextEdit(div, el);
        return;
      }

      // Selection
      if (!e.shiftKey && !DS.selection.has(id)) DS.selection.clear();
      if (e.shiftKey && DS.selection.has(id)) DS.selection.delete(id);
      else DS.selection.add(id);

      renderHandles();
      if (typeof PropertiesEngine !== 'undefined') PropertiesEngine.render();
      if (typeof FormatEngine     !== 'undefined') FormatEngine.updateToolbar();

      const canvasPos = _getCanvasPos(e);
      _drag = {
        type: 'move',
        startX: canvasPos.x,
        startY: canvasPos.y,
        startPositions: DS.getSelectedElements().map(el => ({
          id: el.id, x: el.x, y: el.y,
          sectionId: el.sectionId,
          sectionTop: DS.getSectionTop(el.sectionId),
        })),
        moved: false,
      };
    });

    div.addEventListener('contextmenu', e => {
      e.preventDefault(); e.stopPropagation();
      if (!DS.selection.has(id)) { DS.selection.clear(); DS.selection.add(id); renderHandles(); }
      if (typeof ContextMenuEngine !== 'undefined') ContextMenuEngine.show(e.clientX, e.clientY, 'element');
    });
  }

  function attachHandleEvent(handleDiv, pos) {
    handleDiv.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      e.stopPropagation(); e.preventDefault();
      const pos2 = _getCanvasPos(e);
      const sel  = DS.getSelectedElements();
      if (sel.length === 0) return;
      const el = sel[0];
      _drag = {
        type: 'resize', handlePos: pos, elId: el.id,
        startX: pos2.x, startY: pos2.y,
        origX: el.x, origY: el.y, origW: el.w, origH: el.h,
      };
    });
  }

  // ── Text edit ────────────────────────────────────────────────────
  function startTextEdit(div, el) {
    DS.selection.clear(); DS.selection.add(el.id);
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
      const idx = DS.elements.findIndex(e => e.id === el.id);
      if (idx >= 0) DS.elements[idx].content = span.textContent;
      DS.saveHistory();
    };
    span.addEventListener('blur', commit, { once: true });
    span.addEventListener('keydown', ke => { if (ke.key === 'Escape' || ke.key === 'Enter') span.blur(); });
  }

  // ── Rubber band ──────────────────────────────────────────────────
  function startRubberBand(e) {
    const pos = _getCanvasPos(e);
    _drag = { type: 'rubber', startX: pos.x, startY: pos.y, curX: pos.x, curY: pos.y };
    const rb = document.getElementById('rubber-band');
    if (!rb) return;
    rb.style.display = 'block';
    rb.style.left = pos.x + 'px'; rb.style.top = pos.y + 'px';
    rb.style.width = '0'; rb.style.height = '0';
  }

  // ── Drag handlers ────────────────────────────────────────────────
  function _doMove(pos) {
    const d = _drag;
    d.moved = true;
    const dx = pos.x - d.startX, dy = pos.y - d.startY;

    // Show alignment guides
    if (typeof AlignmentGuides !== 'undefined' && DS.selection.size === 1) {
      AlignmentGuides.show([...DS.selection][0]);
    }

    d.startPositions.forEach(orig => {
      const el = DS.getElementById(orig.id);
      if (!el) return;
      const newAbsY = orig.sectionTop + orig.y + dy;
      const newX    = DS.snap(orig.x + dx);
      const target  = DS.getSectionAtY(newAbsY + el.h / 2);

      if (target) {
        el.sectionId = target.section.id;
        el.y = DS.snap(Math.max(0, newAbsY - DS.getSectionTop(target.section.id)));
      } else {
        el.y = DS.snap(Math.max(0, orig.y + dy));
      }
      el.x = DS.snap(Math.max(0, Math.min(CFG.PAGE_W - el.w, newX)));

      const div = document.querySelector(`.cr-element[data-id="${orig.id}"]`);
      if (div) {
        div.classList.add('dragging');
        const mp = RF.Geometry.modelToView(el.x, el.y);
        div.style.left = mp.x + 'px';
        div.style.top  = mp.y + 'px';
      }
    });

    if (!d._rafPending) {
      d._rafPending = true;
      requestAnimationFrame(() => {
        d._rafPending = false;
        renderHandles();
        if (DS.selection.size === 1) {
          const el = DS.getElementById([...DS.selection][0]);
          if (el) {
            const sb = document.getElementById('sb-pos');
            if (sb) sb.textContent = `X: ${el.x}   Y: ${el.y}`;
          }
        }
      });
    }
  }

  function _doResize(pos) {
    const d  = _drag;
    const el = DS.getElementById(d.elId);
    if (!el) return;
    const dx = pos.x - d.startX, dy = pos.y - d.startY;
    let { origX: x, origY: y, origW: w, origH: h } = d;
    const p = d.handlePos;
    if (p.includes('e')) w = Math.max(CFG.MIN_EL_W, DS.snap(w + dx));
    if (p.includes('s')) h = Math.max(CFG.MIN_EL_H, DS.snap(h + dy));
    if (p.includes('w')) { const nw = Math.max(CFG.MIN_EL_W, DS.snap(w - dx)); x = DS.snap(x + w - nw); w = nw; }
    if (p.includes('n')) { const nh = Math.max(CFG.MIN_EL_H, DS.snap(h - dy)); y = DS.snap(y + h - nh); h = nh; }
    el.x = x; el.y = y; el.w = w; el.h = h;

    const ce = _CE();
    if (ce) ce.updateElementPosition(d.elId);

    renderHandles();
    const sbSize = document.getElementById('sb-size');
    if (sbSize) { sbSize.textContent = `W: ${w}  H: ${h}`; sbSize.style.display = 'flex'; }
    if (typeof PropertiesEngine !== 'undefined' && PropertiesEngine.updatePositionFields)
      PropertiesEngine.updatePositionFields(el);
  }

  function _doRubberBand(pos) {
    const d = _drag;
    const rb = document.getElementById('rubber-band');
    if (!rb) return;
    const x = Math.min(d.startX, pos.x), y = Math.min(d.startY, pos.y);
    const w = Math.abs(pos.x - d.startX), h = Math.abs(pos.y - d.startY);
    rb.style.left = x + 'px'; rb.style.top = y + 'px';
    rb.style.width = w + 'px'; rb.style.height = h + 'px';
    DS.selection.clear();
    DS.elements.forEach(el => {
      const st = DS.getSectionTop(el.sectionId);
      if (el.x < x + w && el.x + el.w > x && st + el.y < y + h && st + el.y + el.h > y)
        DS.selection.add(el.id);
    });
  }

  // ── Mouse event handlers ─────────────────────────────────────────
  function onMouseMove(e) {
    const pos = _getCanvasPos(e);
    const sb = document.getElementById('sb-pos');
    if (sb) sb.textContent = `X: ${Math.round(pos.x)}   Y: ${Math.round(pos.y)}`;
    if (typeof RulerEngine !== 'undefined') RulerEngine.updateCursor(pos.x, pos.y);
    if (!_drag) return;
    const { type } = _drag;
    if (type === 'move')   _doMove(pos, e);
    else if (type === 'resize') _doResize(pos, e);
    else if (type === 'rubber') _doRubberBand(pos);
    else if (type === 'insert' && typeof InsertEngine !== 'undefined') InsertEngine.onMouseMove(pos);
  }

  function onMouseUp(e) {
    if (!_drag) return;
    const d = _drag;
    document.querySelectorAll('.cr-element.dragging').forEach(div => div.classList.remove('dragging'));
    if (typeof AlignmentGuides !== 'undefined') AlignmentGuides.clear();
    if (d.type === 'move'   && d.moved) DS.saveHistory();
    if (d.type === 'resize')            DS.saveHistory();
    if (d.type === 'rubber') {
      const rb = document.getElementById('rubber-band');
      if (rb) rb.style.display = 'none';
      if (DS.selection.size > 0) {
        if (typeof PropertiesEngine !== 'undefined') PropertiesEngine.render();
        if (typeof FormatEngine     !== 'undefined') FormatEngine.updateToolbar();
      }
    }
    if (d.type === 'insert' && typeof InsertEngine !== 'undefined') InsertEngine.onMouseUp(e);
    _drag = null;
  }

  // ── Selection management ─────────────────────────────────────────
  function clearSelection() {
    DS.selection.clear();
    renderHandles();
    if (typeof PropertiesEngine !== 'undefined') PropertiesEngine.render();
    if (typeof FormatEngine     !== 'undefined') FormatEngine.updateToolbar();
    updateSelectionInfo();
  }

  function updateSelectionInfo() {
    const info = document.getElementById('selection-info');
    if (!info) return;
    if (DS.selection.size > 1) {
      info.style.display = 'block';
      info.textContent = `${DS.selection.size} objetos seleccionados`;
    } else {
      info.style.display = 'none';
    }
    if (typeof SectionEngine !== 'undefined') SectionEngine.updateSectionsList();
    if (DS.selection.size === 1) {
      const el = DS.getElementById([...DS.selection][0]);
      const sbSize = document.getElementById('sb-size');
      if (el && sbSize) {
        sbSize.style.display = 'flex';
        sbSize.textContent = `W: ${el.w}  H: ${el.h}`;
      }
    } else {
      const sbSize = document.getElementById('sb-size');
      if (sbSize) sbSize.style.display = 'none';
    }
  }

  return {
    get _drag()  { return _drag; },
    set _drag(v) { _drag = v;   },

    attachElementEvents,
    attachHandleEvent,
    renderHandles,
    startTextEdit,
    startRubberBand,
    clearSelection,
    updateSelectionInfo,
    onMouseMove,
    onMouseUp,

    // Expose for compatibility
    select(id)         { DS.selection.add(id); renderHandles(); },
    deselect(id)       { DS.selection.delete(id); renderHandles(); },
    clear()            { clearSelection(); },
    getSelected()      { return DS.getSelectedElements(); },
    isSelected(id)     { return DS.selection.has(id); },
  };
})();

if (typeof module !== 'undefined') module.exports = SelectionEngineV19;
