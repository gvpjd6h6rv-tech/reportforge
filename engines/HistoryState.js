'use strict';

const HistoryState = (() => {
  function createHistoryState(maxStack = 100) {
    const undoStack = [];
    const redoStack = [];
    const listeners = [];
    let suppressed = false;

    function summary() {
      return {
        canUndo: undoStack.length > 0,
        canRedo: redoStack.length > 0,
        undoLabel: undoStack.length ? undoStack[undoStack.length - 1].label : null,
        redoLabel: redoStack.length ? redoStack[redoStack.length - 1].label : null,
      };
    }

    function notify() {
      const state = summary();
      listeners.forEach((fn) => {
        try { fn(state); } catch (e) {}
      });
      return state;
    }

    function pushUndo(entry) {
      undoStack.push(entry);
      if (undoStack.length > maxStack) undoStack.shift();
    }

    function pushRedo(entry) {
      redoStack.push(entry);
      if (redoStack.length > maxStack) redoStack.shift();
    }

    function popUndo() {
      return undoStack.pop() || null;
    }

    function popRedo() {
      return redoStack.pop() || null;
    }

    function clearRedo() {
      redoStack.length = 0;
    }

    function clear() {
      undoStack.length = 0;
      redoStack.length = 0;
      return notify();
    }

    function canUndo() {
      return undoStack.length > 0;
    }

    function canRedo() {
      return redoStack.length > 0;
    }

    function onChange(fn) {
      if (typeof fn === 'function') listeners.push(fn);
    }

    function suppress(fn) {
      suppressed = true;
      try { return fn(); } finally { suppressed = false; }
    }

    return {
      maxStack,
      undoStack,
      redoStack,
      listeners,
      get suppressed() { return suppressed; },
      summary,
      notify,
      pushUndo,
      pushRedo,
      popUndo,
      popRedo,
      clearRedo,
      clear,
      canUndo,
      canRedo,
      onChange,
      suppress,
    };
  }

  return { createHistoryState };
})();

if (typeof module !== 'undefined') module.exports = HistoryState;
