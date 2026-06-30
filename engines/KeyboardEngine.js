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
 *   F5            → toggle preview
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

  // RF-DESIGN-KEYBOARD-FLICKER-1: arrow-key nudge combos. A held key
  // (autorepeat) fires _onKeyDown many times for one user gesture; any
  // OTHER shortcut firing mid-nudge flushes the pending coalesced history
  // commit first (see _scheduleNudgeCommit/_flushPendingNudgeCommit below),
  // so e.g. Ctrl+Z right after a nudge sees it in history.
  const _nudgeCombos = new Set();

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
      if (!_nudgeCombos.has(key)) _flushPendingNudgeCommit();
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

  // RF-DESIGN-KEYBOARD-FLICKER-1: a held arrow key autorepeats _onKeyDown
  // many times for ONE user gesture. DS.saveHistory() used to be called on
  // every one of those keydowns — and engines/CommandRuntimeInit.js patches
  // DS.saveHistory to also trigger a full PreviewEngineRenderer.refresh()
  // (blank #preview-content, fetch, rebuild) whenever DS.previewMode is
  // true, so a held key produced a full-page Preview blank/rebuild on every
  // autorepeat tick — the reported flicker. Mouse drag never had this
  // because it only calls saveHistory() once, on mouseup.
  //
  // Fix: coalesce the nudge's saveHistory() call to fire once per gesture.
  // First attempt used a short (250ms) idle debounce as the ONLY trigger —
  // but a real held key has an OS-level "initial repeat delay" before
  // autorepeat kicks in (commonly 500-650ms), which is LONGER than 250ms.
  // So the debounce timer fired on its own after the very FIRST keydown,
  // before the second (repeated) keydown ever arrived — committing/
  // refreshing once near the start of the hold, then again at release: two
  // flickers per gesture instead of one. (A synthetic test that fires
  // repeat keydowns every ~35ms from the start, with no initial-delay gap,
  // never reproduces this — confirmed live, see
  // design_keyboard_nudge_preview_hold_single_commit.test.mjs.)
  //
  // Real fix, mirroring mouse drag's mousedown→...→mouseup model exactly:
  // the deterministic "gesture ended" signal is the arrow key's keyup
  // (_onNudgeKeyUp below) — no timer, no polling (Principle #59). A lost
  // keyup (e.g. focus left the page mid-hold) is still covered by the
  // window 'blur' listener below, and by _onKeyDown flushing on any other
  // shortcut.
  let _nudgeCommitPending = false;

  function _flushPendingNudgeCommit() {
    if (!_nudgeCommitPending) return;
    _nudgeCommitPending = false;
    if (typeof DS !== 'undefined' && typeof DS.saveHistory === 'function') DS.saveHistory();
  }

  function _scheduleNudgeCommit() {
    _nudgeCommitPending = true;
  }

  function _onNudgeKeyUp(e) {
    const k = (e.key || '').toLowerCase();
    if (k === 'arrowleft' || k === 'arrowright' || k === 'arrowup' || k === 'arrowdown') {
      _flushPendingNudgeCommit();
    }
  }

  function _renderHandlesAfterNudge() {
    if (typeof SelectionEngine === 'undefined' || typeof SelectionEngine.renderHandles !== 'function') return;
    if (typeof RenderScheduler !== 'undefined' && typeof RenderScheduler.flushSync === 'function') {
      RenderScheduler.flushSync(() => SelectionEngine.renderHandles(), 'KeyboardEngine.nudge.renderHandles');
      return;
    }
    SelectionEngine.renderHandles();
  }

  // RF-DESIGN-KEYBOARD-FLICKER-1: the coalesced DS.saveHistory() above only
  // fires once per gesture, so the canonical full Preview refresh it
  // triggers (CommandRuntimeInit's patch) is also once per gesture — same
  // as a mouse drag's mouseup. But mouse drag stays visually live in
  // Preview WHILE dragging via SelectionDragPreviewSync (engines/
  // SelectionInteractionMotion.js _doMove), which restyles the existing
  // preview nodes directly instead of refreshing. Without the equivalent
  // here, the Preview pane sat frozen for the whole held-key gesture and
  // only snapped to the final position once the debounced commit fired —
  // a worse regression (freeze + big jump) than the flicker being fixed.
  // Mirror the same direct-restyle step (matching _doResize's pattern,
  // since nudge — like resize — sets the model's exact x/y with no
  // raw-vs-snapped gap to bridge, so no transform offset is needed).
  function _syncPreviewForNudge(el) {
    if (typeof DS === 'undefined' || !DS.previewMode || typeof document === 'undefined') return;
    document.querySelectorAll(`.pv-el[data-origin-id="${el.id}"]`).forEach(pv => {
      pv.style.left = el.x + 'px';
      pv.style.top = el.y + 'px';
    });
    if (typeof SelectionDragPreviewSync !== 'undefined') {
      SelectionDragPreviewSync.findPreviewRenderNodes({ id: el.id, sectionId: el.sectionId }).forEach(node => {
        node.style.left = el.x + 'px';
        node.style.top = el.y + 'px';
      });
    }
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
      _syncPreviewForNudge(el);
    });
    _renderHandlesAfterNudge();
    _scheduleNudgeCommit();
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
      _nudgeCombos.add(k);
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

  // RF-PRODUCTION-CERTIFICATION-DESIGN-PREVIEW-1: the menu/toolbar already
  // advertise "Ctrl+S"/"Ctrl+O" as shortcut labels, but neither was ever
  // registered here — pressing them did nothing (confirmed live: zero
  // FileEngine.save()/load() calls). Delegates to the same handlers the
  // Guardar/Abrir buttons already use.
  function _registerFileShortcuts() {
    _register('ctrl+s', () => { if (typeof FileEngine !== 'undefined') FileEngine.save(); });
    _register('ctrl+o', () => { if (typeof FileEngine !== 'undefined') FileEngine.load(); });
  }

  function _registerPreviewShortcuts() {
    _register('f5', () => { if (typeof handleAction === 'function') handleAction('preview'); });
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
    _registerFileShortcuts();
    _registerPreviewShortcuts();

    document.addEventListener('keydown', _onKeyDown);
    // The arrow key's own keyup is the real "gesture ended" signal (mouse
    // drag's equivalent of mouseup) — see _onNudgeKeyUp / the comment above
    // _scheduleNudgeCommit for why the debounce timer alone is not enough.
    document.addEventListener('keyup', _onNudgeKeyUp);
    // Safety net: if focus leaves the page mid-hold (e.g. alt-tab) and no
    // further keydown ever arrives to flush it via _onKeyDown, the pending
    // nudge commit must still happen rather than rely solely on its timer.
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('blur', _flushPendingNudgeCommit);
    }
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
