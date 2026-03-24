/**
 * HistoryEngine — ReportForge v19 Phase 3
 * ─────────────────────────────────────────────────────────────────
 * Undo / redo action stack.
 * Delegates to DS.saveHistory / DS.undo / DS.redo when available.
 * Extends with named-action tracking and state diffing.
 *
 * Architecture rule:
 *   History stores MODEL SPACE snapshots only.
 *   View-space derived values are never persisted.
 */
'use strict';

const HistoryEngine = (() => {
  const MAX_STACK = 100;

  const _undoStack = [];   // { label, snapshot }
  const _redoStack = [];   // { label, snapshot }

  let _listeners  = [];
  let _suppressed = false;

  function _notify() {
    const state = {
      canUndo: _undoStack.length > 0,
      canRedo: _redoStack.length > 0,
      undoLabel: _undoStack.length ? _undoStack[_undoStack.length - 1].label : null,
      redoLabel: _redoStack.length ? _redoStack[_redoStack.length - 1].label : null,
    };
    _listeners.forEach(fn => { try { fn(state); } catch (e) {} });
  }

  /**
   * Snapshot current DS state (model only).
   */
  function _snapshot() {
    if (typeof DS === 'undefined') return null;
    return JSON.stringify({
      elements: DS.elements,
      sections: DS.sections,
      zoom:     DS.zoom,
    });
  }

  /**
   * Restore a snapshot to DS.
   */
  function _restore(snap) {
    if (!snap || typeof DS === 'undefined') return;
    try {
      const state = JSON.parse(snap);
      DS.elements = state.elements;
      DS.sections = state.sections;
      // Trigger re-render
      if (typeof CanvasLayoutEngine !== 'undefined') CanvasLayoutEngine.update();
      if (typeof SectionLayoutEngine !== 'undefined') SectionLayoutEngine.update();
      if (typeof ElementLayoutEngine !== 'undefined') ElementLayoutEngine.update();
      if (typeof OverlayEngine !== 'undefined') OverlayEngine.render();
    } catch (e) {
      console.error('[HistoryEngine] restore failed:', e);
    }
  }

  return {
    /**
     * Push the current state to the undo stack.
     * Call BEFORE making a model change.
     * @param {string} label  — human-readable action name
     */
    push(label = 'action') {
      if (_suppressed) return;
      const snap = _snapshot();
      if (!snap) return;
      _undoStack.push({ label, snapshot: snap });
      if (_undoStack.length > MAX_STACK) _undoStack.shift();
      _redoStack.length = 0;   // invalidate redo on new action
      _notify();
      // Delegate to monolithic saveHistory if available
      if (typeof DS !== 'undefined' && typeof DS.saveHistory === 'function') {
        DS.saveHistory();
      }
    },

    undo() {
      const entry = _undoStack.pop();
      if (!entry) return false;
      // Push current state to redo
      const redoSnap = _snapshot();
      if (redoSnap) _redoStack.push({ label: entry.label, snapshot: redoSnap });
      _restore(entry.snapshot);
      _notify();
      // Delegate to monolithic undo
      if (typeof DS !== 'undefined' && typeof DS.undo === 'function') DS.undo();
      return true;
    },

    redo() {
      const entry = _redoStack.pop();
      if (!entry) return false;
      const undoSnap = _snapshot();
      if (undoSnap) _undoStack.push({ label: entry.label, snapshot: undoSnap });
      _restore(entry.snapshot);
      _notify();
      if (typeof DS !== 'undefined' && typeof DS.redo === 'function') DS.redo();
      return true;
    },

    canUndo() { return _undoStack.length > 0; },
    canRedo() { return _redoStack.length > 0; },

    /** Suppress push() calls (e.g. during programmatic batch updates) */
    suppress(fn) {
      _suppressed = true;
      try { fn(); } finally { _suppressed = false; }
    },

    /** Subscribe to stack changes */
    onChange(fn) { _listeners.push(fn); },

    /** Clear all history */
    clear() { _undoStack.length = 0; _redoStack.length = 0; _notify(); },
  };
})();

if (typeof module !== 'undefined') module.exports = HistoryEngine;
