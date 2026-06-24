/**
 * HistoryEngine — ReportForge v19 Phase 3
 * ─────────────────────────────────────────────────────────────────
 * Undo / redo action stack.
 * Delegates to DS.saveHistory / DS.undo / DS.redo (the SAME stack
 * DocumentHistory.js maintains and the menu/toolbar #btn-undo/#btn-redo
 * buttons use — engines/CommandRuntimeHandlersSelectionDispatch.js:8-9).
 *
 * RF-PARITY-AUDIT-1 root cause (proven live, not hypothesis): this file
 * used to keep its OWN independent `_undoStack`/`_redoStack` with its own
 * `_snapshot()`/`_restore()`, completely disconnected from DS.saveHistory's
 * stack — despite this exact docstring already claiming it delegated.
 * Only drag-start, nudge, and paste ever called HistoryEngine.push(), so
 * Ctrl+Z/Ctrl+Shift+Z (bound to HistoryEngine.undo/redo in
 * KeyboardEngine.js) silently no-opped after EVERY other mutation (resize,
 * align, format, properties, section resize, formula save, field-explorer
 * edits — anything that only ever called DS.saveHistory()), while the menu
 * buttons (bound to DS.undo/redo) worked for all of them. Now both input
 * paths share one stack, so they always agree.
 *
 * Architecture rule (unchanged):
 *   History stores MODEL SPACE snapshots only.
 *   View-space derived values are never persisted.
 */
'use strict';

const HistoryEngine = (() => {
  let _suppressed = false;

  function _undoRedoDisabled(id) {
    const btn = typeof document !== 'undefined' && document.getElementById(id);
    return !!(btn && btn.classList.contains('disabled'));
  }

  return {
    /**
     * Save the CURRENT state to the undo stack. Call AFTER making a model
     * change (same convention as every other caller of DS.saveHistory —
     * AlignEngine, PropertiesEngine, FormatEngine, SelectionInteractionMotion
     * resize/move-end, ClipboardEngine paste-end, etc.).
     * @param {string} _label  — unused (DS.saveHistory does not track
     *   labels); kept for call-site compatibility.
     */
    push(_label = 'action') {
      if (_suppressed) return;
      if (typeof DS !== 'undefined' && typeof DS.saveHistory === 'function') DS.saveHistory();
    },

    undo() {
      if (typeof DS === 'undefined' || typeof DS.undo !== 'function') return false;
      DS.undo();
      return true;
    },

    redo() {
      if (typeof DS === 'undefined' || typeof DS.redo !== 'function') return false;
      DS.redo();
      return true;
    },

    canUndo() { return !_undoRedoDisabled('btn-undo'); },
    canRedo() { return !_undoRedoDisabled('btn-redo'); },

    /** Suppress push() calls (e.g. during programmatic batch updates) */
    suppress(fn) {
      _suppressed = true;
      try { return fn(); } finally { _suppressed = false; }
    },

    /** No-op compatibility stubs — nothing in production code subscribes to
     *  these (verified: only push/undo/redo are called from outside this
     *  file), kept so any future caller doesn't throw. */
    onChange() {},
    clear() {},
  };
})();

if (typeof module !== 'undefined') module.exports = HistoryEngine;
