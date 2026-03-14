import RF from '../rf.js';

/**
 * core/layout-tools.js — RF.Core.LayoutTools  (alias: RF.LT)
 * Layer   : Core
 * Purpose : Nudge (arrow-key moves), distribute, size-to-fit, and other
 *           batch layout helpers operating on selected elements.
 * Deps    : RF.Core.DocumentModel
 */

RF.Core.LayoutTools = {

  toJSON() {
    const DM  = RF.Core.DocumentModel;
    const out = RF.clone(DM.layout);
    out.version = '3.0';
    // Strip designer-only fields from elements
    out.elements = out.elements.map(el => {
      const clean = {...el};
      delete clean._hover; delete clean._dragOffX; delete clean._dragOffY;
      return clean;
    });
    return JSON.stringify(out, null, 2);
  },

  fromJSON(raw) {
    let layout;
    try {
      layout = typeof raw === 'string' ? JSON.parse(raw) : RF.clone(raw);
    } catch(e) {
      this._err('Invalid JSON: ' + e.message);
      return false;
    }
    if (!layout.sections || !Array.isArray(layout.sections)) {
      this._err('Missing sections array');
      return false;
    }
    if (!layout.elements) layout.elements = [];
    // Back-compat: ensure locked field exists on all elements
    layout.elements.forEach(el => {
      if (el.locked === undefined) el.locked = false;
      if (!el.conditionalStyles)  el.conditionalStyles = [];
    });
    RF.H.snapshot('before-load');
    RF.Core.DocumentModel.setLayout(layout);
    RF.H.snapshot('load');
    RF.RP.fullRender();
    RF.emit(RF.E.STATUS, `Loaded: ${layout.name}`);
    return true;
  },

  download() {
    const name = (RF.Core.DocumentModel.layout.name || 'report').replace(/\s+/g,'_');
    this._dl(`${name}.rfd.json`, this.toJSON());
    RF.emit(RF.E.STATUS, `Saved: ${name}.rfd.json`);
  },

  openFile() {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.json,.rfd.json';
    inp.onchange = e => {
      const file = e.target.files[0];
      if (!file) return;
      const fr = new FileReader();
      fr.onload = ev => this.fromJSON(ev.target.result);
      fr.readAsText(file);
    };
    inp.click();
  },

  newLayout() {
    if (RF.Core.DocumentModel.isDirty && !confirm('Discard unsaved changes?')) return;
    RF.Core.DocumentModel.layout = RF.Core.DocumentModel._blank();
    RF.Core.DocumentModel.selectedIds = new Set();
    RF.Core.DocumentModel.isDirty     = false;
    RF.H.clear();
    RF.RP.fullRender();
    RF.emit(RF.E.STATUS, 'New layout created');
  },

  _dl(name, text) {
    const a  = document.createElement('a');
    a.href   = 'data:application/json;charset=utf-8,' + encodeURIComponent(text);
    a.download = name;
    a.click();
  },

  _err(msg) {
    RF.emit(RF.E.STATUS, '⚠ ' + msg);
    console.error('[LayoutTools]', msg);
  },
};

RF.LT = RF.Core.LayoutTools;


// ── UX layer ───────────────────────────────────────────────────────────

// ═══════════════════════════════════════════════════════════════════════════════
// RF.UX.Snapping — Snap to grid, elements, and guides. Shows amber snap lines.
// ═══════════════════════════════════════════════════════════════════════════════

RF.LT = RF.Core.LayoutTools;
