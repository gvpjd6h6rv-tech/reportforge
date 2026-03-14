import RF from '../rf.js';

/**
 * classic/sections-v4.js — RF.Classic.SectionsV4
 * Layer   : Classic UI / v4
 * Purpose : Patches RF.Classic.Sections.render to add v4 visual features:
 *           collapse toggles, section color chips, and snap boundary markers.
 * Deps    : RF.Classic.Sections, RF.Core.DocumentModel
 */

RF.Classic.SectionsV4 = {

  _collapsed: new Set(),

  toggle(secId) {
    const body = document.getElementById(`secbody-${secId}`);
    const rsz  = body?.nextElementSibling;
    if (!body) return;
    const isNowCollapsed = !this._collapsed.has(secId);
    if (isNowCollapsed) {
      this._collapsed.add(secId);
      body.classList.add('collapsed');
      if (rsz) rsz.style.height = '2px';
    } else {
      this._collapsed.delete(secId);
      body.classList.remove('collapsed');
      const sec = RF.Core.DocumentModel.getSectionById(secId);
      if (rsz && sec) rsz.style.height = '';
    }
    RF.emit(RF.E.LAYOUT_CHANGED);
  },

  // Patch Sections.render to add collapse button + extra badges
  patchRender() {
    // v4 patch disabled: _build renamed to _buildSection in Phase 4
    if (true) return; // no-op
    const _orig = null; // eslint-disable-line
    // (dead code removed)
  },
};

// Patch SectionExpert to add keepTogether, underlay, pageBreak fields
