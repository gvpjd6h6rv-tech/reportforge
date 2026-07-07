'use strict';

/* SelectionOverlayRenderHelpers — selection-box styling, line-endpoint
 * narrowing, rect resolution, and multi-selection rendering for
 * SelectionOverlayRender.js. Extracted verbatim (no behavior change) to keep
 * that file under its governance byte threshold. renderSingleSelection (and
 * the RF-PREVIEW-SELECTION-RECT-1 fix it carries) stays in
 * SelectionOverlayRender.js and calls back into this module.
 */
const SelectionOverlayRenderHelpers = (() => {
  function _preview() {
    const helper = globalThis.SelectionOverlayPreview;
    if (!helper) throw new Error('SelectionOverlayPreview is required for SelectionOverlayRender');
    return helper;
  }
  function selectionRect(el, layer) {
    return DS.previewMode ? _preview().previewRect(el, layer)
      : { left: el.x, top: SelectionState.getSectionTop(el.sectionId) + el.y, width: el.w, height: el.h };
  }
  function styleSelectionBox(box, rect, layer) {
    box.style.setProperty('--sel-x', rect.left + 'px');
    box.style.setProperty('--sel-y', rect.top + 'px');
    box.style.setProperty('--sel-w', rect.width + 'px');
    box.style.setProperty('--sel-h', rect.height + 'px');
    box.style.position = 'absolute';
    box.style.left = rect.left + 'px';
    box.style.top = rect.top + 'px';
    box.style.width = rect.width + 'px';
    box.style.height = rect.height + 'px';
    box.style.boxSizing = 'border-box';
    box.style.background = 'transparent';
    // RF-PREVIEW-BBOX-HUG-1: preview hugs the SAME outer edge as the hover
    // box; design keeps its plain border unchanged.
    // RF-PREVIEW-THIN-OVERLAY-1: outline-width (and even a div's own height/
    // width, even 4 child divs nested in `box`) floors to a whole device
    // pixel pre-transform in Chromium (proven via raw pixel raster — see
    // tools/diagnostics/rf-bbox-ink/rf_thickness_raster_probe.mjs). Only a
    // background-gradient sized via background-size survives with true
    // sub-pixel anti-aliasing, so preview draws its frame as 4 INDEPENDENT
    // divs appended directly to `layer` at rect's real coordinates (never
    // nested/percentage-relative to `box`) via
    // PreviewOverlayStyle.paintHairlineFrame — `box` itself stays an
    // invisible position/rect marker. Only the frame's stroke width is
    // zoom-compensated — rect (hence the #10.15 renderInkRect hug) is never
    // touched here.
    const _previewMode = !!(typeof DS !== 'undefined' && DS.previewMode);
    if (_previewMode) {
      box.style.border = 'none';
      box.style.outline = 'none';
      globalThis.PreviewOverlayStyle.paintHairlineFrame(layer, rect, 'var(--cr-sel-bdr, #0066CC)', _preview().selectionOverlayZoom(), 'sel');
    } else {
      const _os = globalThis.PreviewOverlayStyle.designBoxStyle('var(--cr-sel-bdr, #0066CC)');
      box.style.border = _os.border;
      box.style.outline = _os.outline;
      box.style.outlineOffset = _os.outlineOffset;
      if (layer) globalThis.PreviewOverlayStyle.clearHairlineFrame(layer, 'sel');
    }
    box.style.pointerEvents = 'none';
    box.style.zIndex = '40';
  }
  // RF-INTERACTION-AUDIT-1 (BUG NEW 1): Crystal Reports never shows a
  // rectangular bounding box or 8 box-corner handles around a selected
  // line — only the two endpoints are meaningful for a 1-D element. RF drew
  // the exact same .sel-box + 8-handle chrome for every type, line included.
  // SelectionGeometry.selectionHandles() stays generic/pure on purpose (it's
  // reused by every type) — the line-specific narrowing lives here, at the
  // one call site that knows the element's type.
  function isLine(el) { return el.type === 'line'; }
  function lineEndpointPositions(el) {
    const isVertical = el.lineDir === 'v' || (!el.lineDir && el.h > el.w);
    return isVertical ? ['n', 's'] : ['w', 'e'];
  }

  function renderMultiSelection(layer, selectedElements, showGuides) {
    const G = SelectionGeometry;
    const viewRects = selectedElements.map((item) => selectionRect(item, layer)).filter(Boolean);
    const bounds = G.selectionBoundsFromRects(viewRects);
    if (!bounds) return;
    const outline = document.createElement('div');
    outline.className = 'sel-box sel-box-multi';
    Object.assign(outline.style, { position: 'absolute', left: bounds.left + 'px', top: bounds.top + 'px', width: bounds.width + 'px', height: bounds.height + 'px', background: 'none', backgroundImage: 'none', border: 'none', outline: 'none', boxShadow: 'none', pointerEvents: 'none' });
    layer.appendChild(outline);
    // CR-PARITY-1: guides only during an active move/resize gesture — see
    // SelectionOverlay._shouldShowGuides, the single owner of this decision.
    if (showGuides) _preview().renderSelectionGuides(layer, viewRects);
    // RF-PREVIEW-THIN-OVERLAY-1: same hairline-frame mechanism as the single-
    // selection box — 4 independent divs per item appended directly to
    // `layer` at that item's real rect coordinates (never nested/percentage-
    // relative to `item`), keyed per-item so multiple selected items never
    // collide. `item` itself stays an invisible position/rect marker.
    const previewMode = !!(typeof DS !== 'undefined' && DS.previewMode);
    const zoom = previewMode ? _preview().selectionOverlayZoom() : 1;
    viewRects.forEach((rect, idx) => {
      const item = document.createElement('div');
      item.className = 'sel-box-multi-item';
      Object.assign(item.style, { position: 'absolute', left: (rect.left - bounds.left) + 'px', top: (rect.top - bounds.top) + 'px', width: rect.width + 'px', height: rect.height + 'px', boxSizing: 'border-box', background: 'transparent', pointerEvents: 'none' });
      if (previewMode) {
        item.style.border = 'none';
        globalThis.PreviewOverlayStyle.paintHairlineFrame(layer, rect, '#000', zoom, `multi-${idx}`);
      } else {
        item.style.border = '1px solid #000';
      }
      outline.appendChild(item);
    });
  }

  return { preview: _preview, selectionRect, styleSelectionBox, isLine, lineEndpointPositions, renderMultiSelection };
})();

globalThis.SelectionOverlayRenderHelpers = SelectionOverlayRenderHelpers;

if (typeof module !== 'undefined') module.exports = SelectionOverlayRenderHelpers;
