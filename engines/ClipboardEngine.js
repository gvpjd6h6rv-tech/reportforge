/**
 * ClipboardEngine — ReportForge v19 Phase 3
 * ─────────────────────────────────────────────────────────────────
 * Copy, paste, and duplicate elements.
 * Clipboard stores MODEL SPACE snapshots — never view-space values.
 *
 * Paste offset: 8 model units right+down (matches Crystal Reports).
 */
'use strict';

const ClipboardEngine = (() => {
  const PASTE_OFFSET = 8;   // model units
  const S = typeof ClipboardState !== 'undefined' ? ClipboardState : (() => {
    // Inline fallback when ClipboardState is not loaded (test / legacy context).
    let _c = [];
    return { get: () => _c, set: (v) => { _c = v; }, clear: () => { _c = []; }, hasContent: () => _c.length > 0, snapshot: () => _c.slice(), size: () => _c.length };
  })();

  function _deepCopyEl(el) {
    return JSON.parse(JSON.stringify(el));
  }

  /** Generate a new unique element ID */
  function _newId() {
    return 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  }

  /**
   * Copy selected elements to internal clipboard.
   */
  function copy() {
    if (typeof DS === 'undefined') return;
    const sel = [...DS.selection];
    if (!sel.length) return;
    S.set(sel.map(id => DS.getElementById(id)).filter(Boolean).map(_deepCopyEl));
  }

  /**
   * Paste clipboard contents, offset by PASTE_OFFSET each time.
   * Returns array of newly created element IDs.
   */
  function paste() {
    if (!S.hasContent() || typeof DS === 'undefined') return [];
    if (typeof HistoryEngine !== 'undefined') HistoryEngine.push('paste');

    const newIds = [];
    S.snapshot().forEach(src => {
      const el = _deepCopyEl(src);
      el.id = _newId();
      el.x  = src.x + PASTE_OFFSET;
      el.y  = src.y + PASTE_OFFSET;
      DS.elements.push(el);
      if (typeof _canonicalCanvasWriter === 'function') _canonicalCanvasWriter().renderElement(el);
      newIds.push(el.id);
    });

    // Offset original clipboard for next paste
    S.get().forEach(el => { el.x += PASTE_OFFSET; el.y += PASTE_OFFSET; });

    // Re-render and select new elements
    if (typeof SelectionEngine !== 'undefined') {
      DS.clearSelectionState();
      newIds.forEach(id => DS.addSelection(id));
      SelectionEngine.renderHandles();
    }
    if (typeof PropertiesEngine !== 'undefined') PropertiesEngine.render();
    if (typeof FormatEngine !== 'undefined') FormatEngine.updateToolbar();
    if (typeof DS.saveHistory === 'function') DS.saveHistory();
    return newIds;
  }

  /**
   * Cut selected elements: copy them then delete the originals.
   */
  function cut() {
    copy();
    if (typeof CommandEngine !== 'undefined') CommandEngine.delete();
  }

  /**
   * Duplicate selected elements (copy + paste in one step).
   * Returns array of new element IDs.
   */
  function duplicate() {
    copy();
    // Reset offset so duplicate lands adjacent to original
    S.get().forEach(el => { el.x -= PASTE_OFFSET; el.y -= PASTE_OFFSET; });
    return paste();
  }

  return {
    copy,
    cut,
    paste,
    duplicate,
    hasContent() { return S.hasContent(); },
    clear()      { S.clear(); },
    state:       S,
  };
})();

if (typeof module !== 'undefined') module.exports = ClipboardEngine;
