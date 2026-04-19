'use strict';

const SelectionEngine = {
  _drag: null,
  _useCentralRouter() {
    return SelectionInteraction.useCentralRouter();
  },
  _previewRect(el) {
    return CanvasGeometry.elementViewRect(el, SelectionState.getSectionTop(el.sectionId), RF.Geometry.zoom());
  },
  _selectionRect(el) {
    return CanvasGeometry.elementViewRect(el, SelectionState.getSectionTop(el.sectionId), RF.Geometry.zoom());
  },
  onElementPointerDown(e, id) {
    return SelectionInteraction.onElementPointerDown(this, e, id);
  },
  onHandlePointerDown(e, pos) {
    return SelectionInteraction.onHandlePointerDown(this, e, pos);
  },
  attachElementEvents(div, id) {
    return SelectionInteraction.attachElementEvents(this, div, id);
  },
  startTextEdit(div, el) {
    return SelectionInteraction.startTextEdit(this, div, el);
  },
  startRubberBand(e) {
    return SelectionInteraction.startRubberBand(this, e);
  },
  attachHandleEvent(handleDiv, pos) {
    return SelectionInteraction.attachHandleEvent(this, handleDiv, pos);
  },
  renderHandles() {
    return SelectionOverlay.renderHandles(this);
  },
  clearSelection() {
    return SelectionOverlay.clearSelection(this);
  },
  updateSelectionInfo() {
    return SelectionOverlay.updateSelectionInfo(this);
  },
  onMouseMove(e) {
    return SelectionInteraction.onMouseMove(this, e);
  },
  _doMove(pos, e) {
    return SelectionInteraction._doMove(this, pos, e);
  },
  _doResize(pos, e) {
    return SelectionInteraction._doResize(this, pos, e);
  },
  _doRubberBand(pos) {
    return SelectionInteraction._doRubberBand(this, pos);
  },
  onMouseUp(e) {
    return SelectionInteraction.onMouseUp(this, e);
  },
};

SelectionEngine.__active = true;

// Contract marks kept here for governance grep:
// assertSelectionState assertLayoutContract assertRectShape assertZoomContract
// DS.selection DS.zoom DS.getElementById style.cssText
// SelectionState SelectionHitTest SelectionGeometry SelectionOverlay SelectionInteraction

if (typeof module !== 'undefined') {
  module.exports = SelectionEngine;
}
