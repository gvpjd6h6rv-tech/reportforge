/**
 * rf.js — ReportForge global namespace, event bus, and shared utilities.
 *
 * This is the ONLY import every module needs:
 *   import RF from '../rf.js';
 *
 * Architecture:
 *   RF              — root object, also exposed on window for onclick= handlers
 *   RF.Core.*       — state, history, selection, render pipeline
 *   RF.UX.*         — interaction tools (drag, snap, guides, alignment)
 *   RF.Classic.*    — canvas UI, sections, inspector, toolbar
 *   RF.Modules.*    — feature dialogs and panels
 *   RF.E            — event name constants (string enum)
 *   RF.H / Sel / RP / LT  — convenience aliases, set by their owner modules
 */

/* ── Namespace ─────────────────────────────────────────────────────────── */
const RF = {};
RF.Core    = {};
RF.UX      = {};
RF.Classic = {};
RF.Modules = {};

/* ── Event name constants ─────────────────────────────────────────────── */
// All event strings live here so modules never use magic strings.
// v4 events are appended in app.js via Object.assign(RF.E, { … }).
RF.E = {
  // Layout mutations
  LAYOUT_CHANGED:   'layout:changed',
  ELEMENT_CREATED:  'element:created',
  ELEMENT_DELETED:  'element:deleted',
  ELEMENT_MUTATED:  'element:mutated',
  SECTION_MUTATED:  'section:mutated',
  // Selection
  SEL_CHANGED:      'sel:changed',
  SEL_CLEARED:      'sel:cleared',
  // History
  HISTORY_CHANGED:  'history:changed',
  // UI
  STATUS:           'status',
  ZOOM_CHANGED:     'zoom:changed',
  TOOL_CHANGED:     'tool:changed',
  INSPECTOR_REFRESH:'inspector:refresh',
  SNAP_GUIDES:      'snap:guides',
  GUIDES_CHANGED:   'guides:changed',
  // Modules
  FORMULA_OPEN:     'formula:open',
  PARAMS_OPEN:      'params:open',
  GROUPS_OPEN:      'groups:open',
  FILTERS_OPEN:     'filters:open',
  PREVIEW_OPEN:     'preview:open',
  PREVIEW_CLOSE:    'preview:close',
  COND_FMT_OPEN:    'condfmt:open',
};

/* ── Event bus ─────────────────────────────────────────────────────────── */
RF.Core.EventBus = new (class EventBus {
  constructor() { this._h = {}; this._once = new WeakSet(); }
  on(ev, fn)     { (this._h[ev] = this._h[ev] || []).push(fn); return this; }
  once(ev, fn)   { this.on(ev, fn); this._once.add(fn); return this; }
  off(ev, fn)    { this._h[ev] = (this._h[ev]||[]).filter(f=>f!==fn); return this; }
  emit(ev, data) {
    (this._h[ev]||[]).slice().forEach(f => {
      f(data);
      if (this._once.has(f)) this.off(ev, f);
    });
    return this;
  }
  trigger(ev, data) { return this.emit(ev, data); }
})();

/* ── Convenience aliases ──────────────────────────────────────────────── */
RF.on   = (ev, fn) => RF.Core.EventBus.on(ev, fn);
RF.emit = (ev, d)  => RF.Core.EventBus.emit(ev, d);

/* ── Utilities ────────────────────────────────────────────────────────── */
RF.uid   = (p='el') => `${p}-${Date.now().toString(36).slice(-4)}${Math.random().toString(36).slice(2,5)}`;
RF.clone = v => JSON.parse(JSON.stringify(v));
RF.clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
RF.snap  = (v, g)      => Math.round(v / g) * g;

/* ── Short aliases — set by each owner module after it registers ─────── */
// Declared null here so any module that imports rf.js gets a defined reference.
// Actual values are assigned at the bottom of each owner file.
RF.H   = null;   // RF.Core.HistoryEngine    → core/history.js
RF.Sel = null;   // RF.Core.SelectionSystem  → core/selection.js
RF.RP  = null;   // RF.Core.RenderPipeline   → core/render-pipeline.js
RF.LT  = null;   // RF.Core.LayoutTools      → core/layout-tools.js

/* ── Global exposure for HTML onclick= handlers ──────────────────────── */
window.RF = RF;

export default RF;

// ── DOM helpers ─────────────────────────────────────────────────────────────
// RF.html(tpl) — parse template string into a DocumentFragment via <template>.
// Scripts inside the fragment do NOT execute (unlike innerHTML).
// Use: el.append(RF.html(`<div>...</div>`));
RF.html = function(tpl) {
  const t = document.createElement('template');
  t.innerHTML = tpl.trim();
  return t.content.cloneNode(true);
};

// RF.clear(el) — remove all children
RF.clear = function(el) { el.replaceChildren(); };

// RF.setText(el, text) — safe text content
RF.setText = function(el, text) { el.textContent = text; };

