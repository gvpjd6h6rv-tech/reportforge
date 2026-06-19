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

  function ensurePreviewSelectionLayer() {
    if (typeof document === 'undefined') return null;
    const content = document.querySelector('#preview-content');
    const hitLayer = document.querySelector('#preview-content .preview-hit-layer');
    if (!content || !hitLayer) return null;
    let layer = content.querySelector(':scope > .preview-selection-layer');
    if (!layer) {
      layer = document.createElement('div');
      layer.className = 'preview-selection-layer';
      layer.dataset.selectionLayer = 'preview';
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
    layer.style.zIndex = '9999';
    layer.style.opacity = '1';
    layer.style.visibility = 'visible';
    layer.style.display = 'block';
    layer.style.transform = hitLayer.style.transform || hitLayerStyle.transform || 'none';
    layer.style.transformOrigin = hitLayer.style.transformOrigin || 'top left';
    return layer;
  }

  function findPreviewHitElement(el) {
    if (!el || typeof document === 'undefined') return null;
    const id = String(el.id || '');
    const nodes = document.querySelectorAll(
      '#preview-content .preview-hit-layer .pv-el, #preview-content .preview-hit-layer .cr-element'
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

  function previewRect(el, layer) {
    const previewNode = findPreviewHitElement(el);
    const domRect = domRectRelativeToLayer(previewNode, layer);
    if (domRect) return domRect;
    const secTop = SelectionState.getSectionTop(el.sectionId);
    return { left: el.x, top: secTop + el.y, width: el.w, height: el.h };
  }

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
    findPreviewHitElement,
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
