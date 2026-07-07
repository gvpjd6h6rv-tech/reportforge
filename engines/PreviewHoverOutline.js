'use strict';

// CR-HOVER-OUTLINE-PARITY-1 — Preview-only owner of the hover outline.
// Design's hover outline is pure CSS (.cr-element:hover:not(.selected) in
// elements-selection.css) because .cr-element there is directly visible.
// Preview's hover target (.preview-hit-layer .pv-el) lives inside an
// opacity:0 ancestor (by design — it exists only for hit-testing, see
// SelectionOverlayPreview.js's ensurePreviewHoverLayer() comment), so any
// outline set on it composites to fully invisible no matter what
// computedStyle reports. This engine renders a dedicated box into the
// visible preview-hover-layer instead, mirroring how preview selection
// already renders its own dedicated .sel-box overlay rather than styling
// the (also invisible) hit-layer node directly.
const PreviewHoverOutline = (() => {
  let hoverEl = null;
  let box = null;

  function _isSelected(id) {
    return typeof DS !== 'undefined' && DS.selection && DS.selection.has(id);
  }

  function clear() {
    if (box) box.remove();
    box = null;
    hoverEl = null;
    const layer = typeof document !== 'undefined' ? document.querySelector('#preview-content .preview-hover-layer') : null;
    if (layer) globalThis.PreviewOverlayStyle.clearHairlineFrame(layer, 'hover');
  }

  function _show(node) {
    const id = node?.dataset?.id || node?.dataset?.originId;
    if (!id || _isSelected(id)) { clear(); return; }
    const layer = SelectionOverlayPreview.ensurePreviewHoverLayer();
    if (!layer) return;
    // RF-PREVIEW-BBOX-INK-1: hug the render-layer ink (same source selection
    // uses via getPreviewVisualBBox); fall back to the hovered node's own rect.
    const el = (typeof DS !== 'undefined' && DS.getElementById) ? DS.getElementById(id) : null;
    const rect = (el && SelectionOverlayPreview.getPreviewVisualBBox
      ? SelectionOverlayPreview.getPreviewVisualBBox(el, layer) : null)
      || SelectionOverlayPreview.domRectRelativeToLayer(node, layer);
    if (!rect) return;
    if (!box) {
      box = document.createElement('div');
      box.className = 'preview-hover-box';
      box.style.position = 'absolute';
      box.style.boxSizing = 'border-box';
      box.style.border = 'none';
      box.style.outline = 'none';
      box.style.background = 'transparent';
      box.style.pointerEvents = 'none';
      layer.appendChild(box);
    }
    box.style.left = `${rect.left}px`;
    box.style.top = `${rect.top}px`;
    box.style.width = `${rect.width}px`;
    box.style.height = `${rect.height}px`;
    // RF-PREVIEW-BBOX-HUG-1: same outer-edge frame as selection — 4
    // independent divs appended directly to `layer` at rect's real
    // coordinates (never nested/percentage-relative to `box`), so all four
    // sides (and the corner where they meet) render regardless of `box`'s
    // own box model. `box` itself stays an invisible position/rect marker
    // (kept for any code/tests that query `.preview-hover-box`'s rect).
    // RF-PREVIEW-THIN-OVERLAY-1: outline-width (and even a div's own height/
    // width) floors to a whole device pixel pre-transform in Chromium
    // (proven via raw pixel raster — see tools/diagnostics/rf-bbox-ink/
    // rf_thickness_raster_probe.mjs); only a background-gradient sized via
    // background-size survives with true sub-pixel anti-aliasing. Recomputed
    // on every show (not just at box creation) so the stroke width never
    // goes stale if zoom changes while the box is still mounted from a
    // previous hover.
    globalThis.PreviewOverlayStyle.paintHairlineFrame(layer, rect, '#F08000', SelectionOverlayPreview.selectionOverlayZoom(), 'hover');
    hoverEl = node;
  }

  // Re-checks the currently hovered node against the live selection —
  // called from SelectionOverlay.js on every selection-affecting render so
  // a click-to-select while hovering hides the orange box immediately
  // (selected wins over hover), without waiting for a mouseout.
  function refresh() {
    if (!hoverEl) return;
    const id = hoverEl.dataset?.id || hoverEl.dataset?.originId;
    if (id && _isSelected(id)) clear();
  }

  // RF-INTERACTION-AUDIT-1 (BUG NEW 5): this module listens to native
  // mouseover/mouseout directly (not routed through EngineCoreRouting*),
  // and re-resolves purely from event.clientX/clientY -- so it never
  // noticed when the native mouseover target was the synthetic scrollbar
  // (SyntheticScrollbarEngine.js, position:fixed z-index:150) sitting on
  // top of the document at high zoom, and still lit up the .pv-el
  // underneath it. Proven live: orange hover box appeared over a real
  // report field while event.target was .rf-scrollbar-thumb--h. Must be
  // checked first, before any HitTestResolver call, same principle as the
  // isPointerOnDesignerChrome guard in EngineCoreRoutingPointerHelpers.js.
  function _isOnScrollbarChrome(event) {
    const target = event && event.target;
    return !!(target && typeof target.closest === 'function' &&
      target.closest('.rf-scrollbar-track, .rf-scrollbar-thumb'));
  }

  // RF-INTERACTION-AUDIT-1 (BUG NEW 4): event.target.closest() trusted the
  // browser's native topmost element, same tie-break bug as click routing —
  // a transparent frame rect drawn over inner fields native-hover-highlighted
  // itself instead of the field underneath. HitTestResolver (same one click
  // routing uses in EngineCoreRoutingPointerHelpers.js) re-resolves from the
  // event's actual client coordinates instead of trusting event.target.
  function _onOver(event) {
    if (typeof DS === 'undefined' || !DS.previewMode) return;
    if (_isOnScrollbarChrome(event)) { clear(); return; }
    if (typeof HitTestResolver === 'undefined') return;
    const node = HitTestResolver.resolve(event.clientX, event.clientY, { selector: '.preview-hit-layer .pv-el', idAttr: 'originId' });
    if (!node) return;
    if (node === hoverEl) return;
    _show(node);
  }

  function _onOut(event) {
    if (!hoverEl) return;
    if (_isOnScrollbarChrome(event)) { clear(); return; }
    if (typeof HitTestResolver === 'undefined') return;
    // Re-resolve at the current point instead of comparing the leaving
    // native target — if the resolver still agrees hoverEl is the winner
    // here (e.g. this mouseout only bubbled from one of hoverEl's own child
    // spans), keep the highlight; only clear once hoverEl is no longer it.
    const node = HitTestResolver.resolve(event.clientX, event.clientY, { selector: '.preview-hit-layer .pv-el', idAttr: 'originId' });
    if (node !== hoverEl) clear();
  }

  function init() {
    document.addEventListener('mouseover', _onOver, true);
    document.addEventListener('mouseout', _onOut, true);
    document.addEventListener('rf-preview-rendered', clear);
  }

  return { init, clear, refresh };
})();

globalThis.PreviewHoverOutline = PreviewHoverOutline;
if (typeof module !== 'undefined') module.exports = PreviewHoverOutline;
