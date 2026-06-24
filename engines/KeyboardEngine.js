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
  // Handler registry. KeyboardRegistry.js / KeyboardCombo.js were retired in
  // P31B (zombies — neither was ever loaded by any designer/*.html <script>
  // tag, and this inline registry was always the real, only implementation
  // in production; confirmed identical API/behavior before retirement).
  const _h = Object.create(null);
  const R = { register: (c, f) => { _h[c] = f; }, off: (c) => { delete _h[c]; },
              get: (c) => _h[c] || null, trigger: (c, e) => { const f = _h[c]; if (f) f(e); return !!f; }, clear: () => { Object.keys(_h).forEach(k => delete _h[k]); } };

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
    const fn  = R.get(key);
    if (fn) {
      e.preventDefault();
      fn(e);
    }
  }

  function _register(combo, fn) { R.register(combo, fn); }

  function _registerUndoRedoShortcuts() {
    _register('ctrl+z', () => {
      if (typeof HistoryEngine !== 'undefined') HistoryEngine.undo();
    });
    _register('ctrl+y', () => {
      if (typeof HistoryEngine !== 'undefined') HistoryEngine.redo();
    });
    _register('ctrl+shift+z', () => {
      if (typeof HistoryEngine !== 'undefined') HistoryEngine.redo();
    });
  }

  function _registerClipboardShortcuts() {
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
  }

  function _registerSelectionShortcuts() {
    _register('ctrl+a', () => {
      // Delegates to CommandEngine.selectAll() (CommandRuntimeSelection,
      // merged in production via CommandRuntime.js — same alias
      // _deleteSelected() already uses for Ctrl+X/Delete) so Ctrl+A runs the
      // same syncSelectionPanels() chain the menu/toolbar select-all uses
      // (P24A/B — the inline duplicate below only called
      // SelectionEngine.renderHandles(), never PropertiesEngine.render() or
      // FormatEngine.updateToolbar(), leaving those panels stale).
      //
      // The block below is kept ONLY as a fallback for when CommandEngine
      // isn't loaded — it must keep working standalone, but is no longer
      // the path production actually takes.
      if (typeof CommandEngine !== 'undefined') { CommandEngine.selectAll(); return; }
      if (typeof DS !== 'undefined' && typeof SelectionEngine !== 'undefined') {
        DS.clearSelectionState('KeyboardEngine.selectAll');
        DS.elements.forEach(el => DS.addSelection(el.id, 'KeyboardEngine.selectAll'));
        SelectionEngine.renderHandles();
      }
    });
    _register('escape', () => {
      if (typeof ContextMenuEngine !== 'undefined') ContextMenuEngine.hide();
      if (typeof SelectionEngine !== 'undefined') SelectionEngine.clearSelection();
      if (typeof DragEngine !== 'undefined' && DragEngine.cancel) DragEngine.cancel();
    });
  }

  function _renderHandlesAfterNudge() {
    if (typeof SelectionEngine === 'undefined' || typeof SelectionEngine.renderHandles !== 'function') return;
    if (typeof RenderScheduler !== 'undefined' && typeof RenderScheduler.flushSync === 'function') {
      RenderScheduler.flushSync(() => SelectionEngine.renderHandles(), 'KeyboardEngine.nudge.renderHandles');
      return;
    }
    SelectionEngine.renderHandles();
  }

  function _nudgeSelected(dx, dy) {
    if (typeof DS === 'undefined') return;
    const sel = [...DS.selection];
    if (!sel.length) return;
    // RF-PARITY-AUDIT-1: no pre-push — HistoryEngine.push now delegates to
    // DS.saveHistory() (post-mutation), already called below; a pre-push
    // here would double-save.
    sel.forEach(id => {
      const el = DS.getElementById(id);
      if (!el) return;
      if (typeof ElementLayoutEngine !== 'undefined') {
        ElementLayoutEngine.moveElement(el, dx, dy);
      } else {
        el.x += dx; el.y += dy;
      }
    });
    _renderHandlesAfterNudge();
    if (typeof DS.saveHistory === 'function') DS.saveHistory();
  }

  function _registerNudgeShortcuts() {
    const NUDGE = 1;
    const NUDGE_BIG = 10;
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
      _register(k, () => _nudgeSelected(dx, dy));
    });
  }

  function _registerZoomShortcuts() {
    _register('ctrl+=',       () => { if (typeof DesignZoomEngine !== 'undefined') DesignZoomEngine.zoomIn(undefined, undefined, { event: 'keyboard-plus', fn: 'KeyboardEngine.ctrl+=' }); });
    _register('ctrl++',       () => { if (typeof DesignZoomEngine !== 'undefined') DesignZoomEngine.zoomIn(undefined, undefined, { event: 'keyboard-plus', fn: 'KeyboardEngine.ctrl++' }); });
    _register('ctrl+-',       () => { if (typeof DesignZoomEngine !== 'undefined') DesignZoomEngine.zoomOut(undefined, undefined, { event: 'keyboard-minus', fn: 'KeyboardEngine.ctrl+-' }); });
    _register('ctrl+0',       () => { if (typeof DesignZoomEngine !== 'undefined') DesignZoomEngine.set(1.0, undefined, undefined, { event: 'keyboard-reset', fn: 'KeyboardEngine.ctrl+0' }); });
  }

  function _registerGridShortcuts() {
    _register('ctrl+g', () => { if (typeof GridEngine !== 'undefined') GridEngine.toggle(); });
    // P31B: was `if (typeof SnapState !== 'undefined') SnapState.toggle()` —
    // SnapState.js was retired (zombie, never loaded; see SS-12 notes), so
    // this was a permanent no-op despite the shortcut being documented above
    // ("Ctrl+; → toggle snap"). Delegates to the same real toggle-snap path
    // the menu item (data-action="toggle-snap") already uses, instead of
    // duplicating DS.setSnapToGrid logic and risking a #btn-snap UI desync.
    _register('ctrl+;', () => { if (typeof handleAction === 'function') handleAction('toggle-snap'); });
    // Was never registered at all — the menu item (data-action="new")
    // already advertises "Ctrl+N" as its shortcut label, but with no
    // listener for this combo, e.preventDefault() never ran, so Ctrl+N
    // fell through to the browser's native "open new window" shortcut.
    // KNOWN PLATFORM LIMITATION (confirmed live in real Firefox, not
    // fixable here): Ctrl+N is one of a handful of combos (with Ctrl+T,
    // Ctrl+W) that browsers reserve at the chrome/OS level and never let
    // page JS preventDefault() — registering it below is still correct
    // (it makes "Nuevo" work via Ctrl+N inside any embedding that DOES
    // forward the keydown, e.g. a packaged Electron/webview shell), but in
    // a real browser tab the native new-window action will keep firing
    // alongside it. The menu/toolbar "Nuevo" button is the reliable path
    // in-browser — see reportforge/tests/file_new_document_contract.test.mjs.
    _register('ctrl+n', () => { if (typeof handleAction === 'function') handleAction('new'); });
  }

  function _init() {
    _registerUndoRedoShortcuts();
    _registerClipboardShortcuts();
    _registerSelectionShortcuts();
    _register('delete', _deleteSelected);
    _register('backspace', _deleteSelected);
    _registerNudgeShortcuts();
    _registerZoomShortcuts();
    _registerGridShortcuts();

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
    off(combo) { R.off(combo.toLowerCase()); },

    /** Enable / disable all shortcuts */
    setEnabled(v) { _enabled = !!v; },

    /** Programmatically fire a combo */
    trigger(combo) { R.trigger(combo.toLowerCase(), new KeyboardEvent('keydown')); },

    registry: R,
  };
})();

if (typeof module !== 'undefined') module.exports = KeyboardEngine;
