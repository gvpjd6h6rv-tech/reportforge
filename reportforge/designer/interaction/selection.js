// ─────────────────────────────────────────────────────────────────────────────
// interaction/selection.js  –  Selection management  (features 11–15)
// ─────────────────────────────────────────────────────────────────────────────
RF.Selection = {

  select(id, additive = false) {
    const s = RF.AppState;
    if (!additive) s.selectedIds.clear();
    if (id) s.selectedIds.add(id);
    RF.EventBus.emit('selection:changed');
  },

  toggle(id) {
    const s = RF.AppState;
    if (s.selectedIds.has(id)) s.selectedIds.delete(id);
    else s.selectedIds.add(id);
    RF.EventBus.emit('selection:changed');
  },

  selectAll() {
    const s = RF.AppState;
    s.selectedIds = new Set(s.layout.elements.map(e => e.id));
    RF.EventBus.emit('selection:changed');
  },

  clear() {
    RF.AppState.selectedIds.clear();
    RF.EventBus.emit('selection:changed');
  },

  /** Select all elements whose bounding box overlaps the given canvas rect */
  selectByRect(rx, ry, rw, rh, sectionId) {
    const s   = RF.AppState;
    s.selectedIds.clear();
    for (const el of s.layout.elements) {
      // Only select elements in this section
      if (el.sectionId !== sectionId) continue;
      if (RF.Utils.rectsOverlap(el.x, el.y, el.w, el.h, rx, ry, rw, rh)) {
        s.selectedIds.add(el.id);
      }
    }
    RF.EventBus.emit('selection:changed');
  },

  /** Update DOM classes to reflect selection state */
  syncDOM() {
    // Remove all selected states
    document.querySelectorAll('.rf-element.selected').forEach(d => {
      d.classList.remove('selected');
    });
    document.querySelectorAll('.rf-element.hovered').forEach(d => {
      d.classList.remove('hovered');
    });
    // Apply selected
    RF.AppState.selectedIds.forEach(id => {
      const d = document.getElementById(`el-${id}`);
      if (d) d.classList.add('selected');
    });
    // Apply hover
    if (RF.AppState.hoveredId) {
      const d = document.getElementById(`el-${RF.AppState.hoveredId}`);
      if (d && !RF.AppState.selectedIds.has(RF.AppState.hoveredId)) {
        d.classList.add('hovered');
      }
    }
    RF.SelectionHandles.sync();
  },
};

// ── Selection handles (resize handles + bounding box indicator) ────────────
RF.SelectionHandles = {
  _container: null,

  init() {
    this._container = document.getElementById('selection-handles-layer');
    if (!this._container) {
      this._container = document.createElement('div');
      this._container.id = 'selection-handles-layer';
      this._container.style.cssText = 'position:absolute;top:0;left:0;width:0;height:0;pointer-events:none;z-index:9999';
      document.getElementById('canvas-surface')?.appendChild(this._container);
    }
  },

  /** Draw resize handles (8 points) and bounding box for selected elements */
  sync() {
    if (!this._container) this.init();
    this._container.innerHTML = '';

    const sel = RF.AppState.selectedElements;
    if (sel.length === 0) return;

    // For single-element selection: show 8 handles
    // For multi: show combined bounding box only
    if (sel.length === 1) {
      this._drawHandles(sel[0]);
    } else {
      this._drawMultiBBox(sel);
    }
  },

  _drawHandles(el) {
    const { x, y, w, h } = el;
    const c = this._container;

    // Bounding box
    const box = document.createElement('div');
    box.style.cssText = `position:absolute;left:${x-1}px;top:${y-1}px;
      width:${w+2}px;height:${h+2}px;
      border:1px solid #1A6FFF;pointer-events:none;box-sizing:border-box;`;
    c.appendChild(box);

    // 8 handles: tl, tc, tr, ml, mr, bl, bc, br
    const handles = [
      { id:'tl', cx:x,       cy:y,       cursor:'nw-resize' },
      { id:'tc', cx:x+w/2,   cy:y,       cursor:'n-resize'  },
      { id:'tr', cx:x+w,     cy:y,       cursor:'ne-resize' },
      { id:'ml', cx:x,       cy:y+h/2,   cursor:'w-resize'  },
      { id:'mr', cx:x+w,     cy:y+h/2,   cursor:'e-resize'  },
      { id:'bl', cx:x,       cy:y+h,     cursor:'sw-resize' },
      { id:'bc', cx:x+w/2,   cy:y+h,     cursor:'s-resize'  },
      { id:'br', cx:x+w,     cy:y+h,     cursor:'se-resize' },
    ];
    handles.forEach(h => {
      const d = document.createElement('div');
      d.dataset.handle  = h.id;
      d.dataset.elid    = el.id;
      d.style.cssText   = `
        position:absolute;
        left:${h.cx-4}px;top:${h.cy-4}px;
        width:8px;height:8px;
        background:#fff;border:1.5px solid #1A6FFF;border-radius:1px;
        cursor:${h.cursor};pointer-events:all;box-sizing:border-box;
        z-index:10001;
      `;
      c.appendChild(d);
    });
  },

  _drawMultiBBox(els) {
    const minX = Math.min(...els.map(e=>e.x));
    const minY = Math.min(...els.map(e=>e.y));
    const maxX = Math.max(...els.map(e=>e.x+e.w));
    const maxY = Math.max(...els.map(e=>e.y+e.h));
    const box = document.createElement('div');
    box.style.cssText = `position:absolute;left:${minX-1}px;top:${minY-1}px;
      width:${maxX-minX+2}px;height:${maxY-minY+2}px;
      border:1px dashed #1A6FFF;pointer-events:none;box-sizing:border-box;`;
    this._container.appendChild(box);
  },

  /** Get handle position data from handle div */
  getHandleInfo(div) {
    const handle = div.dataset.handle;
    const elId   = div.dataset.elid;
    return { handle, elId };
  },
};
