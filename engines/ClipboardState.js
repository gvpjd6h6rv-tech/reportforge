'use strict';

/**
 * ClipboardState — SSOT for clipboard contents.
 *
 * ClipboardEngine owns the copy/paste logic; ClipboardState owns the data.
 * Separation allows tests to inspect or inject clipboard contents without
 * going through the full copy/paste pipeline.
 */
const ClipboardState = (() => {
  let _clipboard = [];   // array of deep-copied DS elements (model-space snapshots)

  return {
    get()           { return _clipboard; },
    set(items)      { _clipboard = Array.isArray(items) ? items : []; },
    clear()         { _clipboard = []; },
    hasContent()    { return _clipboard.length > 0; },
    size()          { return _clipboard.length; },
    snapshot()      { return _clipboard.slice(); },  // safe copy for iteration
  };
})();

if (typeof module !== 'undefined') module.exports = ClipboardState;
