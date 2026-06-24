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
  }

  function _show(node) {
    const id = node?.dataset?.id || node?.dataset?.originId;
    if (!id || _isSelected(id)) { clear(); return; }
    const layer = SelectionOverlayPreview.ensurePreviewHoverLayer();
    const rect = layer && SelectionOverlayPreview.domRectRelativeToLayer(node, layer);
    if (!layer || !rect) return;
    if (!box) {
      box = document.createElement('div');
      box.className = 'preview-hover-box';
      box.style.position = 'absolute';
      box.style.boxSizing = 'border-box';
      box.style.outline = '1px solid #F08000';
      box.style.outlineOffset = '0px';
      box.style.pointerEvents = 'none';
      layer.appendChild(box);
    }
    box.style.left = `${rect.left}px`;
    box.style.top = `${rect.top}px`;
    box.style.width = `${rect.width}px`;
    box.style.height = `${rect.height}px`;
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

  function _onOver(event) {
    if (typeof DS === 'undefined' || !DS.previewMode) return;
    const node = event.target.closest?.('.preview-hit-layer .pv-el');
    if (!node) return;
    if (node === hoverEl) return;
    _show(node);
  }

  function _onOut(event) {
    if (!hoverEl) return;
    const node = event.target.closest?.('.preview-hit-layer .pv-el');
    if (node === hoverEl && (!event.relatedTarget || !node.contains(event.relatedTarget))) clear();
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
