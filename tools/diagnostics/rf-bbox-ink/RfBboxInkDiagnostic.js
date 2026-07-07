'use strict';

// UDS 4.1 — TEMPORARY visible-ink bbox diagnostic. Zero effect unless
// URL has ?rf_bbox_ink=1 or window.RF_BBOX_INK === true. Read-only: never
// mutates model/selection/hover/render. Removable in one commit (delete this
// file + its <script> tag in crystal-reports-designer-v4.html).
//
// RED    = visual DOM bbox of the element (.pv-el getBoundingClientRect)
// BLUE   = overlay bbox actually drawn (.sel-box getBoundingClientRect)
// GREEN  = model rect (el.x / getSectionTop+el.y / el.w / el.h) — logged
// YELLOW = clamp/final rect (DocumentActionsLayoutClamp) — logged
(function initRfBboxInk(global) {
  const on = (() => {
    try {
      if (global.RF_BBOX_INK === true) return true;
      return /[?&]rf_bbox_ink=1\b/.test(global.location ? global.location.search : '');
    } catch (_) { return false; }
  })();
  if (!on || typeof document === 'undefined') return;

  // rf_bbox_zoom=N: logical magnification of the DELTA only (edges are pushed
  // away from RED2 by N x their real gap). Does NOT touch the layout/zoom.
  const MAG = (() => {
    try {
      const m = /[?&]rf_bbox_zoom=(\d+(?:\.\d+)?)/.exec(global.location ? global.location.search : '');
      const n = m ? parseFloat(m[1]) : (Number(global.RF_BBOX_ZOOM) || 1);
      return Number.isFinite(n) && n >= 1 ? Math.min(n, 5000) : 1;
    } catch (_) { return 1; }
  })();
  // per-side edge deltas b-a: {top,left,right,bottom} (right/bottom are outer edges)
  function _sides(a, b) {
    if (!a || !b) return null;
    return {
      top: b.top - a.top,
      left: b.left - a.left,
      right: (b.left + b.width) - (a.left + a.width),
      bottom: (b.top + b.height) - (a.top + a.height),
    };
  }
  // amplify rect r's edges away from anchor by MAG (anchor stays fixed)
  function _amp(anchor, r) {
    if (!anchor || !r) return r;
    const L = anchor.left + (r.left - anchor.left) * MAG;
    const T = anchor.top + (r.top - anchor.top) * MAG;
    const R = (anchor.left + anchor.width) + ((r.left + r.width) - (anchor.left + anchor.width)) * MAG;
    const B = (anchor.top + anchor.height) + ((r.top + r.height) - (anchor.top + anchor.height)) * MAG;
    return { left: L, top: T, width: R - L, height: B - T };
  }

  // captured-events buffer + JSON export (Chrome console objects collapse to
  // {…} and mix hover/selection; a downloaded file is copy-safe and separated).
  const _events = [];
  let _lastHoverTarget = null;
  let _renderSrc = 'none'; // how _renderNode found RED2: 'index' | 'nearest' | 'none'
  function _emit(out) {
    if (out && out.kind === 'hover') _lastHoverTarget = out.hoverElementId || out.elementId || null;
    _events.push(out);
    _showLatest(out);
    if (out && out.status === 'OK') console.log('[RF_BBOX_INK]', out);
    else console.warn('RF_BBOX_DIAG_INCOMPLETE', out);
  }
  function _meta() {
    const CRF = global.CommandRuntimeFile;
    const cl = (CRF && CRF._currentLayout) ? CRF._currentLayout : {};
    return {
      timestamp: new Date().toISOString(),
      url: (global.location ? global.location.href : null),
      layoutName: cl.name || null,
      previewMode: !!(typeof DS !== 'undefined' && DS.previewMode),
      zoom: (typeof DS !== 'undefined' ? DS.zoom : null),
      pageWidth: (typeof CFG !== 'undefined' ? CFG.PAGE_W : null),
      pageHeight: (typeof CFG !== 'undefined' ? CFG.PAGE_H : null),
      margins: (global.PageMarginsEngine && global.PageMarginsEngine.get) ? global.PageMarginsEngine.get() : (cl.margins || null),
      magnification: MAG,
    };
  }

  // ── THICKNESS / RASTER INK SCAN (RF-PREVIEW-THIN-OVERLAY-1 verification) ──
  // Answers "is the hairline fix actually visible?", not just "is the box in
  // the right place?" (the geometry scan above only ever proved position,
  // never stroke weight). In-page JS can read declared/computed CSS but
  // CANNOT rasterize the compositor's real paint — that needs an external
  // screenshot (see tools/diagnostics/rf-bbox-ink/rf_thickness_raster_probe.mjs,
  // a Playwright script). measuredVisualPx* below is filled in by that probe;
  // when run standalone in-browser it stays null with a note, never fabricated.
  //
  // status classification:
  //   CSS_DECLARED_OK      — computed outline/guide width matches the live
  //                          thinStrokeWidth(zoom) formula exactly.
  //   CSS_NOT_APPLIED      — computed width is 0/missing/doesn't match at all
  //                          (fix code not reached, wrong element, etc).
  //   CSS_OVERRIDDEN       — a stylesheet paints its own frame via
  //                          background-image (gradient), independent of
  //                          outline-width — e.g. .sel-box's own 1px
  //                          background gradient lines in elements-selection.css,
  //                          which the outline-width fix never touches.
  //   BROWSER_PIXEL_FLOOR  — computed width is a whole device pixel (>=1)
  //                          while the formula asked for less than 1 — the
  //                          browser likely floored a sub-pixel stroke.
  //   CACHE_OR_SERVER_STALE — the live function isn't present at all (old
  //                          build served / cache not busted).
  let _fingerprintCache = null;
  function _fetchFingerprint() {
    if (typeof fetch !== 'function') return Promise.resolve(null);
    return fetch('/runtime-fingerprint').then((r) => r.json()).then((j) => { _fingerprintCache = j; return j; }).catch(() => null);
  }

  function _liveZoom() {
    if (typeof SelectionOverlayPreview !== 'undefined' && typeof SelectionOverlayPreview.selectionOverlayZoom === 'function') {
      try { return SelectionOverlayPreview.selectionOverlayZoom(); } catch (_) { /* fall through */ }
    }
    return (typeof DS !== 'undefined' && Number(DS.zoom) > 0) ? Number(DS.zoom) : 1;
  }

  function _elementThicknessFacts(el) {
    if (!el) return { present: false };
    const cs = getComputedStyle(el);
    const bg = cs.backgroundImage || '';
    return {
      present: true,
      className: el.className,
      rect: _round(el.getBoundingClientRect()),
      inlineOutline: el.style.outline || null,
      inlineBorder: el.style.border || null,
      computedOutlineWidth: cs.outlineWidth,
      computedOutlineColor: cs.outlineColor,
      computedOutlineStyle: cs.outlineStyle,
      computedBorderTopWidth: cs.borderTopWidth,
      computedBackgroundImage: bg && bg !== 'none' ? bg.slice(0, 300) : null,
      hasBackgroundGradientPaint: /gradient/i.test(bg),
    };
  }

  function _guideElementFacts(el) {
    if (!el) return { present: false };
    const cs = getComputedStyle(el);
    return {
      present: true,
      rect: _round(el.getBoundingClientRect()),
      styleHeight: el.style.height || null,
      styleWidth: el.style.width || null,
      computedHeight: cs.height,
      computedWidth: cs.width,
      computedBackgroundColor: cs.backgroundColor,
    };
  }

  // "route servida" proof: the ACTUAL loaded function source, not a version
  // string — a stale cache/server serves an OLD function body even if the
  // filename and even the fingerprint's file hash look right to a casual
  // check, so this compares the executing code's own toString().
  function _sourceFingerprint() {
    const P = (typeof PreviewOverlayStyle !== 'undefined') ? PreviewOverlayStyle : null;
    const L = (typeof SelectionOverlayPreviewLayers !== 'undefined') ? SelectionOverlayPreviewLayers : null;
    return {
      thinStrokeWidthPresent: !!(P && typeof P.thinStrokeWidth === 'function'),
      thinStrokeWidthSource: (P && typeof P.thinStrokeWidth === 'function') ? P.thinStrokeWidth.toString() : null,
      thinStrokeWidthAtZoom1: (P && typeof P.thinStrokeWidth === 'function') ? P.thinStrokeWidth(1) : null,
      thinStrokeWidthAtZoom4: (P && typeof P.thinStrokeWidth === 'function') ? P.thinStrokeWidth(4) : null,
      selectionGuideThicknessPresent: !!(L && typeof L.selectionGuideThickness === 'function'),
      selectionGuideThicknessSource: (L && typeof L.selectionGuideThickness === 'function') ? L.selectionGuideThickness.toString() : null,
    };
  }

  function _classifyOverlayStatus(facts, expectedWidth) {
    if (!facts.present) return 'ELEMENT_NOT_FOUND';
    if (facts.hasBackgroundGradientPaint) return 'CSS_OVERRIDDEN';
    const declared = parseFloat(facts.computedOutlineWidth);
    if (!Number.isFinite(expectedWidth)) return 'CACHE_OR_SERVER_STALE';
    if (!Number.isFinite(declared) || declared === 0) return 'CSS_NOT_APPLIED';
    if (Math.abs(declared - expectedWidth) < 0.01) return 'CSS_DECLARED_OK';
    if (declared >= 1 && expectedWidth < 1) return 'BROWSER_PIXEL_FLOOR';
    return 'CSS_NOT_APPLIED';
  }

  function thicknessScan() {
    const zoom = _liveZoom();
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    const source = _sourceFingerprint();
    const expected = source.thinStrokeWidthPresent
      ? (typeof PreviewOverlayStyle.thinStrokeWidth === 'function' ? PreviewOverlayStyle.thinStrokeWidth(zoom) : null)
      : null;

    const selBoxEl = document.querySelector('.preview-selection-layer .sel-box, #handles-layer .sel-box');
    const hoverBoxEl = document.querySelector('.preview-hover-box');
    const guideH = document.querySelector('.selection-guide-h');
    const guideV = document.querySelector('.selection-guide-v');
    const selFacts = _elementThicknessFacts(selBoxEl);
    const hoverFacts = _elementThicknessFacts(hoverBoxEl);
    const RASTER_NOTE = 'raster measurement requires the external Playwright probe (tools/diagnostics/rf-bbox-ink/rf_thickness_raster_probe.mjs) — in-page JS cannot read the compositor paint, only declared/computed CSS.';

    return {
      zoom,
      devicePixelRatio: dpr,
      expectedCssWidth: expected,
      source,
      runtimeFingerprintCached: _fingerprintCache,
      selectionBox: Object.assign({}, selFacts, {
        expectedCssWidth: expected,
        status: _classifyOverlayStatus(selFacts, expected),
        measuredVisualPxTop: null, measuredVisualPxLeft: null, measuredVisualPxRight: null, measuredVisualPxBottom: null,
        measuredVisualNote: RASTER_NOTE,
      }),
      hoverBox: Object.assign({}, hoverFacts, {
        expectedCssWidth: expected,
        status: _classifyOverlayStatus(hoverFacts, expected),
        measuredVisualPxTop: null, measuredVisualPxLeft: null, measuredVisualPxRight: null, measuredVisualPxBottom: null,
        measuredVisualNote: RASTER_NOTE,
      }),
      guideLines: {
        countH: document.querySelectorAll('.selection-guide-h').length,
        countV: document.querySelectorAll('.selection-guide-v').length,
        sampleH: _guideElementFacts(guideH),
        sampleV: _guideElementFacts(guideV),
        expectedCssWidth: expected,
        guideVisualPxNote: RASTER_NOTE,
        browserPixelFloorNote: 'if the raster probe measures exactly 1 device px regardless of the CSS value, classify BROWSER_PIXEL_FLOOR — some browsers refuse to rasterize a sub-device-pixel stroke and round up.',
      },
    };
  }

  function _export() {
    const hover = _events.filter((e) => e && e.kind === 'hover');
    const selection = _events.filter((e) => e && e.kind === 'selection');
    const payload = Object.assign(_meta(), {
      lastHoverTarget: _lastHoverTarget,
      selectedElementIds: _selIds(),
      blueBoxDomNow: _blueBoxes(),
      thicknessScan: thicknessScan(),
      counts: { total: _events.length, hover: hover.length, selection: selection.length },
      hoverReports: hover,        // kind:hover only — hoverOverlay vs hover renderInk
      selectionReports: selection, // kind:selection only — sel-box vs selected renderInk
      allEvents: _events,
    });
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const d = new Date();
    const p2 = (n) => String(n).padStart(2, '0');
    const name = `rf_bbox_ink_${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}_${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}.json`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 100);
    console.log('[RF_BBOX_INK] exported', name, payload.counts);
  }
  function _mkBtn(label, bg, fn) {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = `background:${bg};color:#fff;border:0;border-radius:5px;padding:5px 9px;cursor:pointer;font:11px/1 sans-serif`;
    if (fn) b.addEventListener('click', fn);
    return b;
  }
  // compact live view in the panel (full data still goes to console + EXPORT)
  function _showLatest(out) {
    const pre = document.getElementById('rf-bbox-out');
    if (!pre || !out) return;
    pre.textContent = JSON.stringify({
      kind: out.kind, status: out.status, reason: out.reason,
      elementId: out.elementId, sectionId: out.sectionId,
      activeSelectedElementId: out.activeSelectedElementId,
      renderNodeSource: out.renderNodeSource, zoom: out.zoom,
      sidesHitVsRenderInk_logicalPx: out.sidesHitVsRenderInk_logicalPx,
      sidesHoverVsRenderInk_logicalPx: out.sidesHoverVsRenderInk_logicalPx,
      sidesSelectionVsRenderInk_logicalPx: out.sidesSelectionVsRenderInk_logicalPx,
    }, null, 2);
  }
  function _buildUi() {
    if (!document.body || document.getElementById('rf-bbox-ui')) return;
    const panel = document.createElement('div');
    panel.id = 'rf-bbox-ui';
    panel.style.cssText = 'position:fixed;right:12px;bottom:12px;width:380px;height:300px;min-width:220px;min-height:34px;z-index:2147483600;background:#1e1e1e;color:#ddd;border:1px solid #555;border-radius:8px;box-shadow:0 8px 28px rgba(0,0,0,.5);display:flex;flex-direction:column;overflow:hidden;resize:both;font:11px/1.35 monospace';

    const header = document.createElement('div');
    header.style.cssText = 'flex:0 0 auto;display:flex;align-items:center;gap:8px;padding:6px 8px;background:#2d2d2d;border-bottom:1px solid #555;cursor:move;user-select:none';
    const title = document.createElement('b'); title.textContent = '🎯 RF BBOX INK'; title.style.flex = '1';
    const minBtn = _mkBtn('—', '#555', null); minBtn.title = 'Minimizar / restaurar';
    header.appendChild(title); header.appendChild(minBtn);

    const body = document.createElement('div');
    body.style.cssText = 'flex:1;min-height:0;display:flex;flex-direction:column';
    const pre = document.createElement('pre');
    pre.id = 'rf-bbox-out';
    pre.style.cssText = 'flex:1;margin:0;padding:8px;overflow:auto;white-space:pre-wrap;word-break:break-word';
    pre.textContent = 'hover / select an element…';
    const footer = document.createElement('div');
    footer.style.cssText = 'flex:0 0 auto;display:flex;gap:6px;padding:6px 8px;border-top:1px solid #555';
    footer.appendChild(_mkBtn('EXPORT JSON', '#06c', _export));
    footer.appendChild(_mkBtn('THICKNESS SCAN', '#b8860b', () => {
      const scan = thicknessScan();
      console.log('[RF_BBOX_INK][THICKNESS]', scan);
      const p = document.getElementById('rf-bbox-out');
      if (p) p.textContent = JSON.stringify(scan, null, 2);
    }));
    footer.appendChild(_mkBtn('CLEAR', '#a33', () => { _events.length = 0; _clear(); const p = document.getElementById('rf-bbox-out'); if (p) p.textContent = 'cleared'; }));
    body.appendChild(pre); body.appendChild(footer);
    panel.appendChild(header); panel.appendChild(body);
    document.body.appendChild(panel);

    // minimize: collapse to the header only
    let min = false, prevH = panel.style.height;
    minBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      min = !min;
      if (min) { prevH = panel.style.height; body.style.display = 'none'; panel.style.height = 'auto'; panel.style.resize = 'none'; minBtn.textContent = '▢'; }
      else { body.style.display = 'flex'; panel.style.height = prevH; panel.style.resize = 'both'; minBtn.textContent = '—'; }
    });

    // draggable by the header
    let dx = 0, dy = 0, dragging = false;
    header.addEventListener('mousedown', (e) => {
      if (e.target === minBtn) return;
      const r = panel.getBoundingClientRect();
      panel.style.left = r.left + 'px'; panel.style.top = r.top + 'px';
      panel.style.right = 'auto'; panel.style.bottom = 'auto';
      dx = e.clientX - r.left; dy = e.clientY - r.top; dragging = true; e.preventDefault();
    });
    document.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      panel.style.left = Math.max(0, e.clientX - dx) + 'px';
      panel.style.top = Math.max(0, e.clientY - dy) + 'px';
    });
    document.addEventListener('mouseup', () => { dragging = false; });
  }

  const LAYER_ID = 'rf-bbox-ink-layer';
  function _layer() {
    let l = document.getElementById(LAYER_ID);
    if (!l) {
      l = document.createElement('div');
      l.id = LAYER_ID;
      l.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483000';
      document.body.appendChild(l);
    }
    return l;
  }
  function _box(color, r, label) {
    if (!r) return;
    const d = document.createElement('div');
    d.style.cssText =
      `position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;`
      + `outline:1px solid ${color};pointer-events:none;box-sizing:border-box`;
    const t = document.createElement('div');
    t.textContent = label;
    t.style.cssText =
      `position:absolute;left:0;top:-11px;font:9px/1 monospace;color:${color};white-space:nowrap`;
    d.appendChild(t);
    _layer().appendChild(d);
  }
  function _clear() { const l = document.getElementById(LAYER_ID); if (l) l.innerHTML = ''; }

  function _domRect(node) {
    if (!node || typeof node.getBoundingClientRect !== 'function') return null;
    const b = node.getBoundingClientRect();
    return { left: b.left, top: b.top, width: b.width, height: b.height };
  }
  function _round(r) {
    if (!r) return null;
    const f = (n) => Math.round(n * 100) / 100;
    return { left: f(r.left), top: f(r.top), width: f(r.width), height: f(r.height) };
  }
  function _delta(a, b) {
    if (!a || !b) return null;
    return Math.max(Math.abs(a.left - b.left), Math.abs(a.top - b.top),
      Math.abs((a.left + a.width) - (b.left + b.width)),
      Math.abs((a.top + a.height) - (b.top + b.height)));
  }

  function _modelRect(el) {
    try {
      const secTop = (typeof SelectionState !== 'undefined' && SelectionState.getSectionTop)
        ? SelectionState.getSectionTop(el.sectionId)
        : (typeof DS !== 'undefined' && DS.getSectionTop ? DS.getSectionTop(el.sectionId) : 0);
      return { left: el.x, top: secTop + el.y, width: el.w, height: el.h };
    } catch (_) { return null; }
  }
  function _clampRect(el) {
    try {
      const eng = global.DocumentActionsLayoutClamp;
      if (!eng || !eng.normalizeElementLayout) return null;
      const p = eng.normalizeElementLayout(el, { x: el.x, y: el.y }, null);
      const secTop = (typeof SelectionState !== 'undefined' && SelectionState.getSectionTop)
        ? SelectionState.getSectionTop(p.sectionId || el.sectionId) : 0;
      return { left: (p.x != null ? p.x : el.x), top: secTop + (p.y != null ? p.y : el.y), width: el.w, height: el.h };
    } catch (_) { return null; }
  }

  function _pvNode(id) {
    // hit-layer pv-el ONLY (never the 0x0/hidden design .cr-element)
    return document.querySelector(`.preview-hit-layer [data-origin-id="${id}"]`);
  }
  function _hoverNode() { return document.querySelector('.preview-hover-box'); }
  function _selNode() { return document.querySelector('.preview-selection-layer .sel-box, #handles-layer .sel-box'); }
  function _valid(r) { return !!(r && r.width > 0 && r.height > 0); }
  // identity of EVERY blue/selection box actually in the DOM (find the real one)
  function _blueBoxes() {
    return [...document.querySelectorAll('.sel-box, .preview-hover-box')].map((n) => {
      const cs = (typeof getComputedStyle === 'function') ? getComputedStyle(n) : {};
      const b = n.getBoundingClientRect();
      return {
        cls: n.className,
        parent: n.parentElement ? n.parentElement.className : null,
        rect: { left: Math.round(b.left), top: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) },
        outline: `${cs.outlineColor || ''} ${cs.outlineWidth || ''}`.trim(),
        border: `${cs.borderColor || ''} ${cs.borderTopWidth || ''}`.trim(),
      };
    });
  }
  // RED2: the ACTUAL visible render-layer ink (.cr-el). Render elements carry
  // no id, only a section-local data-el-index -> map model el -> section index,
  // else fall back to the render .cr-el whose center is nearest the .pv-el.
  function _renderNode(el, pvRect) {
    try {
      const secEls = (typeof DS !== 'undefined' && DS.elements)
        ? DS.elements.filter((e) => e.sectionId === el.sectionId) : [];
      const idx = secEls.findIndex((e) => e.id === el.id);
      if (idx >= 0) {
        const n = document.querySelector(
          `#preview-content .preview-render-layer [data-section-id="${el.sectionId}"] [data-el-index="${idx}"]`);
        if (n) { _renderSrc = 'index'; return n; }
      }
    } catch (_) { /* fall through */ }
    if (!pvRect) { _renderSrc = 'none'; return null; }
    const cx = pvRect.left + pvRect.width / 2, cy = pvRect.top + pvRect.height / 2;
    let best = null, bestD = Infinity;
    document.querySelectorAll('#preview-content .preview-render-layer .cr-el').forEach((n) => {
      const b = n.getBoundingClientRect();
      const d = Math.hypot((b.left + b.width / 2) - cx, (b.top + b.height / 2) - cy);
      if (d < bestD) { bestD = d; best = n; }
    });
    _renderSrc = best ? 'nearest' : 'none';
    return best;
  }
  const _r = (n) => (n == null ? null : Math.round(n * 100) / 100);
  const _rs = (s) => (s == null ? null : { top: _r(s.top), left: _r(s.left), right: _r(s.right), bottom: _r(s.bottom) });
  // screen deltas / zoom -> LOGICAL px (a 4px screen gap at 400% = 1 logical px)
  const _rsL = (s, z) => ((s == null || !z) ? null : { top: _r(s.top / z), left: _r(s.left / z), right: _r(s.right / z), bottom: _r(s.bottom / z) });
  function _selIds() {
    try {
      const S = (typeof SelectionState !== 'undefined' && SelectionState.selectedIds) ? SelectionState
        : (typeof DS !== 'undefined' && DS.selectedIds ? DS : null);
      return S ? [...S.selectedIds()] : [];
    } catch (_) { return []; }
  }
  function _elSelBoxes() {
    // element boxes only (exclude the multi-selection outline)
    return [...document.querySelectorAll(
      '.preview-selection-layer .sel-box:not(.sel-box-multi), #handles-layer .sel-box:not(.sel-box-multi)')];
  }

  // kind-specific report. NEVER cross targets: a hover report compares only the
  // hover overlay; a selection report compares only the sel-box attributed to
  // the SAME elementId (else DIAG_INCOMPLETE).
  function _report(kind, el) {
    if (!el) return;
    _clear();
    const hitRect = _domRect(_pvNode(el.id));                // RED
    const renderRect = _domRect(_renderNode(el, hitRect));   // RED2 (truth)
    const selIds = _selIds();
    const activeSel = selIds.length ? selIds[selIds.length - 1] : null;
    const zoom = (typeof DS !== 'undefined' && Number(DS.zoom) > 0) ? Number(DS.zoom) : 1;
    _box('#e00', renderRect, `RED2 renderInk x${MAG}`);
    _box('#888', _amp(renderRect, hitRect), 'RED hitLayer');

    const out = {
      kind,
      elementId: el.id,
      sectionId: el.sectionId,
      hoverElementId: kind === 'hover' ? el.id : null,
      selectedElementIds: selIds,
      activeSelectedElementId: activeSel,
      magnification: MAG,
      zoom,
      renderNodeSource: _renderSrc, // 'index' trustworthy | 'nearest' suspect | 'none'
      renderInkRect: _round(renderRect),
      hitLayerRect: _round(hitRect),
      sidesHitVsRenderInk_realPx: _rs(_sides(renderRect, hitRect)),
      sidesHitVsRenderInk_logicalPx: _rsL(_sides(renderRect, hitRect), zoom),
      deltaHitVsRenderInk: _r(_delta(hitRect, renderRect)),
      blueBoxDom: _blueBoxes(),
    };

    if (kind === 'hover') {
      const hoverOv = _domRect(_hoverNode());
      if (hoverOv) _box('#F80', _amp(renderRect, hoverOv), 'ORANGE hover');
      out.hoverOverlayRect = _round(hoverOv);
      out.sidesHoverVsRenderInk_realPx = _rs(_sides(renderRect, hoverOv));
      out.sidesHoverVsRenderInk_logicalPx = _rsL(_sides(renderRect, hoverOv), zoom);
      out.deltaHoverVsRenderInk = _r(_delta(hoverOv, renderRect));
      // a hover report is contaminated if a selection box for a DIFFERENT
      // element is present (its blueBoxDom mixes targets) -> not conclusive.
      const contaminated = selIds.length > 0 && activeSel !== el.id;
      if (contaminated || !_valid(renderRect) || !_valid(hitRect) || !_valid(hoverOv)) {
        out.status = 'DIAG_INCOMPLETE';
        out.reason = contaminated ? `blueBoxDom mixes targets: selection active for ${activeSel} != hover ${el.id}` : 'missing rect';
        _emit(out); return;
      }
      out.status = 'OK'; _emit(out); return;
    }

    // kind === 'selection': attribute the sel-box to THIS element only if the
    // selection is unambiguous (exactly one selected id === el.id and one box).
    const boxes = _elSelBoxes();
    const owns = selIds.length === 1 && boxes.length === 1 && selIds[0] === el.id;
    const selBox = owns ? boxes[0] : null;
    const selOv = _domRect(selBox);
    out.selectionBoxOwnerElementId = owns ? el.id : null;
    out.selectionBoxOwnerSectionId = owns ? el.sectionId : null;
    out.selBoxDom = selBox ? { cls: selBox.className, parent: selBox.parentElement ? selBox.parentElement.className : null } : null;
    out.elementSelBoxCount = boxes.length;
    if (selOv) _box('#06c', _amp(renderRect, selOv), 'BLUE selection');
    out.selectionOverlayRect = _round(selOv);
    out.sidesSelectionVsRenderInk_realPx = _rs(_sides(renderRect, selOv));
    out.sidesSelectionVsRenderInk_logicalPx = _rsL(_sides(renderRect, selOv), zoom);
    out.deltaSelectionVsRenderInk = _r(_delta(selOv, renderRect));
    if (!owns || !_valid(renderRect) || !_valid(hitRect) || !_valid(selOv)) {
      out.status = 'DIAG_INCOMPLETE';
      out.reason = !owns
        ? `cannot attribute sel-box to elementId (selectedIds=${selIds.length}, elementSelBoxes=${boxes.length}, active=${activeSel})`
        : 'missing rect';
      _emit(out); return;
    }
    out.status = 'OK'; _emit(out);
  }

  function _selectedEl() {
    try {
      const ids = (typeof SelectionState !== 'undefined' && SelectionState.selectedIds)
        ? [...SelectionState.selectedIds()] : (typeof DS !== 'undefined' && DS.selectedIds ? [...DS.selectedIds()] : []);
      if (!ids.length) return null;
      return (typeof DS !== 'undefined' && DS.getElementById) ? DS.getElementById(ids[0]) : null;
    } catch (_) { return null; }
  }

  // poll selection (cheap; diagnostic only)
  let _lastSel = null;
  setInterval(() => {
    const el = _selectedEl();
    const id = el ? el.id : null;
    if (id !== _lastSel) { _lastSel = id; if (el) _report('selection', el); else _clear(); }
  }, 250);

  document.addEventListener('mousemove', (e) => {
    const hit = document.elementFromPoint(e.clientX, e.clientY);
    const pv = hit && hit.closest ? hit.closest('[data-origin-id],[data-id]') : null;
    const id = pv && pv.dataset ? (pv.dataset.originId || pv.dataset.id) : null;
    if (!id) return;
    const el = (typeof DS !== 'undefined' && DS.getElementById) ? DS.getElementById(id) : null;
    // defer a frame so PreviewHoverOutline has painted its .preview-hover-box
    if (el) requestAnimationFrame(() => _report('hover', el));
  }, { passive: true });

  // prove the LOADED functions actually contain the fix (Function.toString
  // includes in-body comments) — identity, not theory.
  try {
    const P = global.SelectionOverlayPreview || {};
    console.log('[RF_BBOX_INK] loaded-fix check', {
      findPreviewHitElement_robust: /data-origin-id/.test(String(P.findPreviewHitElement || '')),
      findRenderInkElement_present: typeof P.findRenderInkElement === 'function',
      getPreviewVisualBBox_usesInk: /RF-PREVIEW-BBOX-INK-1|findRenderInkElement/.test(String(P.getPreviewVisualBBox || '')),
      previewRect_delegates: /getPreviewVisualBBox/.test(String(P.previewRect || '')),
    });
  } catch (_) { /* noop */ }
  // RF-PREVIEW-THIN-OVERLAY-1: cache runtime-fingerprint once at load so
  // THICKNESS SCAN / EXPORT JSON can prove which SHA is actually serving —
  // "route servida" proof, not just a filename/version string.
  _fetchFingerprint().then(() => {
    console.log('[RF_BBOX_INK][THICKNESS] initial scan', thicknessScan());
  });
  // Exposed so an external driver (e.g. the Playwright raster probe,
  // rf_thickness_raster_probe.mjs) can call the exact same in-page scan
  // instead of re-deriving CSS facts from outside.
  global.RfBboxInkDiagnostic = { thicknessScan, fetchFingerprint: _fetchFingerprint };
  if (document.body) _buildUi(); else document.addEventListener('DOMContentLoaded', _buildUi);
  console.log('[RF_BBOX_INK] active — hover/select an element (RED=visual DOM, BLUE=overlay). Buttons: EXPORT/CLEAR/THICKNESS SCAN BBOX JSON');
})(typeof window !== 'undefined' ? window : globalThis);
