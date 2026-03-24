/**
 * KeyboardEngine — ReportForge v19 Phase 3
 * ─────────────────────────────────────────────────────────────────
 * Central keyboard shortcut dispatcher.
 * Registers global keydown handler and routes to appropriate engines.
 *
 * Supported shortcuts (matching Crystal Reports + Figma conventions):
 *   Ctrl+Z        → undo
 *   Ctrl+Y        → redo
 *   Ctrl+Shift+Z  → redo (alt)
 *   Ctrl+C        → copy
 *   Ctrl+V        → paste
 *   Ctrl+D        → duplicate
 *   Ctrl+A        → select all
 *   Delete/Bksp   → delete selected
 *   Escape        → deselect / cancel drag
 *   Arrow keys    → nudge (1 model unit; +Shift = 10 units)
 *   Ctrl++/-      → zoom in/out
 *   Ctrl+0        → zoom reset
 *   Ctrl+G        → toggle grid
 *   Ctrl+;        → toggle snap
 */
'use strict';

const KeyboardEngine = (() => {
  let _enabled  = true;
  let _handlers = {};   // 'key:mods' → fn

  /** Encode a key combination into a lookup string */
  function _encode(e) {
    const parts = [];
    if (e.ctrlKey  || e.metaKey) parts.push('ctrl');
    if (e.altKey)   parts.push('alt');
    if (e.shiftKey) parts.push('shift');
    parts.push(e.key.toLowerCase());
    return parts.join('+');
  }

  function _onKeyDown(e) {
    if (!_enabled) return;
    // Don't intercept when typing in an input / contentEditable
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (document.activeElement && document.activeElement.isContentEditable) return;

    const key = _encode(e);
    const fn  = _handlers[key];
    if (fn) {
      e.preventDefault();
      fn(e);
    }
  }

  function _register(combo, fn) { _handlers[combo] = fn; }

  function _init() {
    // ── Undo / Redo ──────────────────────────────────────────────
    _register('ctrl+z', () => {
      if (typeof HistoryEngine !== 'undefined') HistoryEngine.undo();
    });
    _register('ctrl+y', () => {
      if (typeof HistoryEngine !== 'undefined') HistoryEngine.redo();
    });
    _register('ctrl+shift+z', () => {
      if (typeof HistoryEngine !== 'undefined') HistoryEngine.redo();
    });

    // ── Clipboard ────────────────────────────────────────────────
    _register('ctrl+c', () => {
      if (typeof ClipboardEngine !== 'undefined') ClipboardEngine.copy();
    });
    _register('ctrl+x', () => {
      if (typeof ClipboardEngine !== 'undefined') ClipboardEngine.cut();
    });
    _register('ctrl+v', () => {
      if (typeof ClipboardEngine !== 'undefined') ClipboardEngine.paste();
    });
    _register('ctrl+d', () => {
      if (typeof ClipboardEngine !== 'undefined') ClipboardEngine.duplicate();
    });

    // ── Selection ────────────────────────────────────────────────
    _register('ctrl+a', () => {
      if (typeof DS !== 'undefined' && typeof SelectionEngine !== 'undefined') {
        DS.clearSelectionState();
        DS.elements.forEach(el => DS.addSelection(el.id));
        SelectionEngine.renderHandles();
      }
    });
    _register('escape', () => {
      if (typeof ContextMenuEngine !== 'undefined') ContextMenuEngine.hide();
      if (typeof SelectionEngine !== 'undefined') SelectionEngine.clearSelection();
      if (typeof DragEngine !== 'undefined' && DragEngine.cancel) DragEngine.cancel();
    });

    // ── Delete ───────────────────────────────────────────────────
    _register('delete',    _deleteSelected);
    _register('backspace', _deleteSelected);

    // ── Nudge (Arrow keys) ───────────────────────────────────────
    const NUDGE = 1, NUDGE_BIG = 10;
    [
      ['arrowleft',       -NUDGE,     0],
      ['arrowright',       NUDGE,     0],
      ['arrowup',          0,    -NUDGE],
      ['arrowdown',        0,     NUDGE],
      ['shift+arrowleft', -NUDGE_BIG, 0],
      ['shift+arrowright', NUDGE_BIG, 0],
      ['shift+arrowup',    0, -NUDGE_BIG],
      ['shift+arrowdown',  0,  NUDGE_BIG],
    ].forEach(([k, dx, dy]) => {
      _register(k, () => {
        if (typeof DS === 'undefined') return;
        const sel = [...DS.selection];
        if (!sel.length) return;
        if (typeof HistoryEngine !== 'undefined') HistoryEngine.push('nudge');
        sel.forEach(id => {
          const el = DS.getElementById(id);
          if (!el) return;
          if (typeof ElementLayoutEngine !== 'undefined') {
            ElementLayoutEngine.moveElement(el, dx, dy);
          } else {
            el.x += dx; el.y += dy;
          }
        });
        if (typeof DS.saveHistory === 'function') DS.saveHistory();
      });
    });

    // ── Zoom ─────────────────────────────────────────────────────
    _register('ctrl+=',       () => { if (typeof DesignZoomEngine !== 'undefined') DesignZoomEngine.zoomIn(); });
    _register('ctrl++',       () => { if (typeof DesignZoomEngine !== 'undefined') DesignZoomEngine.zoomIn(); });
    _register('ctrl+-',       () => { if (typeof DesignZoomEngine !== 'undefined') DesignZoomEngine.zoomOut(); });
    _register('ctrl+0',       () => { if (typeof DesignZoomEngine !== 'undefined') DesignZoomEngine.set(1.0); });

    // ── Grid / Snap toggles ───────────────────────────────────────
    _register('ctrl+g', () => { if (typeof GridEngine !== 'undefined') GridEngine.toggle(); });
    _register('ctrl+;', () => { if (typeof SnapEngine !== 'undefined') SnapEngine.toggle(); });

    document.addEventListener('keydown', _onKeyDown);
  }

  function _deleteSelected() {
    if (typeof DS === 'undefined' || !DS.selection.size) return;
    if (typeof CommandEngine !== 'undefined') CommandEngine.delete();
  }

  return {
    init() { _init(); },

    /** Register a custom shortcut */
    on(combo, fn) { _register(combo.toLowerCase(), fn); },

    /** Remove a shortcut */
    off(combo) { delete _handlers[combo.toLowerCase()]; },

    /** Enable / disable all shortcuts */
    setEnabled(v) { _enabled = !!v; },

    /** Programmatically fire a combo */
    trigger(combo) {
      const fn = _handlers[combo.toLowerCase()];
      if (fn) fn(new KeyboardEvent('keydown'));
    },
  };
})();

if (typeof module !== 'undefined') module.exports = KeyboardEngine;
