'use strict';

const KeyboardBindings = (() => {
  function createKeyboardBindings(deps = {}) {
    const registry = deps.registry || (typeof KeyboardRegistry !== 'undefined' ? KeyboardRegistry : {
      register() {},
      off() {},
      get() { return null; },
    });
    const combo = deps.combo || (typeof KeyboardCombo !== 'undefined' ? KeyboardCombo : {
      encodeKeyEvent(e) {
        const parts = [];
        if (e.ctrlKey || e.metaKey) parts.push('ctrl');
        if (e.altKey) parts.push('alt');
        if (e.shiftKey) parts.push('shift');
        parts.push(String(e.key || '').toLowerCase());
        return parts.join('+');
      },
    });
    const isEnabled = typeof deps.isEnabled === 'function' ? deps.isEnabled : () => true;
    let _installed = false;

    function deleteSelected() {
      if (typeof DS === 'undefined' || !DS.selection || !DS.selection.size) return;
      if (typeof CommandEngine !== 'undefined') CommandEngine.delete();
    }

    function handleKeyDown(e) {
      if (!isEnabled()) return;
      const tag = document.activeElement && document.activeElement.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (document.activeElement && document.activeElement.isContentEditable) return;

      const fn = registry.get(combo.encodeKeyEvent(e));
      if (fn) {
        e.preventDefault();
        fn(e);
      }
    }

    function installDefaults() {
      if (_installed) return;
      registry.register('ctrl+z', () => {
        if (typeof HistoryEngine !== 'undefined') HistoryEngine.undo();
      });
      registry.register('ctrl+y', () => {
        if (typeof HistoryEngine !== 'undefined') HistoryEngine.redo();
      });
      registry.register('ctrl+shift+z', () => {
        if (typeof HistoryEngine !== 'undefined') HistoryEngine.redo();
      });

      registry.register('ctrl+c', () => {
        if (typeof ClipboardEngine !== 'undefined') ClipboardEngine.copy();
      });
      registry.register('ctrl+x', () => {
        if (typeof ClipboardEngine !== 'undefined') ClipboardEngine.cut();
      });
      registry.register('ctrl+v', () => {
        if (typeof ClipboardEngine !== 'undefined') ClipboardEngine.paste();
      });
      registry.register('ctrl+d', () => {
        if (typeof ClipboardEngine !== 'undefined') ClipboardEngine.duplicate();
      });

      registry.register('ctrl+a', () => {
        if (typeof DS !== 'undefined' && typeof SelectionEngine !== 'undefined') {
          DS.clearSelectionState();
          DS.elements.forEach((el) => DS.addSelection(el.id));
          SelectionEngine.renderHandles();
        }
      });
      registry.register('escape', () => {
        if (typeof ContextMenuEngine !== 'undefined') ContextMenuEngine.hide();
        if (typeof SelectionEngine !== 'undefined') SelectionEngine.clearSelection();
        if (typeof DragEngine !== 'undefined' && DragEngine.cancel) DragEngine.cancel();
      });

      registry.register('delete', deleteSelected);
      registry.register('backspace', deleteSelected);

      const NUDGE = 1;
      const NUDGE_BIG = 10;
      [
        ['arrowleft', -NUDGE, 0],
        ['arrowright', NUDGE, 0],
        ['arrowup', 0, -NUDGE],
        ['arrowdown', 0, NUDGE],
        ['shift+arrowleft', -NUDGE_BIG, 0],
        ['shift+arrowright', NUDGE_BIG, 0],
        ['shift+arrowup', 0, -NUDGE_BIG],
        ['shift+arrowdown', 0, NUDGE_BIG],
      ].forEach(([k, dx, dy]) => {
        registry.register(k, () => {
          if (typeof DS === 'undefined') return;
          const sel = [...DS.selection];
          if (!sel.length) return;
          if (typeof HistoryEngine !== 'undefined') HistoryEngine.push('nudge');
          sel.forEach((id) => {
            const el = DS.getElementById(id);
            if (!el) return;
            if (typeof ElementLayoutEngine !== 'undefined') {
              ElementLayoutEngine.moveElement(el, dx, dy);
            } else {
              el.x += dx;
              el.y += dy;
            }
          });
          if (typeof DS.saveHistory === 'function') DS.saveHistory();
        });
      });

      registry.register('ctrl+=', () => { if (typeof DesignZoomEngine !== 'undefined') DesignZoomEngine.zoomIn(); });
      registry.register('ctrl++', () => { if (typeof DesignZoomEngine !== 'undefined') DesignZoomEngine.zoomIn(); });
      registry.register('ctrl+-', () => { if (typeof DesignZoomEngine !== 'undefined') DesignZoomEngine.zoomOut(); });
      registry.register('ctrl+0', () => { if (typeof DesignZoomEngine !== 'undefined') DesignZoomEngine.set(1.0); });

      registry.register('ctrl+g', () => { if (typeof GridEngine !== 'undefined') GridEngine.toggle(); });
      registry.register('ctrl+;', () => { if (typeof SnapState !== 'undefined') SnapState.toggle(); });

      if (typeof document !== 'undefined') {
        document.addEventListener('keydown', handleKeyDown);
      }
      _installed = true;
    }

    return {
      installDefaults,
      handleKeyDown,
      deleteSelected,
    };
  }

  return { createKeyboardBindings };
})();

if (typeof module !== 'undefined') module.exports = KeyboardBindings;
