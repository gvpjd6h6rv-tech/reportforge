'use strict';

/**
 * DragState — SSOT for active drag session.
 *
 * DragEngine owns the move/resize logic; DragState owns the session data.
 * Other engines (HitTestEngine, SelectionEngine) can query drag state
 * without coupling to DragEngine internals.
 *
 * Session shape: { type, elId, startModelX, startModelY, startPositions, handlePos }
 */
const DragState = (() => {
  let _active  = false;
  let _session = null;

  return {
    begin(session)  { _session = session || null; _active = true; },
    end()           { _active = false; _session = null; },

    get isActive()  { return _active; },
    get session()   { return _session; },
    get dragType()  { return _session ? _session.type : null; },
    get elId()      { return _session ? _session.elId : null; },
  };
})();

if (typeof module !== 'undefined') module.exports = DragState;
