// ─────────────────────────────────────────────────────────────────────────────
// core.js  –  EventBus · AppState · Utilities
// All modules hang off window.RF
// ─────────────────────────────────────────────────────────────────────────────
window.RF = window.RF || {};

// ── EventBus ─────────────────────────────────────────────────────────────────
RF.EventBus = new (class {
  constructor() { this._h = {}; }
  on(ev, fn)  { (this._h[ev] = this._h[ev] || []).push(fn); return this; }
  off(ev, fn) { this._h[ev] = (this._h[ev]||[]).filter(f=>f!==fn); return this; }
  emit(ev, d) { (this._h[ev]||[]).slice().forEach(f=>f(d)); return this; }
})();

// ── ID generator ─────────────────────────────────────────────────────────────
RF.uid = (pre='el') => `${pre}-${Math.random().toString(36).slice(2,9)}`;

// ── Deep clone ───────────────────────────────────────────────────────────────
RF.clone = v => JSON.parse(JSON.stringify(v));

// ── AppState ─────────────────────────────────────────────────────────────────
RF.AppState = {
  // Layout
  layout: {
    name: 'Untitled Report',
    pageSize: 'A4',
    orientation: 'portrait',
    pageWidth: 754,
    margins: { top: 15, bottom: 15, left: 20, right: 20 },
    sections: [
      { id: 's-rh',  stype: 'rh',  label: 'Report Header',  height: 60  },
      { id: 's-ph',  stype: 'ph',  label: 'Page Header',    height: 40  },
      { id: 's-det', stype: 'det', label: 'Detail',         height: 20  },
      { id: 's-pf',  stype: 'pf',  label: 'Page Footer',    height: 30  },
      { id: 's-rf',  stype: 'rf',  label: 'Report Footer',  height: 30  },
    ],
    elements: [],
    groups: [],
    sortBy: [],
    parameters: [],
  },

  // Selection
  selectedIds: new Set(),
  hoveredId: null,
  clipboard: [],

  // Canvas view
  zoom: 1.0,
  panX: 40,
  panY: 40,

  // Grid & snap
  gridSize: 8,
  snapToGrid: true,
  snapToElements: false,
  showGrid: true,
  showRulers: true,
  guides: [],           // [{id, orientation:'h'|'v', position:n}]

  // Active tool: 'select' | 'text' | 'field' | 'line' | 'rect' | 'image'
  activeTool: 'select',

  // Data for Field Explorer
  fieldData: {
    database: ['items.id','items.name','items.qty','items.unit_price','items.total','items.category'],
    formula:  [],
    parameter:[],
    running:  [],
    sql:      [],
    special:  ['{now()}','{today()}','{uuid()}','[page]','[pageCount]'],
  },

  isDirty: false,

  // Getters
  get selectedElements() {
    return this.layout.elements.filter(e => this.selectedIds.has(e.id));
  },
  getElementById(id) {
    return this.layout.elements.find(e => e.id === id) || null;
  },
  getSectionById(id) {
    return this.layout.sections.find(s => s.id === id) || null;
  },
};

// ── Utils ─────────────────────────────────────────────────────────────────────
RF.Utils = {
  clamp: (v, lo, hi) => Math.max(lo, Math.min(hi, v)),
  snap:  (v, grid)   => Math.round(v / grid) * grid,

  /** Point in rect? */
  ptInRect(px, py, rx, ry, rw, rh) {
    return px >= rx && py >= ry && px <= rx + rw && py <= ry + rh;
  },

  /** Two rects overlap? */
  rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx+bw && ax+aw > bx && ay < by+bh && ay+ah > by;
  },

  /** Compute canvas coordinates from mouse event (considering zoom/pan) */
  canvasPoint(e, state) {
    const canvas = document.getElementById('canvas-surface');
    if (!canvas) return {x:0, y:0};
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / state.zoom,
      y: (e.clientY - rect.top)  / state.zoom,
    };
  },

  /** Section body rect (in canvas coordinates) */
  sectionBodyRect(sectionId, state) {
    let offsetY = 0;
    for (const s of state.layout.sections) {
      if (s.id === sectionId) {
        return { x: 0, y: offsetY + 24, w: state.layout.pageWidth, h: s.height };
      }
      offsetY += s.height + 24;  // 24 = section label height
    }
    return null;
  },

  /** Screen coordinates of an element */
  elementScreenRect(el, state) {
    const sr = RF.Utils.sectionBodyRect(el.sectionId, state);
    if (!sr) return null;
    return {
      x: (sr.x + el.x) * state.zoom + state.panX,
      y: (sr.y + el.y) * state.zoom + state.panY,
      w: el.w * state.zoom,
      h: el.h * state.zoom,
    };
  },

  hexToRgba(hex, alpha=1) {
    const r = parseInt(hex.slice(1,3),16);
    const g = parseInt(hex.slice(3,5),16);
    const b = parseInt(hex.slice(5,7),16);
    return `rgba(${r},${g},${b},${alpha})`;
  },

  downloadText(filename, text) {
    const a = document.createElement('a');
    a.href = 'data:application/json;charset=utf-8,' + encodeURIComponent(text);
    a.download = filename;
    a.click();
  },

  formatSize(bytes) {
    return bytes < 1024 ? `${bytes}B` : `${(bytes/1024).toFixed(1)}KB`;
  },
};
