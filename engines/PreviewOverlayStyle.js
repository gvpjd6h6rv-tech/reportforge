'use strict';

// RF-PREVIEW-BBOX-HUG-1: single source of truth for HOW the preview hover and
// selection overlays draw their box around the element's visual bbox. Both
// must hug the SAME external edge on all four sides. The original bug was
// that hover used `outline` (drawn OUTSIDE the border-box edge) while
// selection used `border` (drawn INSIDE), so for the identical rect the two
// never coincided. DESIGN mode keeps its plain `border` (a control/
// regression surface that must NOT change) — parameterised by previewMode.
//
// RF-PREVIEW-THIN-OVERLAY-1: preview's overlay stage is zoomed via CSS
// transform:scale(zoom). Verified live with raw getImageData pixel dumps
// (not heuristics — see tools/diagnostics/rf-bbox-ink/rf_thickness_raster_probe.mjs)
// across THREE techniques, at zoom=1 and zoom=4:
//   - outline-width: floors any sub-1px value to "1px" in local
//     (pre-transform) space — a "0.125px" outline still painted flat 1px/4px.
//   - a div's OWN height/width (e.g. the selection-guide lines' first
//     implementation, or four child divs sized 100%/1px each): computed
//     style correctly reports "0.125px", but the PAINT still rounds the box
//     to a whole device pixel pre-transform — same 1px/4px floor as outline,
//     just without outline's computed-style tell.
//   - background-size on a CSS gradient: the ONLY technique that survives
//     the transform with true sub-pixel anti-aliasing (raster showed a
//     genuine ~50% color blend on a single pixel row at BOTH zoom=1 and
//     zoom=4 — not a floored whole-pixel band). This is also what this
//     codebase's OWN corner-tick marks already do (elements-selection.css's
//     --rf-sel-corner-tick-thick, divided by --geo-zoom, used inside a
//     background-size gradient) — proven precedent, not a new idea.
//
// A single element with FOUR combined background-gradient layers (one per
// edge) was tried and only rendered the first layer live — unexplained, and
// not worth chasing given a simpler, more debuggable structure works: FOUR
// INDEPENDENT edge divs, each a small hit-box (so its own height/width never
// has to be sub-1px, avoiding the floor entirely) with ONE centered
// background-gradient layer for the actual hairline. Positioned with real
// absolute px coordinates derived from the target rect — never `100%`/
// `calc()` relative to a parent — so each edge is fully independent and
// completeness (all 4 sides + the corner where they meet) doesn't depend on
// any single container's box model.
(function initPreviewOverlayStyle(global) {
  const HAIRLINE_VISUAL_PX = 0.5;
  const MIN_STROKE_PX = 0.125;
  const HIT_PAD = 3; // px of hit-box padding around each edge's real position
  const EDGE_MARKER = 'rf-hairline-edge';
  const SIDES = ['top', 'right', 'bottom', 'left'];

  function thinStrokeWidth(zoom) {
    const z = Number(zoom);
    const safeZoom = Number.isFinite(z) && z > 0 ? z : 1;
    return Math.max(MIN_STROKE_PX, HAIRLINE_VISUAL_PX / safeZoom);
  }

  // DESIGN mode only: unchanged flat 1px border, exactly the pre-existing
  // control/regression behavior. Never used in preview (see below).
  function designBoxStyle(color) {
    return { border: `1px solid ${color}`, outline: 'none', outlineOffset: '0px' };
  }

  function _edgeStyle(side, rect, w, color) {
    const base = { position: 'absolute', pointerEvents: 'none', boxSizing: 'border-box', border: 'none', outline: 'none' };
    if (side === 'top') {
      return Object.assign(base, {
        left: `${rect.left}px`, top: `${rect.top - HIT_PAD}px`,
        width: `${rect.width}px`, height: `${HIT_PAD * 2}px`,
        background: `linear-gradient(${color},${color}) center / 100% ${w}px no-repeat`,
      });
    }
    if (side === 'bottom') {
      return Object.assign(base, {
        left: `${rect.left}px`, top: `${rect.top + rect.height - HIT_PAD}px`,
        width: `${rect.width}px`, height: `${HIT_PAD * 2}px`,
        background: `linear-gradient(${color},${color}) center / 100% ${w}px no-repeat`,
      });
    }
    if (side === 'left') {
      return Object.assign(base, {
        left: `${rect.left - HIT_PAD}px`, top: `${rect.top}px`,
        width: `${HIT_PAD * 2}px`, height: `${rect.height}px`,
        background: `linear-gradient(${color},${color}) center / ${w}px 100% no-repeat`,
      });
    }
    // right
    return Object.assign(base, {
      left: `${rect.left + rect.width - HIT_PAD}px`, top: `${rect.top}px`,
      width: `${HIT_PAD * 2}px`, height: `${rect.height}px`,
      background: `linear-gradient(${color},${color}) center / ${w}px 100% no-repeat`,
    });
  }

  function _edgeClass(key, side) { return `${EDGE_MARKER} ${EDGE_MARKER}-${key}-${side}`; }

  // Paints a 4-sided hairline frame as four INDEPENDENT divs appended
  // directly to `layer` (never nested inside the target box), positioned
  // with real absolute px coordinates from `rect` (never 100%/calc relative
  // to a parent) — so each edge, and the corner where two edges meet, is
  // fully self-contained. `key` scopes repeated calls for the SAME logical
  // box (e.g. the reused hover box across mousemoves) so old edges are
  // replaced, not accumulated; every call is get-or-create, safe every
  // render. Only the stroke WIDTH is zoom-compensated — rect itself (hence
  // the #10.15 renderInkRect hug) is never touched here.
  function paintHairlineFrame(layer, rect, color, zoom, key = 'default') {
    if (!layer || !rect) return null;
    const w = thinStrokeWidth(zoom);
    return SIDES.map((side) => {
      const cls = `${EDGE_MARKER}-${key}-${side}`;
      let el = layer.querySelector(`.${cls}`);
      if (!el) {
        el = document.createElement('div');
        el.className = _edgeClass(key, side);
        layer.appendChild(el);
      }
      Object.assign(el.style, _edgeStyle(side, rect, w, color));
      return el;
    });
  }

  function clearHairlineFrame(layer, key = 'default') {
    if (!layer) return;
    SIDES.forEach((side) => {
      const el = layer.querySelector(`.${EDGE_MARKER}-${key}-${side}`);
      if (el) el.remove();
    });
  }

  global.PreviewOverlayStyle = {
    thinStrokeWidth,
    designBoxStyle,
    paintHairlineFrame,
    clearHairlineFrame,
  };
})(typeof window !== 'undefined' ? window : globalThis);

if (typeof module !== 'undefined') {
  module.exports = (typeof window !== 'undefined' ? window : globalThis).PreviewOverlayStyle;
}
