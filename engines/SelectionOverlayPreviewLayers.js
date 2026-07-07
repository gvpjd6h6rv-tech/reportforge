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

  // Screen-space visible bounds — no layer/zoom conversion needed, because
  // the extended guide layer below lives OUTSIDE the zoomed/clipped canvas
  // subtree entirely (see RF-CR-GUIDE-UNCLIPPED-1). Returns null if
  // #workspace isn't resolvable (e.g. a non-browser test harness) so
  // callers can fall back to a safe default instead of a broken 0-size box.
  //
  // right/bottom are mode-specific. Preview has no field-explorer/status-bar
  // to avoid, so #workspace's own edge (minus the synthetic scrollbar
  // reserve) already IS the correct visible boundary. Design's #workspace
  // is NOT the right contract for right/bottom, though — #panel-right (the
  // field-explorer/properties column) is a sibling of #canvas-area, and
  // #statusbar a sibling further out still (both outside #workspace's own
  // box entirely, per the DOM in designer/crystal-reports-designer-v4.html)
  // — so Design's right/bottom endpoints are read directly off those two
  // elements instead: #panel-right's own left edge ("justo antes del panel
  // Explorador"), and #statusbar's own top edge ("margen inferior visible
  // antes de status/footer").
  function _visibleWorkspaceBoundsScreen(isPreviewMode) {
    if (typeof document === 'undefined') return null;
    const ws = document.getElementById('workspace');
    if (!ws || typeof ws.getBoundingClientRect !== 'function') return null;
    const wsRect = ws.getBoundingClientRect();

    let rightScreen = wsRect.right - _scrollbarReserve('v');
    let bottomScreen = wsRect.bottom - _scrollbarReserve('h');
    if (!isPreviewMode) {
      const panelRight = document.getElementById('panel-right');
      const statusbar = document.getElementById('statusbar');
      if (panelRight && typeof panelRight.getBoundingClientRect === 'function') {
        rightScreen = panelRight.getBoundingClientRect().left;
      }
      if (statusbar && typeof statusbar.getBoundingClientRect === 'function') {
        bottomScreen = statusbar.getBoundingClientRect().top;
      }
    }

    return { left: wsRect.left, top: wsRect.top, right: rightScreen, bottom: bottomScreen };
  }

  // RF-CR-GUIDE-UNCLIPPED-1: #canvas-layer has `overflow: hidden` (canvas.css)
  // and is sized to the PAGE, not the workspace. A guide element living
  // inside it (the old architecture: appended to `layer`, itself a
  // descendant of #canvas-layer) reports the CORRECT position via
  // getBoundingClientRect — that's pure geometry, unaffected by clipping —
  // but its PAINT gets cut off at #canvas-layer's own edge whenever the
  // page is smaller than the workspace (typical in Design at low/moderate
  // zoom). Proven live: DOM rect said the guide reached #panel-right/
  // #statusbar exactly (delta 0), while the actual selection LAYER rect
  // (also inside #canvas-layer) measured far smaller than that — the ink
  // was being silently clipped despite the geometry being right.
  //
  // Fix: the extended guide lines live in their own `position: fixed`
  // layer appended to <body>, entirely outside #canvas-layer/#viewport/
  // #workspace's clip subtrees — fixed positioning is immune to ANY
  // ancestor's overflow. Positioned in SCREEN coordinates computed from the
  // selection box's own on-screen rect (same technique paintRulerHighlight
  // already uses), not layer-local pre-transform units.
  const EXTENDED_GUIDE_LAYER_ID = 'rf-extended-guide-layer';

  function _ensureExtendedGuideLayer() {
    if (typeof document === 'undefined' || !document.body) return null;
    let layer = document.getElementById(EXTENDED_GUIDE_LAYER_ID);
    if (!layer) {
      layer = document.createElement('div');
      layer.id = EXTENDED_GUIDE_LAYER_ID;
      layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9997;overflow:visible';
      document.body.appendChild(layer);
    }
    return layer;
  }

  function clearExtendedGuides() {
    const layer = typeof document !== 'undefined' ? document.getElementById(EXTENDED_GUIDE_LAYER_ID) : null;
    if (layer) layer.innerHTML = '';
  }

  // RF-CR-GUIDE-RULER-CROSS-1: a guide element lives inside #workspace's own
  // subtree (#viewport > #canvas-layer > layer), so it is clipped by
  // #workspace's `overflow:auto` at #workspace's own edge — it can be
  // positioned exactly UP TO that edge (RF-CR-GUIDE-EXTENT-1 above) but can
  // never visually cross INTO the ruler, a sibling element entirely outside
  // #workspace's box. Crystal's left/top guide ends visibly overlap the
  // ruler's own interior, so that portion has to be a SEPARATE stub painted
  // directly on the ruler host (#ruler-v / #ruler-h-row), at the guide's own
  // on-screen position — taken from the already-appended guide element's
  // getBoundingClientRect() (post-transform, matches paintRulerHighlight's
  // approach below) rather than re-deriving the zoom/scroll math a second
  // time. Right/bottom guide ends need no such stub — #workspace's own edge
  // there already IS the visible boundary (before the field-explorer panel /
  // the visible bottom margin), nothing further to reach.
  const RULER_GUIDE_STUB_CLASS = 'rf-ruler-guide-stub';

  // #ruler-v already has `position: relative` in its own CSS rule
  // (canvas.css), but #ruler-h-row does not (only display:flex) — an
  // absolutely-positioned child of a `position: static` host escapes to
  // whatever positioned ancestor is further up the tree instead (proven
  // live: a ruler-h-row child rendered `height: 1000` — the full page
  // height — instead of ruler-h-row's own 22px). Idempotent either way, so
  // this is set unconditionally on every host used for these overlays
  // rather than only on the one CSS is missing it for.
  function _ensureRulerHostPositioned(host) {
    host.style.position = 'relative';
  }

  function _rulerGuideStubEl(hostId, key) {
    if (typeof document === 'undefined') return null;
    const host = document.getElementById(hostId);
    if (!host) return null;
    _ensureRulerHostPositioned(host);
    const cls = `${RULER_GUIDE_STUB_CLASS}-${key}`;
    let el = host.querySelector(`:scope > .${cls}`);
    if (!el) {
      el = document.createElement('div');
      el.className = `${RULER_GUIDE_STUB_CLASS} ${cls}`;
      el.style.position = 'absolute';
      el.style.pointerEvents = 'none';
      el.style.zIndex = '6';
      host.appendChild(el);
    }
    return { host, el };
  }

  function _paintRulerGuideStub(guideEl, axis, thickness, color, key) {
    if (typeof document === 'undefined' || !guideEl) return;
    const guideRect = guideEl.getBoundingClientRect();
    if (axis === 'h') {
      // left endpoint only -> crosses into the LEFT (vertical) ruler
      const stub = _rulerGuideStubEl('ruler-v', key);
      if (!stub) return;
      const hostRect = stub.host.getBoundingClientRect();
      const cy = guideRect.top + guideRect.height / 2;
      Object.assign(stub.el.style, {
        left: '0px', width: '100%',
        top: `${cy - hostRect.top - GUIDE_HIT_PAD}px`, height: `${GUIDE_HIT_PAD * 2}px`,
        background: `linear-gradient(${color},${color}) center / 100% ${thickness}px no-repeat`,
      });
    } else {
      // top endpoint only -> crosses into the TOP (horizontal) ruler
      const stub = _rulerGuideStubEl('ruler-h-row', key);
      if (!stub) return;
      const hostRect = stub.host.getBoundingClientRect();
      const cx = guideRect.left + guideRect.width / 2;
      Object.assign(stub.el.style, {
        top: '0px', height: '100%',
        left: `${cx - hostRect.left - GUIDE_HIT_PAD}px`, width: `${GUIDE_HIT_PAD * 2}px`,
        background: `linear-gradient(${color},${color}) center / ${thickness}px 100% no-repeat`,
      });
    }
  }

  function clearRulerGuideStubs() {
    if (typeof document === 'undefined' || typeof document.querySelectorAll !== 'function') return;
    document.querySelectorAll(`.${RULER_GUIDE_STUB_CLASS}`).forEach((el) => el.remove());
  }

  function _guideLineEl(hostLayer, axis, key) {
    const cls = `selection-guide-key-${key}`;
    let el = hostLayer.querySelector(`:scope > .${cls}`);
    if (!el) {
      el = document.createElement('div');
      el.className = `selection-guide selection-guide-${axis} ${cls}`;
      el.style.position = 'absolute';
      el.style.pointerEvents = 'none';
      el.style.zIndex = '27';
      hostLayer.appendChild(el);
    }
    return el;
  }

  // hostLayer/screenEdge/screenBounds are all SCREEN coordinates — this
  // paints directly into the unclipped extended-guide layer (RF-CR-GUIDE-
  // UNCLIPPED-1). `key` makes repeated calls during an ongoing drag update
  // the SAME element in place instead of accumulating duplicates (the old
  // architecture got this for free because the whole selection layer was
  // wiped before every render; this layer is separate and persistent, so it
  // needs its own get-or-create, same pattern as the ruler stubs/highlight).
  function appendSelectionGuide(hostLayer, axis, screenEdge, screenBounds, key) {
    const guide = _guideLineEl(hostLayer, axis, key);
    const thickness = selectionGuideThickness();
    const color = 'rgba(255, 32, 32, 0.9)';
    if (axis === 'h') {
      const spanW = screenBounds ? screenBounds.right - screenBounds.left : NaN;
      guide.style.left = `${screenBounds ? screenBounds.left : 0}px`;
      guide.style.width = spanW > 0 ? `${spanW}px` : '100%';
      guide.style.top = `${screenEdge - GUIDE_HIT_PAD}px`;
      guide.style.height = `${GUIDE_HIT_PAD * 2}px`;
      guide.style.background = `linear-gradient(${color},${color}) center / 100% ${thickness}px no-repeat`;
    } else {
      const spanH = screenBounds ? screenBounds.bottom - screenBounds.top : NaN;
      guide.style.top = `${screenBounds ? screenBounds.top : 0}px`;
      guide.style.height = spanH > 0 ? `${spanH}px` : '100%';
      guide.style.left = `${screenEdge - GUIDE_HIT_PAD}px`;
      guide.style.width = `${GUIDE_HIT_PAD * 2}px`;
      guide.style.background = `linear-gradient(${color},${color}) center / ${thickness}px 100% no-repeat`;
    }
    _paintRulerGuideStub(guide, axis, thickness, color, key);
  }

  // All four guides anchor to the rect's own OUTER/visual edge — the same
  // convention on all sides. bottom/right used to subtract a leftover
  // `borderWidth` (1px) inset from an older flat-border implementation,
  // landing them one device px INSIDE the box instead of exactly on its
  // visible line, while top/left (which never had that subtraction) landed
  // correctly. Removed: rect.top+rect.height and rect.left+rect.width are
  // themselves already the box's bottom/right edge, nothing to subtract.
  //
  // Both horizontal guides (top-of-box and bottom-of-box) get their own
  // ruler-v stub — Crystal marks each one's own height on the left ruler
  // separately, same as the pair of red lines already drawn in the
  // workspace. Same for both vertical guides against the top ruler. The
  // guides' RIGHT/BOTTOM ends need no stub — #workspace's own edge there
  // already IS the visible boundary (before the field-explorer panel / the
  // visible bottom margin), nothing further to reach
  // (RF-CR-GUIDE-RULER-CROSS-1 is a left/top-only correction).
  //
  // `layer`/`rects` stay in the SAME layer-local pre-transform units every
  // caller (SelectionOverlayRender.js, SelectionOverlayRenderHelpers.js)
  // already passes — converted to SCREEN units here via layer's own
  // getBoundingClientRect() + zoom, once, then handed to the unclipped
  // extended-guide layer (RF-CR-GUIDE-UNCLIPPED-1).
  function renderSelectionGuides(layer, rects) {
    if (typeof document === 'undefined' || !layer) return;
    const zoom = globalThis.SelectionOverlayPreview.selectionOverlayZoom();
    const isPreviewMode = !!(typeof DS !== 'undefined' && DS.previewMode);
    const guideLayer = _ensureExtendedGuideLayer();
    if (!guideLayer) return;
    const layerRect = layer.getBoundingClientRect();
    const screenBounds = _visibleWorkspaceBoundsScreen(isPreviewMode);
    rects.forEach((rect, i) => {
      if (!rect) return;
      const screenTop = layerRect.top + rect.top * zoom;
      const screenBottom = layerRect.top + (rect.top + rect.height) * zoom;
      const screenLeft = layerRect.left + rect.left * zoom;
      const screenRight = layerRect.left + (rect.left + rect.width) * zoom;
      appendSelectionGuide(guideLayer, 'h', screenTop, screenBounds, `${i}-h-top`);
      appendSelectionGuide(guideLayer, 'h', screenBottom, screenBounds, `${i}-h-bottom`);
      appendSelectionGuide(guideLayer, 'v', screenLeft, screenBounds, `${i}-v-left`);
      appendSelectionGuide(guideLayer, 'v', screenRight, screenBounds, `${i}-v-right`);
    });
  }

  // RF-CR-RULER-HIGHLIGHT-1: Crystal shades the top ruler orange across the
  // selected element's width, and the left ruler orange across its height —
  // in BOTH Design and Preview, gesture-gated exactly like the guide lines
  // above (CR-PARITY-1): shown only while a move/resize is in progress,
  // gone on mouseup. (An earlier version made this persistent-while-
  // selected instead — corrected against real Crystal Reports behavior,
  // which hides it on mouseup same as the guides.) One shared
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
    _ensureRulerHostPositioned(host);
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
      // Clamp to #ruler-h-canvas's own real tick/number area (a flex sibling
      // of #ruler-corner INSIDE #ruler-h-row) so the shading never spills
      // over the corner square, which is decorative and not part of the
      // actual horizontal ruler.
      const canvasBox = document.getElementById('ruler-h-canvas');
      const canvasRect = canvasBox ? canvasBox.getBoundingClientRect() : hostRect;
      const left = Math.max(screenRect.left, canvasRect.left);
      const right = Math.min(screenRect.left + screenRect.width, canvasRect.right);
      const width = Math.max(0, right - left);
      h.el.style.left = `${left - hostRect.left}px`;
      h.el.style.width = `${width}px`;
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
    clearExtendedGuides,
    clearRulerGuideStubs,
    paintRulerHighlight,
    clearRulerHighlight,
  };
})();

globalThis.SelectionOverlayPreviewLayers = SelectionOverlayPreviewLayers;

if (typeof module !== 'undefined') module.exports = SelectionOverlayPreviewLayers;
