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

  // RF-PREVIEW-THIN-OVERLAY-1: same hairline formula as the selection/hover
  // box frame — see PreviewOverlayStyle.thinStrokeWidth. One shared visual
  // weight for every preview overlay stroke, never duplicated.
  function selectionGuideThickness() {
    const zoom = globalThis.SelectionOverlayPreview.selectionOverlayZoom();
    return globalThis.PreviewOverlayStyle.thinStrokeWidth(zoom);
  }

  // Proven via raw pixel raster (tools/diagnostics/rf-bbox-ink/
  // rf_thickness_raster_probe.mjs) that a div's OWN height/width floors to a
  // whole device pixel pre-transform in Chromium — a "0.25px"-tall guide
  // still painted a flat 1px at zoom=1 and 4px at zoom=4, same floor as
  // outline-width. Only a background-gradient sized via background-size
  // survives the transform with true sub-pixel anti-aliasing. So the guide
  // element itself is a small (2*GUIDE_HIT_PAD) hit-box straddling the
  // target edge, and the actual visible line is a gradient centered inside
  // it — the edge position (guide.dataset.edge) is unchanged, only the
  // element's own top/left/height/width now describe the padded hit-box,
  // not the hairline itself.
  const GUIDE_HIT_PAD = 3;

  function appendSelectionGuide(layer, rect, axis, edge) {
    const guide = document.createElement('div');
    const thickness = selectionGuideThickness();
    const color = 'rgba(255, 32, 32, 0.9)';
    guide.className = `selection-guide selection-guide-${axis}`;
    guide.dataset.edge = edge;
    guide.style.position = 'absolute';
    guide.style.pointerEvents = 'none';
    guide.style.zIndex = '27';
    if (axis === 'h') {
      guide.style.left = '0px';
      guide.style.width = '100%';
      guide.style.top = `${edge - GUIDE_HIT_PAD}px`;
      guide.style.height = `${GUIDE_HIT_PAD * 2}px`;
      guide.style.background = `linear-gradient(${color},${color}) center / 100% ${thickness}px no-repeat`;
    } else {
      guide.style.top = '0px';
      guide.style.height = '100%';
      guide.style.left = `${edge - GUIDE_HIT_PAD}px`;
      guide.style.width = `${GUIDE_HIT_PAD * 2}px`;
      guide.style.background = `linear-gradient(${color},${color}) center / ${thickness}px 100% no-repeat`;
    }
    layer.appendChild(guide);
  }

  // All four guides anchor to the rect's own OUTER/visual edge — the same
  // convention on all sides. bottom/right used to subtract a leftover
  // `borderWidth` (1px) inset from an older flat-border implementation,
  // landing them one device px INSIDE the box instead of exactly on its
  // visible line, while top/left (which never had that subtraction) landed
  // correctly. Removed: rect.top+rect.height and rect.left+rect.width are
  // themselves already the box's bottom/right edge, nothing to subtract.
  function renderSelectionGuides(layer, rects) {
    rects.forEach(rect => {
      if (!rect) return;
      appendSelectionGuide(layer, rect, 'h', rect.top);
      appendSelectionGuide(layer, rect, 'h', rect.top + rect.height);
      appendSelectionGuide(layer, rect, 'v', rect.left);
      appendSelectionGuide(layer, rect, 'v', rect.left + rect.width);
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
