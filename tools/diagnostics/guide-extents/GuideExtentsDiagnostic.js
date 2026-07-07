'use strict';

// UDS 4.1 — TEMPORARY, single-purpose diagnostic. One job only: prove
// (from a REAL browser tab, not a headless re-derivation) whether the
// selection guides' right/bottom endpoints in Design mode actually reach
// #panel-right / #statusbar, or still stop at #workspace/canvas bounds.
// Zero effect unless URL has ?rf_guide_extents=1 or
// window.RF_GUIDE_EXTENTS === true. Read-only: force-renders the guides
// via the real SelectionOverlayPreviewLayers.renderSelectionGuides call
// (the same one a live drag makes — CR-PARITY-1 gates guides to drag-only,
// so there is nothing else to measure them by), then removes exactly what
// it added. Never touches the box, PDF, ink, or stroke thickness.
// Removable in one commit (delete this file + its <script> tag).
(function initGuideExtentsDiagnostic(global) {
  const on = (() => {
    try {
      if (global.RF_GUIDE_EXTENTS === true) return true;
      return /[?&]rf_guide_extents=1\b/.test(global.location ? global.location.search : '');
    } catch (_) { return false; }
  })();
  if (!on || typeof document === 'undefined') return;

  function _round(r) {
    if (!r) return null;
    return { left: Math.round(r.left * 100) / 100, top: Math.round(r.top * 100) / 100, width: Math.round(r.width * 100) / 100, height: Math.round(r.height * 100) / 100 };
  }

  function _rectOf(id) {
    const el = document.getElementById(id);
    return el ? _round(el.getBoundingClientRect()) : null;
  }

  function scan() {
    const previewMode = !!(typeof DS !== 'undefined' && DS.previewMode);
    const zoom = (typeof SelectionOverlayPreview !== 'undefined' && typeof SelectionOverlayPreview.selectionOverlayZoom === 'function')
      ? SelectionOverlayPreview.selectionOverlayZoom()
      : ((typeof DS !== 'undefined' && Number(DS.zoom) > 0) ? Number(DS.zoom) : 1);
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;

    const L = (typeof SelectionOverlayPreviewLayers !== 'undefined') ? SelectionOverlayPreviewLayers : null;
    const Prev = (typeof SelectionOverlayPreview !== 'undefined') ? SelectionOverlayPreview : null;
    const ownerSource = {
      renderSelectionGuidesPresent: !!(L && typeof L.renderSelectionGuides === 'function'),
      renderSelectionGuidesSource: (L && typeof L.renderSelectionGuides === 'function') ? L.renderSelectionGuides.toString() : null,
      appendSelectionGuidePresent: !!(L && typeof L.appendSelectionGuide === 'function'),
      appendSelectionGuideSource: (L && typeof L.appendSelectionGuide === 'function') ? L.appendSelectionGuide.toString() : null,
      // _visibleWorkspaceBoundsLocal is a private closure inside
      // SelectionOverlayPreviewLayers.js, not exposed on the public API —
      // this scan verifies its effect on the ACTUAL rendered guide rects
      // below instead of reading its source text.
    };
    if (!L || !Prev) {
      return { status: 'CACHE_OR_STALE_OWNER_UNVERIFIED', reason: 'SelectionOverlayPreviewLayers/SelectionOverlayPreview not present on window', zoom, devicePixelRatio: dpr, previewMode, ownerSource };
    }

    const selBoxEl = document.querySelector('.preview-selection-layer .sel-box, #handles-layer .sel-box');
    if (!selBoxEl) {
      return { status: 'NO_SELECTION', reason: 'select an element first', zoom, devicePixelRatio: dpr, previewMode, ownerSource };
    }

    const layer = previewMode ? Prev.ensurePreviewSelectionLayer() : document.getElementById('handles-layer');
    if (!layer) {
      return { status: 'CACHE_OR_STALE_OWNER_UNVERIFIED', reason: 'selection layer not resolvable', zoom, devicePixelRatio: dpr, previewMode, ownerSource };
    }

    const localRect = Prev.domRectRelativeToLayer(selBoxEl, layer) || {
      left: 0, top: 0,
      width: selBoxEl.getBoundingClientRect().width / zoom,
      height: selBoxEl.getBoundingClientRect().height / zoom,
    };

    // Force-render via the REAL call a drag would make. Guides live in the
    // dedicated extended-guide layer (RF-CR-GUIDE-UNCLIPPED-1), not `layer`
    // itself — that's the whole point of the fix, so this scan must look
    // there, not in the old (clipped) location.
    const guideLayer = document.getElementById('rf-extended-guide-layer');
    const before = guideLayer ? new Set(guideLayer.querySelectorAll(':scope > .selection-guide')) : new Set();
    L.renderSelectionGuides(layer, [localRect]);
    const guideLayerAfter = document.getElementById('rf-extended-guide-layer');
    const guides = guideLayerAfter ? [...guideLayerAfter.querySelectorAll(':scope > .selection-guide')].filter((g) => !before.has(g)) : [];
    const hRects = guides.filter((g) => g.className.includes('selection-guide-h')).map((g) => _round(g.getBoundingClientRect()));
    const vRects = guides.filter((g) => g.className.includes('selection-guide-v')).map((g) => _round(g.getBoundingClientRect()));

    const workspaceRect = _rectOf('workspace');
    const panelRightRect = _rectOf('panel-right');
    const statusbarRect = _rectOf('statusbar');

    const expectedRight = previewMode ? (workspaceRect ? workspaceRect.left + workspaceRect.width : null) : (panelRightRect ? panelRightRect.left : null);
    const expectedBottom = previewMode ? (workspaceRect ? workspaceRect.top + workspaceRect.height : null) : (statusbarRect ? statusbarRect.top : null);
    const actualRight = hRects.length ? Math.max(...hRects.map((r) => r.left + r.width)) : null;
    const actualBottom = vRects.length ? Math.max(...vRects.map((r) => r.top + r.height)) : null;

    const TOL = 1.5; // px — sub-pixel rounding, not a real mismatch
    const round2 = (n) => Math.round(n * 100) / 100;
    const rightDelta = (actualRight != null && expectedRight != null) ? round2(actualRight - expectedRight) : null;
    const bottomDelta = (actualBottom != null && expectedBottom != null) ? round2(actualBottom - expectedBottom) : null;
    const domRightOk = rightDelta != null && Math.abs(rightDelta) <= TOL;
    const domBottomOk = bottomDelta != null && Math.abs(bottomDelta) <= TOL;

    // "Visible ink" check, not just DOM rect: getBoundingClientRect reports
    // the INTENDED geometry regardless of whether an ancestor's
    // overflow:hidden actually clips the paint (that's precisely how the
    // previous bug hid — DOM said OK, paint was cut off by #canvas-layer).
    // document.elementFromPoint DOES hit-test through real clipping (a
    // clipped-away element is never returned), so it is a true in-page
    // proxy for "is this ink actually painted here" without needing an
    // external screenshot. pointer-events:none defeats elementFromPoint too
    // (by design, everywhere in this codebase's overlays), so it's toggled
    // on just for the probe element and restored immediately after.
    // This diagnostic's OWN panel (#rf-guide-extents-ui, bottom-left,
    // z-index 2147483600 — deliberately above everything so its own SCAN/
    // COPY buttons stay clickable) sits on top of the guide layer
    // (z-index 9997) at the exact screen region a bottom-guide probe point
    // typically falls in. Left in place, elementFromPoint would return the
    // panel instead of the guide — a false CLIPPED_BY_ANCESTOR caused by
    // this tool's own UI, not the guides. Hidden for the probe, restored
    // right after.
    function _isPaintedAt(el, x, y) {
      if (!el) return false;
      const ownPanel = document.getElementById('rf-guide-extents-ui');
      const prevPanelDisplay = ownPanel ? ownPanel.style.display : null;
      if (ownPanel) ownPanel.style.display = 'none';
      const prevPE = el.style.pointerEvents;
      let prevLayerPE = null;
      if (guideLayerAfter) { prevLayerPE = guideLayerAfter.style.pointerEvents; guideLayerAfter.style.pointerEvents = 'auto'; }
      el.style.pointerEvents = 'auto';
      void el.offsetHeight; // force a layout/paint flush before hit-testing — elementFromPoint must see the just-applied changes, not a stale frame
      let hit;
      try { hit = document.elementFromPoint(x, y); } finally {
        el.style.pointerEvents = prevPE;
        if (guideLayerAfter) guideLayerAfter.style.pointerEvents = prevLayerPE;
        if (ownPanel) ownPanel.style.display = prevPanelDisplay;
      }
      return hit === el || (typeof el.contains === 'function' && el.contains(hit));
    }

    const hGuide = guides.find((g) => g.className.includes('selection-guide-h'));
    const vGuide = guides.find((g) => g.className.includes('selection-guide-v'));
    const rightRasterOk = (hGuide && expectedRight != null)
      ? _isPaintedAt(hGuide, Math.round(expectedRight) - 5, Math.round(hGuide.getBoundingClientRect().top + hGuide.getBoundingClientRect().height / 2))
      : null;
    const bottomRasterOk = (vGuide && expectedBottom != null)
      ? _isPaintedAt(vGuide, Math.round(vGuide.getBoundingClientRect().left + vGuide.getBoundingClientRect().width / 2), Math.round(expectedBottom) - 5)
      : null;

    const _status = (domOk, rasterOk) => {
      if (rasterOk == null) return 'CACHE_OR_STALE_OWNER_UNVERIFIED';
      if (domOk && rasterOk) return 'OK';
      if (domOk && !rasterOk) return 'CLIPPED_BY_ANCESTOR';
      return 'FAIL';
    };

    // Clean up: remove exactly the guide elements this scan added, plus the
    // ruler-crossing stubs they trigger as a side effect — leave zero trace.
    guides.forEach((g) => g.remove());
    if (typeof Prev.clearRulerGuideStubs === 'function') Prev.clearRulerGuideStubs();

    return {
      status: 'OWNER_SCRIPT_LOADED_OK',
      zoom, devicePixelRatio: dpr, previewMode,
      selectedBoxRect: _round(selBoxEl.getBoundingClientRect()),
      selectionLayerRect: _round(layer.getBoundingClientRect()),
      extendedGuideLayerRect: guideLayerAfter ? _round(guideLayerAfter.getBoundingClientRect()) : null,
      workspaceRect,
      canvasRect: _rectOf('canvas-layer'),
      panelRightRect,
      fieldExplorerRect: _rectOf('field-explorer'),
      statusbarRect,
      horizontalRulerStripRect: _rectOf('ruler-h-row'),
      verticalRulerStripRect: _rectOf('ruler-v'),
      horizontalGuideRects: hRects,
      verticalGuideRects: vRects,
      DESIGN_GUIDE_RIGHT_ACTUAL: actualRight,
      DESIGN_GUIDE_RIGHT_EXPECTED: expectedRight,
      DESIGN_GUIDE_RIGHT_DELTA: rightDelta,
      DESIGN_GUIDE_RIGHT_DOM_STATUS: domRightOk ? 'DESIGN_GUIDE_RIGHT_DOM_OK' : 'DESIGN_GUIDE_RIGHT_DOM_FAIL',
      DESIGN_GUIDE_RIGHT_RASTER_STATUS: rightRasterOk == null ? 'UNVERIFIED' : (rightRasterOk ? 'DESIGN_GUIDE_RIGHT_RASTER_OK' : 'DESIGN_GUIDE_RIGHT_RASTER_FAIL'),
      DESIGN_GUIDE_RIGHT_STATUS: _status(domRightOk, rightRasterOk),
      DESIGN_GUIDE_BOTTOM_ACTUAL: actualBottom,
      DESIGN_GUIDE_BOTTOM_EXPECTED: expectedBottom,
      DESIGN_GUIDE_BOTTOM_DELTA: bottomDelta,
      DESIGN_GUIDE_BOTTOM_DOM_STATUS: domBottomOk ? 'DESIGN_GUIDE_BOTTOM_DOM_OK' : 'DESIGN_GUIDE_BOTTOM_DOM_FAIL',
      DESIGN_GUIDE_BOTTOM_RASTER_STATUS: bottomRasterOk == null ? 'UNVERIFIED' : (bottomRasterOk ? 'DESIGN_GUIDE_BOTTOM_RASTER_OK' : 'DESIGN_GUIDE_BOTTOM_RASTER_FAIL'),
      DESIGN_GUIDE_BOTTOM_STATUS: _status(domBottomOk, bottomRasterOk),
      ownerSource,
    };
  }

  function _mkBtn(label, bg, fn) {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = `background:${bg};color:#fff;border:0;border-radius:5px;padding:6px 10px;cursor:pointer;font:11px/1 sans-serif`;
    b.addEventListener('click', fn);
    return b;
  }

  // navigator.clipboard needs a secure context (https, or localhost — both
  // fine here); execCommand('copy') via a throwaway textarea is the
  // fallback for anything older/restricted. Either way, never throws — the
  // JSON is still on-screen in `pre` for manual selection if both fail.
  function _copyText(text, onDone) {
    if (global.navigator && global.navigator.clipboard && global.navigator.clipboard.writeText) {
      global.navigator.clipboard.writeText(text).then(() => onDone(true), () => onDone(false));
      return;
    }
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      onDone(ok);
    } catch (_) { onDone(false); }
  }

  function _buildUi() {
    if (!document.body || document.getElementById('rf-guide-extents-ui')) return;
    const panel = document.createElement('div');
    panel.id = 'rf-guide-extents-ui';
    panel.style.cssText = 'position:fixed;left:12px;bottom:12px;width:420px;height:280px;z-index:2147483600;background:#1e1e1e;color:#ddd;border:1px solid #555;border-radius:8px;box-shadow:0 8px 28px rgba(0,0,0,.5);display:flex;flex-direction:column;overflow:hidden;resize:both;font:11px/1.35 monospace';
    const header = document.createElement('div');
    header.textContent = '📏 GUIDE EXTENTS';
    header.style.cssText = 'flex:0 0 auto;padding:6px 8px;background:#2d2d2d;border-bottom:1px solid #555;font-weight:bold';
    const pre = document.createElement('pre');
    pre.id = 'rf-guide-extents-out';
    pre.style.cssText = 'flex:1;margin:0;padding:8px;overflow:auto;white-space:pre-wrap;word-break:break-word';
    pre.textContent = 'select an element in Design, then click SCAN';
    const footer = document.createElement('div');
    footer.style.cssText = 'flex:0 0 auto;display:flex;gap:6px;padding:6px 8px;border-top:1px solid #555';
    const copyBtn = _mkBtn('COPY', '#06c', () => {
      _copyText(pre.textContent, (ok) => {
        const original = copyBtn.textContent;
        copyBtn.textContent = ok ? '✓ Copied' : '✗ Copy failed — select manually';
        global.setTimeout(() => { copyBtn.textContent = original; }, 1500);
      });
    });
    footer.appendChild(_mkBtn('SCAN', '#2e7d32', () => {
      const result = scan();
      console.log('[GUIDE_EXTENTS]', result);
      pre.textContent = JSON.stringify(result, null, 2);
    }));
    footer.appendChild(copyBtn);
    panel.appendChild(header); panel.appendChild(pre); panel.appendChild(footer);
    document.body.appendChild(panel);
  }

  global.GuideExtentsDiagnostic = { scan };
  if (document.body) _buildUi(); else document.addEventListener('DOMContentLoaded', _buildUi);
  console.log('[GUIDE_EXTENTS] active — select an element in Design, click SCAN (bottom-left panel), or call window.GuideExtentsDiagnostic.scan()');
})(typeof window !== 'undefined' ? window : globalThis);
