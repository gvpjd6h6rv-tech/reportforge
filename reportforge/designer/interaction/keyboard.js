// ─────────────────────────────────────────────────────────────────────────────
// interaction/keyboard.js  –  Keyboard shortcuts  (features 30–33)
// ─────────────────────────────────────────────────────────────────────────────
RF.Keyboard = {

  init() {
    document.addEventListener('keydown', e => this._handle(e));
  },

  _handle(e) {
    if (e.target.matches('input,textarea,select')) return;

    const ctrl  = e.ctrlKey || e.metaKey;
    const shift = e.shiftKey;

    // ── Undo / Redo ──────────────────────────────────────────────
    if (ctrl && !shift && e.key === 'z') {
      e.preventDefault();
      RF.History.undo();
      RF.Sections.fullRender();   // ← fixes canvas not updating after Ctrl+Z
      return;
    }
    if (ctrl && (e.key === 'y' || (shift && e.key === 'z'))) {
      e.preventDefault();
      RF.History.redo();
      RF.Sections.fullRender();   // ← fixes canvas not updating after Ctrl+Y
      return;
    }

    // ── Select all ───────────────────────────────────────────────
    if (ctrl && e.key === 'a') { e.preventDefault(); RF.Selection.selectAll(); return; }

    // ── Copy / Paste / Duplicate ─────────────────────────────────
    if (ctrl && e.key === 'c') { e.preventDefault(); this._copy();      return; }
    if (ctrl && e.key === 'v') { e.preventDefault(); this._paste();     return; }
    if (ctrl && e.key === 'd') { e.preventDefault(); this._duplicate(); return; }

    // ── Delete (feature 30) ──────────────────────────────────────
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      const ids = [...RF.AppState.selectedIds];
      if (ids.length) {
        RF.History.snapshot('before-delete');
        RF.ElementFactory.deleteElements(ids);
        RF.EventBus.emit('status', `Deleted ${ids.length} element(s)`);
      }
      return;
    }

    // ── Escape: switch to select tool ────────────────────────────
    if (e.key === 'Escape') {
      RF.Toolbar.setTool('select', document.querySelector('[data-tool="select"]'));
      RF.Selection.clear();
      return;
    }

    // ── Tool shortcuts ───────────────────────────────────────────
    if (!ctrl && !shift) {
      const toolMap = { v:'select', t:'text', f:'field', l:'line', r:'rect', i:'image' };
      if (toolMap[e.key]) {
        const btn = document.querySelector(`[data-tool="${toolMap[e.key]}"]`);
        RF.Toolbar.setTool(toolMap[e.key], btn);
        return;
      }
    }

    // ── Arrow movement (feature 31) ──────────────────────────────
    const STEP = shift ? 10 : 1;
    let dx = 0, dy = 0;
    switch (e.key) {
      case 'ArrowLeft':  dx = -STEP; break;
      case 'ArrowRight': dx = +STEP; break;
      case 'ArrowUp':    dy = -STEP; break;
      case 'ArrowDown':  dy = +STEP; break;
      default: return;
    }
    e.preventDefault();
    const moved = RF.AppState.selectedElements;
    if (!moved.length) return;
    RF.History.snapshot('before-arrow-move');
    moved.forEach(el => {
      el.x = Math.max(0, el.x + dx);
      el.y = Math.max(0, el.y + dy);
      const div = document.getElementById(`el-${el.id}`);
      if (div) { div.style.left = el.x+'px'; div.style.top = el.y+'px'; }
    });
    RF.SelectionHandles.sync();
    RF.AppState.isDirty = true;
    RF.EventBus.emit('inspector:refresh');
  },

  // ── Copy / Paste / Duplicate (features 24–26) ─────────────────────────────
  _copy() {
    RF.AppState.clipboard = RF.AppState.selectedElements.map(e => RF.clone(e));
    RF.EventBus.emit('status', `Copied ${RF.AppState.clipboard.length} element(s)`);
  },

  _paste() {
    const cb = RF.AppState.clipboard;
    if (!cb.length) return;
    RF.History.snapshot('before-paste');
    const newIds = [];
    cb.forEach(src => {
      const el = RF.clone(src);
      el.id = RF.uid('el');
      el.x += 16; el.y += 16;
      RF.AppState.layout.elements.push(el);
      newIds.push(el.id);
    });
    RF.AppState.selectedIds = new Set(newIds);
    RF.AppState.isDirty = true;
    RF.EventBus.emit('layout:changed');
    RF.EventBus.emit('selection:changed');
    RF.EventBus.emit('status', `Pasted ${newIds.length} element(s)`);
  },

  _duplicate() {
    const selected = RF.AppState.selectedElements;
    if (!selected.length) return;
    RF.History.snapshot('before-duplicate');
    const newIds = [];
    selected.forEach(src => {
      const el = RF.clone(src);
      el.id = RF.uid('el');
      el.x += 16; el.y += 16;
      RF.AppState.layout.elements.push(el);
      newIds.push(el.id);
    });
    RF.AppState.selectedIds = new Set(newIds);
    RF.AppState.isDirty = true;
    RF.EventBus.emit('layout:changed');
    RF.EventBus.emit('selection:changed');
    RF.EventBus.emit('status', `Duplicated ${newIds.length} element(s)`);
  },
};
