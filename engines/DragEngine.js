/**
 * DragEngine — ReportForge v19 Phase 2
 * ─────────────────────────────────────────────────────────────────
 * P31C: begin()/update()/commit() retired — confirmed zero callers anywhere
 * in the repo (P31A: the only attempted caller was RuntimeBootstrap.js's
 * DragEngine.init({...}) wiring, which never ran since DragEngine never
 * exported `init`, and was itself removed in P31B). The real move/resize
 * drag pipeline is engines/SelectionInteractionPointer.js +
 * SelectionInteractionMotion.js (see SS-06 notes) — unrelated to this file.
 *
 * cancel() remains: it IS reachable (KeyboardEngine.js's Escape handler) and
 * is a safe no-op now that begin() can never set isActive true.
 */
'use strict';

const DragEngine = (() => {
  const S = typeof DragState !== 'undefined' ? DragState : (() => {
    // Inline fallback when DragState is not loaded (test / legacy context).
    let _a = false, _s = null;
    return { begin: (s) => { _s = s; _a = true; }, end: () => { _a = false; _s = null; },
      get isActive() { return _a; }, get session() { return _s; },
      get dragType() { return _s ? _s.type : null; }, get elId() { return _s ? _s.elId : null; } };
  })();

  /** Cancel drag without committing */
  function cancel() {
    document.querySelectorAll('.cr-element.dragging').forEach(div => div.classList.remove('dragging'));
    if (typeof GuideEngine !== 'undefined') GuideEngine.clear();
    S.end();
  }

  return {
    cancel,
    get isActive() { return S.isActive; },
    get dragType()  { return S.dragType; },
    state: S,
  };
})();

if (typeof module !== 'undefined') module.exports = DragEngine;
