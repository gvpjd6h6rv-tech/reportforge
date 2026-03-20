import RF from '../rf.js';

RF.Engines.SectionLayoutEngine = {
  RESIZE_HANDLE_HEIGHT: 3,
  WRITES: Object.freeze(['.rf-section.width', '.rf-sec-body.width', '.rf-sec-body.height', '.rf-sec-resize.width', '.rf-sec-label-cell.height']),

  syncSection(sectionOrId) {
    const section = typeof sectionOrId === 'string'
      ? RF.Core.DocumentModel.getSectionById(sectionOrId)
      : sectionOrId;
    if (!section) return;

    const pageWidth = RF.Core.DocumentModel.layout?.pageWidth ?? 0;
    const wrap = RF.DOM.sectionWrap(section.id);
    const body = RF.DOM.sectionBody(section.id);
    const resize = RF.DOM.sectionResize(section.id);
    const label = RF.DOM.sectionLabelCell(section.id);

    if (wrap) {
      wrap.style.width = `${pageWidth}px`;
    }
    if (body) {
      body.style.width = `${pageWidth}px`;
      body.style.height = `${section.height}px`;
    }
    if (resize) {
      resize.style.width = `${pageWidth}px`;
    }
    if (label) {
      label.style.height = `${section.height + this.RESIZE_HANDLE_HEIGHT}px`;
    }
  },

  syncAll() {
    const sections = RF.Core.DocumentModel.layout?.sections ?? [];
    sections.forEach(section => this.syncSection(section));
    RF.Engines.CanvasLayoutEngine?.sync?.();
  },

  setSectionHeight(sectionId, height) {
    const section = RF.Core.DocumentModel.getSectionById(sectionId);
    if (!section) return;
    const next = Math.max(12, Math.round(height));
    console.log('[trace SLE:setSectionHeight before]', sectionId, 'old=', section.height, 'next=', next);
    section.height = next;
    this.syncSection(section);
    RF.Engines.CanvasLayoutEngine?.sync?.();
    console.log('[trace SLE:setSectionHeight after]', sectionId, 'stored=', section.height);
  },
};

export default RF;
