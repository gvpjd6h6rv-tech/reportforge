/**
 * SelectionEngineV19 — ReportForge v19.6 (Full Implementation)
 * ─────────────────────────────────────────────────────────────────
 * Complete replacement for monolithic SelectionEngine.
 *
 * Owns all selection, drag, resize, and rubber-band logic.
 * Uses RF.Geometry for all coordinate conversions.
 * Routes DOM writes through RenderScheduler.
 *
 * Pipeline (pointer events):
 *   pointerdown  → select + drag/resize start
 *   pointermove  → _doMove / _doResize / _doRubberBand
 *   pointerup    → commit + save history
 */
'use strict';

const SelectionEngineV19Full = (() => {

  // ── State ─────────────────────────────────────────────────────────
  let _drag = null;
  // {type:'move'|'resize'|'rubber'|'insert',
  //  startX, startY (canvas model coords),
  //  startPositions: [{id,x,y,sectionId,sectionTop}],
  //  handlePos, elId, origX/Y/W/H (resize),
  //  moved: bool, _rafPending: bool }

  // ── Registry helper ───────────────────────────────────────────────
  function _reg(name) {
    return (typeof EngineRegistry !== 'undefined' && EngineRegistry.get(name)) || null;
  }

  // ── getCanvasPos — screen → model coords ─────────────────────────
  function _getCanvasPos(e) {
    return RF.Geometry.viewToModel(e.clientX, e.clientY);
  }

  // ── attachElementEvents ──────────────────────────────────────────
  function attachElementEvents(div, id) {
    div.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      e.stopPropagation(); e.preventDefault();
      div.setPointerCapture && div.setPointerCapture(e.pointerId);
      const el = DS.getElementById(id);
      if (!el) return;

      // Double-click: text edit
      if (e.detail === 2 && el.type === 'text') {
        startTextEdit(div, el); return;
      }

      // Selection logic
      if (!e.shiftKey && !DS.selection.has(id)) DS.selection.clear();
      if (e.shiftKey && DS.selection.has(id)) {
        DS.selection.delete(id);
      } else {
        DS.selection.add(id);
      }
      renderHandles();
      const propsEng = _reg('PropertiesEngine');
      if (propsEng?.render) propsEng.render();
      const fmtEng = _reg('FormatEngine');
      if (fmtEng?.updateToolbar) fmtEng.updateToolbar();

      // Start move drag
      const pos = _getCanvasPos(e);
      _drag = {
        type: 'move',
        startX: pos.x,
        startY: pos.y,
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
      const ctx = _reg('ContextMenuEngine');
      if (ctx?.show) ctx.show(e.clientX, e.clientY, 'element');
    });
  }

  // ── startTextEdit ─────────────────────────────────────────────────
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
      DS.saveHistory();
      const idx = DS.elements.findIndex(e => e.id === el.id);
      if (idx >= 0) DS.elements[idx].content = span.textContent;
    };
    span.addEventListener('blur',    commit, { once: true });
    span.addEventListener('keydown', ke => { if (ke.key === 'Escape' || ke.key === 'Enter') span.blur(); });
  }

  // ── startRubberBand ────────────────────────────────────────────────
  function startRubberBand(e) {
    const pos = _getCanvasPos(e);
    _drag = { type: 'rubber', startX: pos.x, startY: pos.y, curX: pos.x, curY: pos.y };
    const rb = document.getElementById('rubber-band');
    if (rb) {
      rb.style.display = 'block';
      rb.style.left = pos.x + 'px'; rb.style.top  = pos.y + 'px';
      rb.style.width = '0';          rb.style.height = '0';
    }
  }

  // ── attachHandleEvent ─────────────────────────────────────────────
  function attachHandleEvent(handleDiv, pos) {
    handleDiv.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      e.stopPropagation(); e.preventDefault();
      const pos2 = _getCanvasPos(e);
      const sel  = DS.getSelectedElements();
      if (!sel.length) return;
      const el = sel[0];
      _drag = {
        type: 'resize',
        handlePos: pos,
        elId: el.id,
        startX: pos2.x, startY: pos2.y,
        origX: el.x, origY: el.y, origW: el.w, origH: el.h,
      };
    });
  }

  // ── renderHandles ─────────────────────────────────────────────────
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
      const gr    = RF.Geometry.elementRect(elDiv);
      let absX, absY, absW, absH;
      if (gr) {
        absX = gr.x; absY = gr.y; absW = gr.w; absH = gr.h;
      } else {
        const secTop = DS.getSectionTop(el.sectionId);
        absX = RF.Geometry.scale(el.x);
        absY = RF.Geometry.scale(secTop + el.y);
        absW = RF.Geometry.scale(el.w);
        absH = RF.Geometry.scale(el.h);
      }

      // Selection box
      const selBox = document.createElement('div');
      selBox.className = 'sel-box';
      selBox.style.setProperty('--sel-x', absX + 'px');
      selBox.style.setProperty('--sel-y', absY + 'px');
      selBox.style.setProperty('--sel-w', absW + 'px');
      selBox.style.setProperty('--sel-h', absH + 'px');
      layer.appendChild(selBox);

      // Corner handles (Crystal Reports: 4 corners)
      [
        { pos: 'nw', cx: absX,        cy: absY        },
        { pos: 'ne', cx: absX + absW, cy: absY        },
        { pos: 'sw', cx: absX,        cy: absY + absH },
        { pos: 'se', cx: absX + absW, cy: absY + absH },
      ].forEach(({ pos, cx, cy }) => {
        const h = document.createElement('div');
        h.className    = 'sel-handle';
        h.dataset.pos  = pos;
        h.style.left   = cx + 'px';
        h.style.top    = cy + 'px';
        attachHandleEvent(h, pos);
        layer.appendChild(h);
      });

    } else {
      // Multi-select bounding box
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      DS.getSelectedElements().forEach(el => {
        const d = document.querySelector(`.cr-element[data-id="${el.id}"]`);
        const gr = RF.Geometry.elementRect(d);
        if (gr) {
          minX = Math.min(minX, gr.x);  minY = Math.min(minY, gr.y);
          maxX = Math.max(maxX, gr.x + gr.w); maxY = Math.max(maxY, gr.y + gr.h);
        } else {
          const st = DS.getSectionTop(el.sectionId);
          const vx = RF.Geometry.scale(el.x), vy = RF.Geometry.scale(st + el.y);
          const vw = RF.Geometry.scale(el.w), vh = RF.Geometry.scale(el.h);
          minX = Math.min(minX, vx); minY = Math.min(minY, vy);
          maxX = Math.max(maxX, vx + vw); maxY = Math.max(maxY, vy + vh);
        }
      });
      const outline = document.createElement('div');
      outline.style.cssText = `position:absolute;left:${minX}px;top:${minY}px;` +
        `width:${maxX-minX}px;height:${maxY-minY}px;` +
        `border:1px dashed #0066CC;pointer-events:none;z-index:39;background:rgba(0,102,204,.04)`;
      layer.appendChild(outline);
    }
    updateSelectionInfo();
  }

  // ── clearSelection ────────────────────────────────────────────────
  function clearSelection() {
    DS.selection.clear();
    renderHandles();
    const propsEng = _reg('PropertiesEngine');
    if (propsEng?.render) propsEng.render();
    const fmtEng = _reg('FormatEngine');
    if (fmtEng?.updateToolbar) fmtEng.updateToolbar();
    updateSelectionInfo();
  }

  // ── updateSelectionInfo ───────────────────────────────────────────
  function updateSelectionInfo() {
    const info = document.getElementById('selection-info');
    if (info) {
      if (DS.selection.size > 1) {
        info.style.display  = 'block';
        info.textContent    = `${DS.selection.size} objetos seleccionados`;
      } else {
        info.style.display  = 'none';
      }
    }
    const secEng = _reg('SectionEngine') || (typeof SectionEngine !== 'undefined' ? SectionEngine : null);
    if (secEng?.updateSectionsList) secEng.updateSectionsList();
    if (DS.selection.size === 1) {
      const el = DS.getElementById([...DS.selection][0]);
      const sb = document.getElementById('sb-size');
      if (el && sb) { sb.style.display = 'flex'; sb.textContent = `W: ${el.w}  H: ${el.h}`; }
    } else {
      const sb = document.getElementById('sb-size');
      if (sb) sb.style.display = 'none';
    }
  }

  // ── _doMove ────────────────────────────────────────────────────────
  function _doMove(pos) {
    const d = _drag;
    d.moved = true;
    const dx = pos.x - d.startX, dy = pos.y - d.startY;

    // Alignment guides
    const alEng = _reg('AlignmentEngine');
    const guEng = _reg('GuideEngine');
    if (alEng && DS.selection.size === 1) {
      const result = alEng.compute(DS.getSelectedElements()[0]);
      if (guEng && result.guides.length) guEng.show(result.guides);
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
        const _mp = RF.Geometry.modelToView(el.x, el.y);
        div.style.left = _mp.x + 'px';
        div.style.top  = _mp.y + 'px';
      }
    });

    if (!d._rafPending) {
      d._rafPending = true;
      if (typeof RenderScheduler !== 'undefined') {
        RenderScheduler.handles(() => {
          d._rafPending = false;
          renderHandles();
          if (DS.selection.size === 1) {
            const el = DS.getElementById([...DS.selection][0]);
            const sb = document.getElementById('sb-pos');
            if (el && sb) sb.textContent = `X: ${el.x}   Y: ${el.y}`;
          }
        }, 'sel_move_handles');
      } else {
        requestAnimationFrame(() => {
          d._rafPending = false;
          renderHandles();
        });
      }
    }
  }

  // ── _doResize ──────────────────────────────────────────────────────
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

    // Route through CanvasEngineV19 (no monolithic dep)
    const cveng = _reg('CanvasEngineV19') || (typeof CanvasEngineV19 !== 'undefined' ? CanvasEngineV19 : null);
    if (cveng?.updateElementPosition) cveng.updateElementPosition(d.elId);
    renderHandles();

    const sbsize = document.getElementById('sb-size');
    if (sbsize) { sbsize.textContent = `W: ${w}  H: ${h}`; sbsize.style.display = 'flex'; }
    const propsEng = _reg('PropertiesEngine');
    if (propsEng?.updatePositionFields) propsEng.updatePositionFields(el);
  }

  // ── _doRubberBand ──────────────────────────────────────────────────
  function _doRubberBand(pos) {
    const d  = _drag;
    const rb = document.getElementById('rubber-band');
    const x  = Math.min(d.startX, pos.x), y = Math.min(d.startY, pos.y);
    const w  = Math.abs(pos.x - d.startX), h = Math.abs(pos.y - d.startY);
    if (rb) { rb.style.left = x+'px'; rb.style.top = y+'px'; rb.style.width = w+'px'; rb.style.height = h+'px'; }
    DS.selection.clear();
    DS.elements.forEach(el => {
      const st = DS.getSectionTop(el.sectionId);
      if (el.x < x+w && el.x+el.w > x && st+el.y < y+h && st+el.y+el.h > y)
        DS.selection.add(el.id);
    });
    renderHandles();
  }

  // ── onMouseMove ────────────────────────────────────────────────────
  function onMouseMove(e) {
    const pos = _getCanvasPos(e);
    const sb  = document.getElementById('sb-pos');
    if (sb) sb.textContent = `X: ${Math.round(pos.x)}   Y: ${Math.round(pos.y)}`;
    if (typeof RulerEngine !== 'undefined') RulerEngine.updateCursor(pos.x, pos.y);
    if (!_drag) return;
    const { type } = _drag;
    if      (type === 'move')   _doMove(pos, e);
    else if (type === 'resize') _doResize(pos, e);
    else if (type === 'rubber') _doRubberBand(pos);
    else if (type === 'insert') {
      const insEng = _reg('InsertEngine') || (typeof InsertEngine !== 'undefined' ? InsertEngine : null);
      if (insEng?.onMouseMove) insEng.onMouseMove(pos);
    }
  }

  // ── onMouseUp ──────────────────────────────────────────────────────
  function onMouseUp(e) {
    if (!_drag) return;
    const d = _drag;
    document.querySelectorAll('.cr-element.dragging').forEach(div => div.classList.remove('dragging'));

    const alEng = _reg('AlignmentEngine');
    const guEng = _reg('GuideEngine');
    if (guEng?.clear) guEng.clear();
    // Legacy AlignmentGuides (monolithic)
    if (typeof AlignmentGuides !== 'undefined') AlignmentGuides.clear();

    if (d.type === 'move'   && d.moved)  DS.saveHistory();
    if (d.type === 'resize')             DS.saveHistory();
    if (d.type === 'rubber') {
      const rb = document.getElementById('rubber-band');
      if (rb) rb.style.display = 'none';
      if (DS.selection.size > 0) {
        const propsEng = _reg('PropertiesEngine');
        if (propsEng?.render) propsEng.render();
        const fmtEng = _reg('FormatEngine');
        if (fmtEng?.updateToolbar) fmtEng.updateToolbar();
      }
    }
    if (d.type === 'insert') {
      const insEng = _reg('InsertEngine') || (typeof InsertEngine !== 'undefined' ? InsertEngine : null);
      if (insEng?.onMouseUp) insEng.onMouseUp(e);
    }
    _drag = null;
  }

  // ── selection bound helpers ────────────────────────────────────────
  function getSelectedElements() { return DS.getSelectedElements(); }
  function isSelected(id)        { return DS.selection.has(id); }

  function selectionBoundsModel() {
    const els = DS.getSelectedElements();
    if (!els.length) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    els.forEach(el => {
      const st = DS.getSectionTop(el.sectionId);
      minX = Math.min(minX, el.x);      minY = Math.min(minY, st + el.y);
      maxX = Math.max(maxX, el.x+el.w); maxY = Math.max(maxY, st + el.y + el.h);
    });
    return { x: minX, y: minY, w: maxX-minX, h: maxY-minY };
  }

  // ── Public API ─────────────────────────────────────────────────────

  return {
    // State access
    get _drag() { return _drag; },

    // Core methods (replacing monolithic SelectionEngine)
    attachElementEvents,
    startTextEdit,
    startRubberBand,
    attachHandleEvent,
    renderHandles,
    clearSelection,
    updateSelectionInfo,
    onMouseMove,
    onMouseUp,
    _doMove,
    _doResize,
    _doRubberBand,

    // v19 extensions
    getSelectedElements,
    isSelected,
    selectionBoundsModel,
    select(id)   { DS.selection.add(id); renderHandles(); },
    deselect(id) { DS.selection.delete(id); renderHandles(); },
    clear()      { clearSelection(); },
  };
})();

if (typeof module !== 'undefined') module.exports = SelectionEngineV19Full;
