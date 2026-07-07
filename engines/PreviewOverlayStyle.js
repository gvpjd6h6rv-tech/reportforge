'use strict';

// RF-PREVIEW-BBOX-HUG-1: single source of truth for HOW the preview hover and
// selection overlays draw their box around the element's visual bbox. Both
// must hug the SAME external edge on all four sides. The bug was that hover
// used `outline` (drawn OUTSIDE the border-box edge) while selection used
// `border` (drawn INSIDE the border-box), so for the identical rect the two
// never coincided — selection sat inset on top/left vs the hover outline.
//
// Contract: in PREVIEW, both draw a 1px `outline` at offset 0 -> the line hugs
// the OUTER edge of the element's border-box, identically, no inset, no
// per-side asymmetry. In DESIGN the selection box keeps its `border` (design
// is a control/regression surface and must NOT change) — so the decision is
// parameterised by previewMode and unit tested for BOTH branches.
//
// Pure: no DOM, no globals. Consumed by SelectionOverlayRender (selection) and
// PreviewHoverOutline (hover) so the formula is never duplicated.
(function initPreviewOverlayStyle(global) {
  // Returns the box-drawing style for an overlay outline of the given color.
  // previewMode=true  -> outline (hug outer edge), no border   [PREVIEW fix]
  // previewMode=false -> border  (unchanged design behaviour)  [DESIGN control]
  function overlayBoxStyle(previewMode, color) {
    if (previewMode) {
      return { border: 'none', outline: `1px solid ${color}`, outlineOffset: '0px' };
    }
    return { border: `1px solid ${color}`, outline: 'none', outlineOffset: '0px' };
  }

  global.PreviewOverlayStyle = { overlayBoxStyle };
})(typeof window !== 'undefined' ? window : globalThis);

if (typeof module !== 'undefined') {
  module.exports = (typeof window !== 'undefined' ? window : globalThis).PreviewOverlayStyle;
}
