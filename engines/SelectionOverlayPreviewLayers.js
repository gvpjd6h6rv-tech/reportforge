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

  // RF-CR-GUIDE-EXTENT-1: Crystal's guides run the full visible workspace,
  // not just the selected element's own bbox — before this, `left:0;
  // width:100%`/`top:0;height:100%` were 100% of `layer` itself, which in
  // Preview is sized to the PAGE content div, not the scrollable workspace
  // viewport, so guides fell short of the rulers/right edge whenever the
  // workspace was wider than the page. #workspace (flex:1, the single
  // scrollable container shared by Design and Preview — see canvas.css) is
  // the visible-bounds ground truth for BOTH modes: its own edges already
  // land exactly at the ruler (flex sibling of #ruler-v) and exactly before
  // the field-explorer panel (flex:1 fills the remaining row) with no extra
  // lookup needed. The synthetic vertical/horizontal scrollbars are
  // position:fixed overlays (not flex siblings, so they don't shrink
  // #workspace's own box) — their reserved space is subtracted explicitly
  // so guides stop before the scrollbar, not under it.
  function _scrollbarReserve(axis) {
    if (typeof document === 'undefined') return 0;
    const track = document.querySelector(`.rf-scrollbar-track--${axis}`);
    if (!track || getComputedStyle(track).display === 'none') return 0;
    const r = track.getBoundingClientRect();
    return axis === 'v' ? r.width : r.height;
  }

  // Converts #workspace's visible screen rect into `layer`-local (pre-
  // transform) units — same conversion SelectionOverlayPreview.
  // domRectRelativeToLayer already uses for element rects, applied here to
  // the workspace viewport instead. Returns null if #workspace/layer aren't
  // resolvable (e.g. a non-browser test harness) so callers can fall back
  // to the old 100%-of-layer behavior instead of drawing a broken 0-size box.
  function _visibleWorkspaceBoundsLocal(layer, zoom) {
    if (typeof document === 'undefined' || !layer) return null;
    const ws = document.getElementById('workspace');
    if (!ws || typeof ws.getBoundingClientRect !== 'function') return null;
    if (typeof layer.getBoundingClientRect !== 'function') return null;
    const wsRect = ws.getBoundingClientRect();
    const layerRect = layer.getBoundingClientRect();
    const z = Number(zoom) > 0 ? Number(zoom) : 1;
    const vReserve = _scrollbarReserve('v');
    const hReserve = _scrollbarReserve('h');
    return {
      left: (wsRect.left - layerRect.left) / z,
      top: (wsRect.top - layerRect.top) / z,
      right: (wsRect.right - vReserve - layerRect.left) / z,
      bottom: (wsRect.bottom - hReserve - layerRect.top) / z,
    };
  }

  function appendSelectionGuide(layer, rect, axis, edge, bounds) {
    const guide = document.createElement('div');
    const thickness = selectionGuideThickness();
    const color = 'rgba(255, 32, 32, 0.9)';
    guide.className = `selection-guide selection-guide-${axis}`;
    guide.dataset.edge = edge;
    guide.style.position = 'absolute';
    guide.style.pointerEvents = 'none';
    guide.style.zIndex = '27';
    if (axis === 'h') {
      const spanW = bounds ? bounds.right - bounds.left : NaN;
      guide.style.left = `${bounds ? bounds.left : 0}px`;
      guide.style.width = spanW > 0 ? `${spanW}px` : '100%';
      guide.style.top = `${edge - GUIDE_HIT_PAD}px`;
      guide.style.height = `${GUIDE_HIT_PAD * 2}px`;
      guide.style.background = `linear-gradient(${color},${color}) center / 100% ${thickness}px no-repeat`;
    } else {
      const spanH = bounds ? bounds.bottom - bounds.top : NaN;
      guide.style.top = `${bounds ? bounds.top : 0}px`;
      guide.style.height = spanH > 0 ? `${spanH}px` : '100%';
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
    const zoom = globalThis.SelectionOverlayPreview.selectionOverlayZoom();
    const bounds = _visibleWorkspaceBoundsLocal(layer, zoom);
    rects.forEach(rect => {
      if (!rect) return;
      appendSelectionGuide(layer, rect, 'h', rect.top, bounds);
      appendSelectionGuide(layer, rect, 'h', rect.top + rect.height, bounds);
      appendSelectionGuide(layer, rect, 'v', rect.left, bounds);
      appendSelectionGuide(layer, rect, 'v', rect.left + rect.width, bounds);
    });
  }

  // RF-CR-RULER-HIGHLIGHT-1: Crystal shades the top ruler orange across the
  // selected element's width, and the left ruler orange across its height —
  // in BOTH Design and Preview, for any selection (not gesture-gated like
  // the guide lines above — CR-PARITY-1 keeps that restriction, this is a
  // separate, persistent-while-selected indicator). One shared
  // implementation for both modes: #ruler-h-row/#ruler-v are the SAME
  // elements regardless of DS.previewMode, so there is nothing to branch on.
  // Positioned from the box's own SCREEN rect (getBoundingClientRect, post-
  // transform) rather than the layer-local pre-transform rect used above —
  // the rulers live outside the zoomed #canvas-layer/#viewport subtree
  // entirely, so this is a plain screen-to-screen offset, no zoom division.
  const RULER_HIGHLIGHT_CLASS = 'rf-ruler-highlight';
  const RULER_HIGHLIGHT_COLOR = 'rgba(255, 153, 0, 0.35)';

  function _rulerHighlightEl(hostId, side) {
    if (typeof document === 'undefined') return null;
    const host = document.getElementById(hostId);
    if (!host) return null;
    const cls = `${RULER_HIGHLIGHT_CLASS}-${side}`;
    let el = host.querySelector(`:scope > .${cls}`);
    if (!el) {
      el = document.createElement('div');
      el.className = `${RULER_HIGHLIGHT_CLASS} ${cls}`;
      el.style.position = 'absolute';
      el.style.pointerEvents = 'none';
      el.style.background = RULER_HIGHLIGHT_COLOR;
      el.style.zIndex = '5';
      host.appendChild(el);
    }
    return { host, el };
  }

  function paintRulerHighlight(screenRect) {
    if (typeof document === 'undefined' || !screenRect) return;
    const h = _rulerHighlightEl('ruler-h-row', 'h');
    if (h) {
      const hostRect = h.host.getBoundingClientRect();
      h.el.style.left = `${screenRect.left - hostRect.left}px`;
      h.el.style.width = `${screenRect.width}px`;
      h.el.style.top = '0px';
      h.el.style.height = '100%';
    }
    const v = _rulerHighlightEl('ruler-v', 'v');
    if (v) {
      const hostRect = v.host.getBoundingClientRect();
      v.el.style.top = `${screenRect.top - hostRect.top}px`;
      v.el.style.height = `${screenRect.height}px`;
      v.el.style.left = '0px';
      v.el.style.width = '100%';
    }
  }

  function clearRulerHighlight() {
    if (typeof document === 'undefined') return;
    const h = document.querySelector(`#ruler-h-row > .${RULER_HIGHLIGHT_CLASS}-h`);
    const v = document.querySelector(`#ruler-v > .${RULER_HIGHLIGHT_CLASS}-v`);
    if (h) h.remove();
    if (v) v.remove();
  }

  return {
    ensurePreviewSelectionLayer,
    ensurePreviewHoverLayer,
    selectionGuideThickness,
    appendSelectionGuide,
    renderSelectionGuides,
    paintRulerHighlight,
    clearRulerHighlight,
  };
})();

globalThis.SelectionOverlayPreviewLayers = SelectionOverlayPreviewLayers;

if (typeof module !== 'undefined') module.exports = SelectionOverlayPreviewLayers;
