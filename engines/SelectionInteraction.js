'use strict';

// SelectionInteraction — thin orchestrator.
// Delegates pointer events to SelectionInteractionPointer
// and motion/drag to SelectionInteractionMotion.
// Both must be loaded BEFORE this file.

const SelectionInteraction = (() => {
  // ── Pointer (event initiation / wiring) ─────────────────────────────
  function useCentralRouter()                   { return SelectionInteractionPointer.useCentralRouter(); }
  function onElementPointerDown(engine, e, id)  { return SelectionInteractionPointer.onElementPointerDown(engine, e, id); }
  function onHandlePointerDown(engine, e, pos)  { return SelectionInteractionPointer.onHandlePointerDown(engine, e, pos); }
  function attachElementEvents(engine, div, id) { return SelectionInteractionPointer.attachElementEvents(engine, div, id); }
  function startTextEdit(engine, div, el)       { return SelectionInteractionPointer.startTextEdit(engine, div, el); }
  function handleDoubleClick(e)                 { return SelectionInteractionPointer.handleDoubleClick(e); }
  function startRubberBand(engine, e)           { return SelectionInteractionPointer.startRubberBand(engine, e); }
  function attachHandleEvent(engine, hdiv, pos) { return SelectionInteractionPointer.attachHandleEvent(engine, hdiv, pos); }

  // ── Motion (drag move / resize / rubber / up) ──────────────────────
  function onMouseMove(engine, e)               { return SelectionInteractionMotion.onMouseMove(engine, e); }
  function onMouseUp(engine, e)                 { return SelectionInteractionMotion.onMouseUp(engine, e); }
  function _doMove(engine, pos, e)              { return SelectionInteractionMotion._doMove(engine, pos, e); }
  function _doResize(engine, pos, e)            { return SelectionInteractionMotion._doResize(engine, pos, e); }
  function _doRubberBand(engine, pos)           { return SelectionInteractionMotion._doRubberBand(engine, pos); }

  return {
    useCentralRouter,
    onElementPointerDown,
    onHandlePointerDown,
    attachElementEvents,
    startTextEdit,
    handleDoubleClick,
    startRubberBand,
    attachHandleEvent,
    onMouseMove,
    onMouseUp,
    _doMove,
    _doResize,
    _doRubberBand,
  };
})();

if (typeof module !== 'undefined') module.exports = SelectionInteraction;
