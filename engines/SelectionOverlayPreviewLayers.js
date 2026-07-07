'use strict';

/* SelectionOverlayPreviewLayers — preview overlay-layer creation and
 * selection-guide rendering for SelectionOverlayPreview.js. Extracted
 * verbatim (no behavior change, same signatures) to keep that file under its
 * governance byte threshold. Re-exported under the same names so every
 * external caller (SelectionOverlay.js, SelectionOverlayRender.js,
 * PreviewHoverOutline.js, the rf-bbox-ink diagnostic) keeps working
 * unchanged. selectionOverlayZoom() stays owned by SelectionOverlayPreview.js
 * (it's already exposed there) and is called back through the global, same
 * as any other cross-engine reference in this codebase.
 */
const SelectionOverlayPreviewLayers = (() => {
  function _positiveCssLength(...values) {
    return values.find((value) => Number.parseFloat(value) > 0) || '100%';
  }

  // Shared by selection's and hover's overlay layers — .preview-hit-layer
  // is opacity:0 by design, so styling its .pv-el directly composites to
  // invisible regardless of computedStyle; both instead get their own
  // visible sibling layer, geometry-synced to the hit-layer, stacked by
  // z-index (hover below selection so an active selection wins).
  function _ensurePreviewOverlayLayer(className, datasetKey, zIndex) {
    if (typeof document === 'undefined') return null;
    const content = document.querySelector('#preview-content');
    const hitLayer = document.querySelector('#preview-content .preview-hit-layer');
    if (!content || !hitLayer) return null;
    let layer = content.querySelector(`:scope > .${className}`);
    if (!layer) {
      layer = document.createElement('div');
      layer.className = className;
      layer.dataset[datasetKey] = 'preview';
      content.appendChild(layer);
    }
    content.style.position = 'relative';
    const hitLayerStyle = getComputedStyle(hitLayer);
    const contentStyle = getComputedStyle(content);
    layer.style.position = 'absolute';
    layer.style.left = '0px';
    layer.style.top = '0px';
    layer.style.width = '100%';
    layer.style.height = _positiveCssLength(hitLayerStyle.height, contentStyle.height);
    layer.style.overflow = 'visible';
    layer.style.pointerEvents = 'none';
    layer.style.zIndex = zIndex;
    layer.style.opacity = '1';
    layer.style.visibility = 'visible';
    layer.style.display = 'block';
    layer.style.transform = hitLayer.style.transform || hitLayerStyle.transform || 'none';
    layer.style.transformOrigin = hitLayer.style.transformOrigin || 'top left';
    return layer;
  }
  function ensurePreviewSelectionLayer() { return _ensurePreviewOverlayLayer('preview-selection-layer', 'selectionLayer', '9999'); }
  function ensurePreviewHoverLayer() { return _ensurePreviewOverlayLayer('preview-hover-layer', 'hoverLayer', '9998'); }

  function selectionGuideThickness() {
    const zoom = globalThis.SelectionOverlayPreview.selectionOverlayZoom();
    return Math.max(0.25, 1 / zoom);
  }

  function appendSelectionGuide(layer, rect, axis, edge) {
    const guide = document.createElement('div');
    const thickness = selectionGuideThickness();
    guide.className = `selection-guide selection-guide-${axis}`;
    guide.dataset.edge = edge;
    guide.style.position = 'absolute';
    guide.style.pointerEvents = 'none';
    guide.style.zIndex = '27';
    guide.style.background = 'rgba(255, 32, 32, 0.9)';
    if (axis === 'h') {
      guide.style.left = '0px';
      guide.style.width = '100%';
      guide.style.top = `${edge}px`;
      guide.style.height = `${thickness}px`;
    } else {
      guide.style.top = '0px';
      guide.style.height = '100%';
      guide.style.left = `${edge}px`;
      guide.style.width = `${thickness}px`;
    }
    layer.appendChild(guide);
  }

  function renderSelectionGuides(layer, rects) {
    const borderWidth = 1;
    rects.forEach(rect => {
      if (!rect) return;
      appendSelectionGuide(layer, rect, 'h', rect.top);
      appendSelectionGuide(layer, rect, 'h', rect.top + rect.height - borderWidth);
      appendSelectionGuide(layer, rect, 'v', rect.left);
      appendSelectionGuide(layer, rect, 'v', rect.left + rect.width - borderWidth);
    });
  }

  return {
    ensurePreviewSelectionLayer,
    ensurePreviewHoverLayer,
    selectionGuideThickness,
    appendSelectionGuide,
    renderSelectionGuides,
  };
})();

globalThis.SelectionOverlayPreviewLayers = SelectionOverlayPreviewLayers;

if (typeof module !== 'undefined') module.exports = SelectionOverlayPreviewLayers;
