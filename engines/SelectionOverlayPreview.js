'use strict';

const SelectionOverlayPreview = (() => {
  function _positiveCssLength(...values) {
    return values.find((value) => Number.parseFloat(value) > 0) || '100%';
  }

  function _previewMode() {
    if (typeof globalThis !== 'undefined' && globalThis.PreviewEngineMode) return globalThis.PreviewEngineMode;
    if (typeof window !== 'undefined' && window.PreviewEngineMode) return window.PreviewEngineMode;
    return typeof PreviewEngineMode !== 'undefined' ? PreviewEngineMode : null;
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

  function findPreviewHitElement(el) {
    if (!el || typeof document === 'undefined') return null;
    const id = String(el.id || '');
    if (!id) return null;
    // RF-PREVIEW-SELECTION-RECT-1: match by data-origin-id anywhere in the hit
    // layer. The old '#preview-content .preview-hit-layer .pv-el' selector
    // failed to find the element (returning null), so previewRect fell back to
    // RAW MODEL COORDS and the selection box landed hundreds of px off — while
    // hover used the live hovered node directly and stayed correct (delta 0).
    // This attribute selector is what the ink-diagnostic proved actually finds
    // every element (static rh/ph/pf/rf included).
    const nodes = document.querySelectorAll(
      '.preview-hit-layer [data-origin-id], .preview-hit-layer [data-id]'
    );
    return [...nodes].find((node) => {
      const ds = node && node.dataset ? node.dataset : {};
      return ds.originId === id || ds.id === id;
    }) || null;
  }

  function domRectRelativeToLayer(node, layer) {
    if (!node || !layer) return null;
    if (typeof node.getBoundingClientRect !== 'function') return null;
    if (typeof layer.getBoundingClientRect !== 'function') return null;
    const nodeRect = node.getBoundingClientRect();
    const layerRect = layer.getBoundingClientRect();
    const zoom = selectionOverlayZoom();
    return {
      left: (nodeRect.left - layerRect.left) / zoom,
      top: (nodeRect.top - layerRect.top) / zoom,
      width: nodeRect.width / zoom,
      height: nodeRect.height / zoom,
    };
  }

  function selectionOverlayZoom() {
    if (typeof RF !== 'undefined' && RF.Geometry && typeof RF.Geometry.zoom === 'function') {
      const z = Number(RF.Geometry.zoom());
      if (Number.isFinite(z) && z > 0) return z;
    }
    if (typeof DS !== 'undefined') {
      const z = Number(DS.zoom);
      if (Number.isFinite(z) && z > 0) return z;
    }
    return 1;
  }

  // RF-PREVIEW-BBOX-INK-1: the VISIBLE render-layer element (.cr-el) is the
  // ground truth the black ink is painted with. The hit-layer .pv-el sits in a
  // separately laid-out layer and can be ~1 logical px off (sub-pixel rounding
  // between the CSS-flow render sheet and the JS-positioned hit layer) — the
  // overlay must hug the ink, not the pv-el. Resolve the render node by the
  // same section + data-el-index the ink-diagnostic proved trustworthy; only
  // when it is UNAMBIGUOUS (static sections have one instance; detail rows
  // repeat -> fall back to the pv-el, unchanged behaviour).
  function findRenderInkElement(el) {
    if (!el || typeof document === 'undefined') return null;
    try {
      const secEls = (typeof DS !== 'undefined' && Array.isArray(DS.elements))
        ? DS.elements.filter((e) => e.sectionId === el.sectionId) : [];
      const idx = secEls.findIndex((e) => e.id === el.id);
      if (idx < 0) return null;
      const sid = (window.CSS && CSS.escape) ? CSS.escape(el.sectionId) : el.sectionId;
      const nodes = document.querySelectorAll(
        `#preview-content .preview-render-layer [data-section-id="${sid}"] [data-el-index="${idx}"]`);
      return nodes.length === 1 ? nodes[0] : null;
    } catch (_) { return null; }
  }

  // single visual-bbox source consumed by selection AND hover: render ink
  // first, hit-layer pv-el as a safe fallback, never flat model coords.
  function getPreviewVisualBBox(el, layer) {
    const ink = domRectRelativeToLayer(findRenderInkElement(el), layer);
    if (ink) return ink;
    const hit = domRectRelativeToLayer(findPreviewHitElement(el), layer);
    return hit || null;
  }

  function previewRect(el, layer) { return getPreviewVisualBBox(el, layer); }

  function selectionGuideThickness() {
    const zoom = selectionOverlayZoom();
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
    findPreviewHitElement,
    findRenderInkElement,
    getPreviewVisualBBox,
    domRectRelativeToLayer,
    selectionOverlayZoom,
    previewRect,
    selectionGuideThickness,
    appendSelectionGuide,
    renderSelectionGuides,
  };
})();

globalThis.SelectionOverlayPreview = SelectionOverlayPreview;

if (typeof module !== 'undefined') module.exports = SelectionOverlayPreview;
