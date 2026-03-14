// ─────────────────────────────────────────────────────────────────────────────
// history/history.js  –  Undo / Redo  (features 28–29)
// Snapshot-based: stores deep clones of {layout, selectedIds[]}
// ─────────────────────────────────────────────────────────────────────────────
RF.History = new (class {
  constructor() {
    this._stack   = [];   // array of layout snapshots
    this._index   = -1;
    this._MAX     = 100;
    this._paused  = false;
  }

  /** Call before any mutation to save current state */
  snapshot(label = '') {
    if (this._paused) return;
    const snap = {
      label,
      layout: RF.clone(RF.AppState.layout),
      selectedIds: [...RF.AppState.selectedIds],
    };
    // Discard future states if we branched
    this._stack = this._stack.slice(0, this._index + 1);
    this._stack.push(snap);
    if (this._stack.length > this._MAX) this._stack.shift();
    this._index = this._stack.length - 1;
    this._notify();
  }

  undo() {
    if (!this.canUndo) return;
    this._index--;
    this._restore(this._stack[this._index]);
  }

  redo() {
    if (!this.canRedo) return;
    this._index++;
    this._restore(this._stack[this._index]);
  }

  get canUndo() { return this._index > 0; }
  get canRedo() { return this._index < this._stack.length - 1; }

  /** Run fn without recording intermediate states */
  batch(fn) {
    this._paused = true;
    try { fn(); } finally { this._paused = false; }
    this.snapshot('batch');
  }

  clear() {
    this._stack = [];
    this._index = -1;
    this.snapshot('init');
    this._notify();
  }

  _restore(snap) {
    RF.AppState.layout      = RF.clone(snap.layout);
    RF.AppState.selectedIds = new Set(snap.selectedIds);
    RF.AppState.isDirty     = true;
    RF.EventBus.emit('layout:changed');
    RF.EventBus.emit('selection:changed');
    this._notify();
  }

  _notify() {
    RF.EventBus.emit('history:changed', {
      canUndo: this.canUndo,
      canRedo: this.canRedo,
      label:   this._stack[this._index]?.label || '',
    });
  }
})();
