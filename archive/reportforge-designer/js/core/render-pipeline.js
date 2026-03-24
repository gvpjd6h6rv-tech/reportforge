import RF from '../rf.js';

/**
 * core/render-pipeline.js — RF.Core.RenderPipeline
 * Layer   : Core
 * Purpose : Full-page render (fullRender) and incremental DOM reconciliation
 *           (reconcile). Delegates element and section DOM construction to
 *           RF.Classic.Elements and RF.Classic.Sections.
 * Deps    : RF.Classic.Elements, RF.Classic.Sections
 */

RF.Core.RenderPipeline = {
  syncSectionLayoutOnly() {
    RF.Engines.SectionLayoutEngine.syncAll();
    RF.Sel.syncDOM();
  },

  // ── Layer invalidation ──────────────────────────────────────────────────
  _dirty: new Set(),

  invalidate(layer) {
    this._dirty.add(layer);
  },

  flush() {
    if (!this._dirty.size) return;
    const d = this._dirty;
    this._dirty = new Set();
    if (d.has('sections')) { this.fullRender(); return; }
    if (d.has('elements')) { this.reconcile(); }
    if (d.has('selection')) { RF.Sel.syncDOM(); }
    if (d.has('guides')) { RF.UX.Guides?.redrawAll?.(); }
  },


  _sectionHash(sec) {
    // Fast hash: id + height + suppress + label
    return `${sec.id}|${sec.height}|${sec.suppress}|${sec.label}`;
  },

  fullRender() {
    const surface = document.getElementById('canvas-surface');
    if (!surface) return;
    const DM = RF.Core.DocumentModel;

    // Check if sections structure changed vs DOM
    const domSecs = [...surface.querySelectorAll('.rf-section[data-secid]')];
    const dataSecs = DM.layout.sections;
    const domIds  = domSecs.map(d => d.dataset.secid);
    const dataIds = dataSecs.map(s => s.id);
    const structChanged = domIds.join(',') !== dataIds.join(',');

    if (structChanged) {
      // Full section rebuild — structure changed
      RF.Classic.Sections.render(surface);
    } else {
      // Sections exist — reconcile individual bodies only
      dataSecs.forEach(sec => {
        const domSec = surface.querySelector(`.rf-section[data-secid="${sec.id}"]`);
        if (!domSec) return;
        RF.Engines.SectionLayoutEngine.syncSection(sec);
      });
      // Reconcile elements
      this.reconcile();
      return;
    }
    RF.Engines.SectionLayoutEngine.syncAll();
    RF.Sel.syncDOM();
    RF.Sel.initLayer();
  },

  syncElement(el) {
    const div = document.getElementById(`el-${el.id}`);
    if (!div) return;
    RF.Classic.Elements.applyStyle(div, el);
    const inner = div.querySelector('span, img, canvas, .el-inner');
    if (inner) div.removeChild(inner);
    div.appendChild(RF.Classic.Elements.renderContent(el));
  },

  // Called on LAYOUT_CHANGED for partial updates (after paste/undo/redo)
  reconcile() {
    const DM     = RF.Core.DocumentModel;
    const surface = document.getElementById('canvas-surface');
    if (!surface) return;

    // Check if we need full render
    const domSections = surface.querySelectorAll('.rf-section[data-secid]');
    const dataSectionIds = new Set(DM.layout.sections.map(s=>s.id));
    let needFull = domSections.length !== DM.layout.sections.length;
    if (!needFull) domSections.forEach(d=>{ if(!dataSectionIds.has(d.dataset.secid)) needFull=true; });
    if (needFull) { this.fullRender(); return; }

    // Partial: sync elements
    DM.layout.sections.forEach(sec => {
      const body = document.getElementById(`secbody-${sec.id}`);
      if (!body) return;
      // Remove stale
      body.querySelectorAll('.rf-el[data-elid]').forEach(d => {
        if (!DM.getElementById(d.dataset.elid)) d.remove();
      });
      // Add/update
      DM.layout.elements.filter(e=>e.sectionId===sec.id).forEach(el => {
        let div = document.getElementById(`el-${el.id}`);
        if (!div) {
          div = RF.Classic.Elements.renderDOM(el);
          body.appendChild(div);
          RF.Classic.Sections.attachElementEvents(div);
        } else {
          this.syncElement(el);
        }
      });
    });
    RF.Sel.syncDOM();
    RF.Sel.initLayer();
  },
};

RF.RP = RF.Core.RenderPipeline;


// ═══════════════════════════════════════════════════════════════════════════════
// RF.Core.LayoutTools — Serialiser / deserialiser / import-export.
// Produces .rfd.json exactly compatible with the ReportForge render engine.
// ═══════════════════════════════════════════════════════════════════════════════

RF.RP = RF.Core.RenderPipeline;
