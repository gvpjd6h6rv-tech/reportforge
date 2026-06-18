'use strict';

const SelectionOverlayRender = (() => {
  const C = SelectionEngineContracts;
  const S = SelectionState;
  const G = SelectionGeometry;
  function _preview() {
    const helper = globalThis.SelectionOverlayPreview;
    if (!helper) throw new Error('SelectionOverlayPreview is required for SelectionOverlayRender');
    return helper;
  }
  function selectionRect(el, layer) { return DS.previewMode ? _preview().previewRect(el, layer) : { left: el.x, top: S.getSectionTop(el.sectionId) + el.y, width: el.w, height: el.h }; }
  function _styleSelectionBox(box, rect) {
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
    box.style.border = '1px solid var(--cr-sel-bdr, #0066CC)';
    box.style.background = 'transparent';
    box.style.pointerEvents = 'none';
    box.style.zIndex = '40';
  }
  function renderSingleSelection(engine, layer, id, showGuides) {
    const el = S.getElementById(id); if (!el) return;
    C.assertLayoutContract(el, 'SelectionEngine.renderHandles.layout');
    const rect = selectionRect(el, layer);
    C.assertRectShape(rect, 'SelectionEngine.renderHandles.rect');
    C.assertZoomContract('SelectionEngine.renderHandles.zoom');
    const positions = G.selectionHandles(rect);
    const selBox = document.createElement('div');
    selBox.className = 'sel-box';
    _styleSelectionBox(selBox, rect);
    layer.appendChild(selBox);
    if (showGuides) _preview().renderSelectionGuides(layer, [rect]);
    positions.forEach(({ pos, cx, cy }) => {
      const h = document.createElement('div');
      h.className = 'sel-handle';
      h.dataset.pos = pos;
      h.style.left = cx + 'px';
      h.style.top = cy + 'px';
      engine.attachHandleEvent(h, pos);
      layer.appendChild(h);
    });
  }
  function renderMultiSelection(layer, selectedElements) {
    const viewRects = selectedElements.map((item) => selectionRect(item, layer)).filter(Boolean);
    const bounds = G.selectionBoundsFromRects(viewRects);
    if (!bounds) return;
    const outline = document.createElement('div');
    outline.className = 'sel-box sel-box-multi';
    Object.assign(outline.style, { position: 'absolute', left: bounds.left + 'px', top: bounds.top + 'px', width: bounds.width + 'px', height: bounds.height + 'px', background: 'none', backgroundImage: 'none', border: 'none', outline: 'none', boxShadow: 'none', pointerEvents: 'none' });
    layer.appendChild(outline);
    _preview().renderSelectionGuides(layer, viewRects);
    viewRects.forEach((rect) => {
      const item = document.createElement('div');
      item.className = 'sel-box-multi-item';
      Object.assign(item.style, { position: 'absolute', left: (rect.left - bounds.left) + 'px', top: (rect.top - bounds.top) + 'px', width: rect.width + 'px', height: rect.height + 'px', boxSizing: 'border-box', border: '1px solid #000', background: 'transparent', pointerEvents: 'none' });
      outline.appendChild(item);
    });
  }

  return { renderSingleSelection, renderMultiSelection };
})();

globalThis.SelectionOverlayRender = SelectionOverlayRender;

if (typeof module !== 'undefined') module.exports = SelectionOverlayRender;
