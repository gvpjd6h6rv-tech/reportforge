import RF from '../rf.js';

/**
 * core/selection.js — RF.Core.SelectionSystem
 * Layer   : Core
 * Purpose : Tracks which element IDs are selected, syncs selection handles
 *           in the DOM, and emits SEL_CHANGED events.
 * Deps    : RF.Core.DocumentModel
 */

RF.Core.SelectionSystem = {
  _layer: null,

  initLayer() {
    this._layer = document.getElementById('sel-layer');
    if (!this._layer) {
      this._layer = document.createElement('div');
      this._layer.id = 'sel-layer';
      document.getElementById('canvas-surface')?.appendChild(this._layer);
    }
  },

  select(id, additive=false) {
    const DM = RF.Core.DocumentModel;
    if (!additive) DM.selectedIds.clear();
    if (id) DM.selectedIds.add(id);
    RF.RP?.invalidate('selection'); RF.emit(RF.E.SEL_CHANGED);
  },

  toggle(id) {
    const DM = RF.Core.DocumentModel;
    DM.selectedIds.has(id) ? DM.selectedIds.delete(id) : DM.selectedIds.add(id);
    RF.RP?.invalidate('selection'); RF.emit(RF.E.SEL_CHANGED);
  },

  selectAll() {
    const DM = RF.Core.DocumentModel;
    DM.selectedIds = new Set(DM.layout.elements.map(e=>e.id));
    RF.RP?.invalidate('selection'); RF.emit(RF.E.SEL_CHANGED);
  },

  clear() {
    RF.Core.DocumentModel.selectedIds.clear();
    RF.RP?.invalidate('selection'); RF.emit(RF.E.SEL_CHANGED);
  },

  selectByRect(rx, ry, rw, rh, sectionId) {
    const DM = RF.Core.DocumentModel;
    DM.selectedIds.clear();
    DM.layout.elements.forEach(el => {
      if (el.sectionId !== sectionId) return;
      if (this._rectsOverlap(el.x,el.y,el.w,el.h, rx,ry,rw,rh)) DM.selectedIds.add(el.id);
    });
    RF.RP?.invalidate('selection'); RF.emit(RF.E.SEL_CHANGED);
  },

  _rectsOverlap(ax,ay,aw,ah, bx,by,bw,bh) {
    return ax<bx+bw && ax+aw>bx && ay<by+bh && ay+ah>by;
  },

  // ── DOM sync ──────────────────────────────────────────────────────────────
  syncDOM() {
    const DM = RF.Core.DocumentModel;
    document.querySelectorAll('.rf-el.selected').forEach(d=>d.classList.remove('selected'));
    DM.selectedIds.forEach(id => {
      const d = document.getElementById(`el-${id}`);
      if (d) d.classList.add('selected');
    });
    this._renderHandles();
  },

  _renderHandles() {
    if (!this._layer) this.initLayer();
    RF.clear(this._layer);
    const sel = RF.Core.DocumentModel.selectedElements;
    if (!sel.length) return;

    if (sel.length === 1) {
      this._drawHandles(sel[0]);
    } else {
      this._drawMultiBBox(sel);
    }
  },

  _drawHandles(el) {
    const {x,y,w,h} = this._canvasRect(el);
    // Box
    const box = document.createElement('div');
    box.className = 'sel-box';
    box.style.cssText = `left:${x-1}px;top:${y-1}px;width:${w+2}px;height:${h+2}px;`;
    this._layer.appendChild(box);
    // 8 resize handles
    [
      {id:'tl',cx:x,    cy:y,    cursor:'nw-resize'},
      {id:'tc',cx:x+w/2,cy:y,    cursor:'n-resize' },
      {id:'tr',cx:x+w,  cy:y,    cursor:'ne-resize'},
      {id:'ml',cx:x,    cy:y+h/2,cursor:'w-resize' },
      {id:'mr',cx:x+w,  cy:y+h/2,cursor:'e-resize' },
      {id:'bl',cx:x,    cy:y+h,  cursor:'sw-resize'},
      {id:'bc',cx:x+w/2,cy:y+h,  cursor:'s-resize' },
      {id:'br',cx:x+w,  cy:y+h,  cursor:'se-resize'},
    ].forEach(h => {
      const d = document.createElement('div');
      d.className = 'sel-handle';
      d.style.cssText = `left:${h.cx-4}px;top:${h.cy-4}px;cursor:${h.cursor};`;
      d.dataset.handle = h.id;
      d.dataset.elid   = el.id;
      this._layer.appendChild(d);
    });
  },

  _drawMultiBBox(els) {
    const rects = els.map(el => this._canvasRect(el));
    const minX = Math.min(...rects.map(r => r.left));
    const minY = Math.min(...rects.map(r => r.top));
    const maxX = Math.max(...rects.map(r => r.left + r.width));
    const maxY = Math.max(...rects.map(r => r.top + r.height));
    const box = document.createElement('div');
    box.className = 'sel-box multi';
    box.style.cssText = `left:${minX-1}px;top:${minY-1}px;width:${maxX-minX+2}px;height:${maxY-minY+2}px;`;
    this._layer.appendChild(box);
  },

  _canvasRect(el) {
    const body = RF.DOM.sectionBody(el.sectionId);
    const surface = RF.DOM.canvasLayer();
    const buildRect = (left, top, width, height) => {
      const rect = { left, top, width, height };
      Object.defineProperties(rect, {
        x: { get() { const msg='INVALID GEOMETRY SHAPE: use left/top/width/height only'; console.error(msg); throw new Error(msg); }, enumerable:false },
        y: { get() { const msg='INVALID GEOMETRY SHAPE: use left/top/width/height only'; console.error(msg); throw new Error(msg); }, enumerable:false },
        w: { get() { const msg='INVALID GEOMETRY SHAPE: use left/top/width/height only'; console.error(msg); throw new Error(msg); }, enumerable:false },
        h: { get() { const msg='INVALID GEOMETRY SHAPE: use left/top/width/height only'; console.error(msg); throw new Error(msg); }, enumerable:false },
      });
      return Object.freeze(rect);
    };
    if (!body || !surface) return buildRect(el.x, el.y, el.w, el.h);

    const bodyRect = body.getBoundingClientRect();
    const surfaceRect = surface.getBoundingClientRect();
    const zoom = RF.Geometry?.getZoom?.() ?? RF.Core.DocumentModel?.zoom ?? 1;

    return buildRect(
      el.x + (bodyRect.left - surfaceRect.left) / zoom,
      el.y + (bodyRect.top - surfaceRect.top) / zoom,
      el.w,
      el.h
    );
  },
};

RF.Sel = RF.Core.SelectionSystem;


// ═══════════════════════════════════════════════════════════════════════════════
// RF.Core.RenderPipeline — Single place for all DOM updates.
// Sections.fullRender() and syncElement() live here.
// ═══════════════════════════════════════════════════════════════════════════════

RF.Sel = RF.Core.SelectionSystem;
