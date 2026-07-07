'use strict';

const SelectionOverlayPreview = (() => {
  // Overlay-layer creation (ensurePreviewSelectionLayer/ensurePreviewHoverLayer)
  // and selection-guide rendering live in SelectionOverlayPreviewLayers.js —
  // extracted to stay under this file's governance byte threshold. Re-bound
  // below under the same names so every external caller is unaffected.
  const L = typeof SelectionOverlayPreviewLayers !== 'undefined' ? SelectionOverlayPreviewLayers
    : (typeof globalThis !== 'undefined' && globalThis.SelectionOverlayPreviewLayers) ? globalThis.SelectionOverlayPreviewLayers
    : typeof require === 'function' ? require('./SelectionOverlayPreviewLayers.js') : null;

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

  return {
    ensurePreviewSelectionLayer: L.ensurePreviewSelectionLayer,
    ensurePreviewHoverLayer: L.ensurePreviewHoverLayer,
    findPreviewHitElement,
    findRenderInkElement,
    getPreviewVisualBBox,
    domRectRelativeToLayer,
    selectionOverlayZoom,
    previewRect,
    selectionGuideThickness: L.selectionGuideThickness,
    appendSelectionGuide: L.appendSelectionGuide,
    renderSelectionGuides: L.renderSelectionGuides,
  };
})();

globalThis.SelectionOverlayPreview = SelectionOverlayPreview;

if (typeof module !== 'undefined') module.exports = SelectionOverlayPreview;
