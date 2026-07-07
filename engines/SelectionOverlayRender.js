'use strict';

const SelectionOverlayRender = (() => {
  const C = SelectionEngineContracts;
  const S = SelectionState;
  // Selection-box styling, line-endpoint narrowing, rect resolution, and
  // multi-selection rendering live in SelectionOverlayRenderHelpers.js —
  // extracted to stay under this file's governance byte threshold.
  // renderSingleSelection (and its RF-PREVIEW-SELECTION-RECT-1 fix) stays
  // here and calls back into H.
  const H = typeof SelectionOverlayRenderHelpers !== 'undefined' ? SelectionOverlayRenderHelpers
    : (typeof globalThis !== 'undefined' && globalThis.SelectionOverlayRenderHelpers) ? globalThis.SelectionOverlayRenderHelpers
    : typeof require === 'function' ? require('./SelectionOverlayRenderHelpers.js') : null;
  const selectionRect = H.selectionRect;
  const _preview = H.preview;

  function renderSingleSelection(engine, layer, id, showGuides) {
    const el = S.getElementById(id); if (!el) return;
    C.assertLayoutContract(el, 'SelectionEngine.renderHandles.layout');
    const rect = selectionRect(el, layer);
    // RF-PREVIEW-SELECTION-RECT-1: in Preview a missing paginated node yields
    // null -> skip drawing (no stale/displaced box) instead of asserting/
    // drawing raw coords. Design's rect is never null, so this never triggers
    // in Design.
    if (!rect) return;
    C.assertRectShape(rect, 'SelectionEngine.renderHandles.rect');
    C.assertZoomContract('SelectionEngine.renderHandles.zoom');
    const isLine = H.isLine(el);
    const positions = SelectionGeometry.selectionHandles(rect).filter(
      (p) => !isLine || H.lineEndpointPositions(el).includes(p.pos)
    );
    if (!isLine) {
      const selBox = document.createElement('div');
      selBox.className = 'sel-box';
      H.styleSelectionBox(selBox, rect, layer);
      layer.appendChild(selBox);
    }
    if (showGuides) _preview().renderSelectionGuides(layer, [rect]);
    positions.forEach(({ pos, cx, cy }) => {
      const h = document.createElement('div');
      // .sel-handle itself is an invisible 14x14 hit-zone by design — normal
      // types get their visible L-corner ticks from .sel-box's own CSS
      // (elements-selection.css ~line 295), which lines no longer render.
      // sel-handle-line gives a line's endpoint handles their own small
      // visible marker so a selected line isn't left with zero indication.
      h.className = isLine ? 'sel-handle sel-handle-line' : 'sel-handle';
      h.dataset.pos = pos;
      h.style.left = cx + 'px';
      h.style.top = cy + 'px';
      engine.attachHandleEvent(h, pos);
      layer.appendChild(h);
    });
  }
  return { renderSingleSelection, renderMultiSelection: H.renderMultiSelection };
})();

globalThis.SelectionOverlayRender = SelectionOverlayRender;

if (typeof module !== 'undefined') module.exports = SelectionOverlayRender;
