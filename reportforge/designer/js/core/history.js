import RF from '../rf.js';

/**
 * core/history.js — RF.Core.HistoryEngine
 * Layer   : Core
 * Purpose : Undo/redo stack. Snapshots the full layout as JSON; restores on
 *           undo/redo via RF.Core.DocumentModel.
 * Deps    : RF.Core.DocumentModel
 */

RF.Core.HistoryEngine = new (class HistoryEngine {
  constructor() {
    this._stack  = [];
    this._cursor = -1;
    this._MAX    = 100;
    this._paused = false;
  }

  snapshot(label='') {
    if (this._paused) return;
    this._stack = this._stack.slice(0, this._cursor+1);
    this._stack.push({
      label,
      layout:      RF.clone(RF.Core.DocumentModel.layout),
      selectedIds: [...RF.Core.DocumentModel.selectedIds],
    });
    if (this._stack.length > this._MAX) this._stack.shift();
    this._cursor = this._stack.length - 1;
    this._notify();
  }

  undo() {
    if (!this.canUndo) return;
    this._cursor--;
    this._restore(this._stack[this._cursor]);
  }

  redo() {
    if (!this.canRedo) return;
    this._cursor++;
    this._restore(this._stack[this._cursor]);
  }

  get canUndo() { return this._cursor > 0; }
  get canRedo()  { return this._cursor < this._stack.length-1; }

  batch(fn) {
    this._paused = true;
    try { fn(); } finally { this._paused = false; }
    this.snapshot('batch');
  }

  clear() {
    this._stack  = [];
    this._cursor = -1;
    this.snapshot('init');
  }

  _restore(snap) {
    RF.Core.DocumentModel.layout      = RF.clone(snap.layout);
    RF.Core.DocumentModel.selectedIds = new Set(snap.selectedIds);
    RF.Core.DocumentModel.isDirty     = true;
    RF.emit(RF.E.LAYOUT_CHANGED);
    RF.emit(RF.E.SEL_CHANGED);
    this._notify();
  }

  _notify() {
    RF.emit(RF.E.HISTORY_CHANGED, {
      canUndo: this.canUndo,
      canRedo:  this.canRedo,
      label:   this._stack[this._cursor]?.label || '',
    });
  }
})();

// Shorthand
RF.H = RF.Core.HistoryEngine;


// ═══════════════════════════════════════════════════════════════════════════════
// RF.Core.SelectionSystem — Manages selectedIds + DOM handle overlay.
// ═══════════════════════════════════════════════════════════════════════════════

RF.H = RF.Core.HistoryEngine;
