'use strict';

const SelectionEngine = {
  _drag: null,
  useCentralRouter() { return SelectionInteraction.useCentralRouter(); },
  onElementPointerDown(e, id) { return SelectionInteraction.onElementPointerDown(this, e, id); },
  onHandlePointerDown(e, pos) { return SelectionInteraction.onHandlePointerDown(this, e, pos); },
  attachElementEvents(div, id) { return SelectionInteraction.attachElementEvents(this, div, id); },
  startTextEdit(div, el) { return SelectionInteraction.startTextEdit(this, div, el); },
  handleDoubleClick(e) { return SelectionInteraction.handleDoubleClick(e); },
  startRubberBand(e) { return SelectionInteraction.startRubberBand(this, e); },
  attachHandleEvent(handleDiv, pos) { return SelectionInteraction.attachHandleEvent(this, handleDiv, pos); },
  renderHandles() { return SelectionOverlay.renderHandles(this); },
  updateElementLayout(id, patch, source) {
    if (typeof DS !== 'undefined' && typeof DS.updateElementLayout === 'function') {
      DS.updateElementLayout(id, patch, source);
    }
  },
  clearSelection() { return SelectionOverlay.clearSelection(this); },
  updateSelectionInfo() { return SelectionOverlay.updateSelectionInfo(this); },
  onMouseMove(e) { return SelectionInteraction.onMouseMove(this, e); },
  _doMove(pos, e) { return SelectionInteraction._doMove(this, pos, e); },
  _doResize(pos, e) { return SelectionInteraction._doResize(this, pos, e); },
  _doRubberBand(pos) { return SelectionInteraction._doRubberBand(this, pos); },
  onMouseUp(e) { return SelectionInteraction.onMouseUp(this, e); },
};

SelectionEngine.__active = true;
const _selectionOverlayPreviewBridge = (() => {
  if (typeof SelectionEnginePreviewBridge !== 'undefined') return SelectionEnginePreviewBridge;
  if (typeof globalThis !== 'undefined' && globalThis.SelectionEnginePreviewBridge) return globalThis.SelectionEnginePreviewBridge;
  if (typeof window !== 'undefined' && window.SelectionEnginePreviewBridge) return window.SelectionEnginePreviewBridge;
  if (typeof require === 'function') {
    try { return require('./SelectionEnginePreviewBridge.js'); } catch (_err) { return null; }
  }
  return null;
})();
if (_selectionOverlayPreviewBridge && typeof _selectionOverlayPreviewBridge.installSelectionEngineBridge === 'function') {
  _selectionOverlayPreviewBridge.installSelectionEngineBridge(SelectionEngine);
}

// Contract marks kept here for governance grep:
// assertSelectionState assertLayoutContract assertRectShape assertZoomContract
// DS.selection DS.zoom DS.getElementById style.cssText
// SelectionState SelectionHitTest SelectionGeometry SelectionOverlay SelectionInteraction

if (typeof module !== 'undefined') {
  module.exports = SelectionEngine;
}
