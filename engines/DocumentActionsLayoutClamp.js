'use strict';

// RF-SECTION-MOVE-INK-1: a sectionId change carries x/y that were only ever
// valid relative to the OLD section's coordinate frame. Clamp them into the
// NEW section's own bounds -- otherwise a field created deep in a tall
// section (e.g. y=34 in s-ph) silently lands outside a shorter target
// section's own box when moved (e.g. into the 14px detail band), invisible
// there because .cr-section's `contain: layout paint`
// (designer/styles/canvas.css) clips any child painted past the section's
// own height, even though the separate #selection-layer overlay (unclipped,
// canvas-global) keeps showing a seemingly-correct selection box. Confirmed
// LIVE with a pixel-level ink test on the real Properties "Sección:" dropdown
// (fieldPath cliente.email, sentinel "INK106": 0 ink pixels after an
// unclamped move; forensic scan #10.7R).
//
// Pure function, no DOM, no globals beyond the explicit input -- shared by
// DocumentActions.js::updateElementLayout (the single canonical state
// mutation path both the Properties-panel dropdown and any programmatic
// caller funnel through) so every sectionId change gets the same clamp.
const DocumentActionsLayoutClamp = (() => {
  function clampSectionMovePatch(element, patch, selectors) {
    const finalPatch = { ...patch };
    if (!Object.prototype.hasOwnProperty.call(patch, 'sectionId') || patch.sectionId === element.sectionId) {
      return finalPatch;
    }
    const targetSection = selectors.getSection ? selectors.getSection(patch.sectionId) : null;
    if (!targetSection) return finalPatch;

    const w = Object.prototype.hasOwnProperty.call(patch, 'w') ? patch.w : element.w;
    const h = Object.prototype.hasOwnProperty.call(patch, 'h') ? patch.h : element.h;
    const curX = Object.prototype.hasOwnProperty.call(patch, 'x') ? patch.x : element.x;
    const curY = Object.prototype.hasOwnProperty.call(patch, 'y') ? patch.y : element.y;

    const maxY = Math.max(0, (Number(targetSection.height) || 0) - h);
    finalPatch.y = Math.max(0, Math.min(curY, maxY));

    const pageW = typeof CFG !== 'undefined' && Number.isFinite(CFG.PAGE_W) ? CFG.PAGE_W : null;
    if (pageW !== null) {
      const maxX = Math.max(0, pageW - w);
      finalPatch.x = Math.max(0, Math.min(curX, maxX));
    }
    return finalPatch;
  }

  return { clampSectionMovePatch };
})();

if (typeof module !== 'undefined') {
  module.exports = DocumentActionsLayoutClamp;
}
