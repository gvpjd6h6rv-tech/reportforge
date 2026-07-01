'use strict';
/**
 * FormatEditorEngine
 *
 * Single responsibility: orchestrate the Format Editor modal.
 * - Open with a selected element
 * - Delegate tab rendering to FormatNumberTab / FormatBordersTab
 * - On Accept: write draft → element.format, update canvas, save history, refresh preview
 * - On Cancel: no-op
 *
 * No SQL. No data fetching. No layout file I/O.
 *
 * API:
 *   FormatEditorEngine.open(el)   → opens modal for element el
 *   FormatEditorEngine.close()    → removes modal (Cancel behavior)
 */
(function initFormatEditorEngine(global) {

  let _modal = null;

  // ── Helpers ──────────────────────────────────────────────────────────────

  function _el(tag, style, text) {
    const node = global.document.createElement(tag);
    if (style) node.style.cssText = style;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function _cloneDraftFormat(el) {
    const src = (el && el.format) || {};
    // Deep-clone number (has nested objects: currency, negative, zero...)
    const number = src.number ? JSON.parse(JSON.stringify(src.number)) : null;
    const borders = src.borders ? Object.assign({}, src.borders) : null;
    return { number: number, borders: borders };
  }

  // ── Tab system ────────────────────────────────────────────────────────────

  function _buildTabs(tabBar, tabContent, draft) {
    const TABS = [
      { id: 'number',  label: 'Número',  render: function(c) { FormatNumberTab.render(c, draft); } },
      { id: 'borders', label: 'Bordes',  render: function(c) { FormatBordersTab.render(c, draft); } },
    ];

    let active = TABS[0].id;

    function _activate(id) {
      active = id;
      tabBar.querySelectorAll('.fmt-tab-btn').forEach(function(btn) {
        const isActive = btn.dataset.tab === id;
        btn.style.background = isActive ? '#fff' : '#ddd';
        btn.style.borderBottom = isActive ? '2px solid #fff' : '2px solid #ccc';
        btn.style.fontWeight = isActive ? 'bold' : 'normal';
      });
      tabContent.innerHTML = '';
      const tab = TABS.find(function(t) { return t.id === id; });
      if (tab) tab.render(tabContent);
    }

    TABS.forEach(function(tab) {
      const btn = _el('button', [
        'font-size:10px;padding:3px 10px;cursor:pointer;',
        'border:1px solid #ccc;border-bottom:none;',
        'background:#ddd;margin-right:2px;font-family:Tahoma,Arial,sans-serif;',
      ].join(''));
      btn.className = 'fmt-tab-btn';
      btn.dataset.tab = tab.id;
      btn.textContent = tab.label;
      btn.addEventListener('click', function() { _activate(tab.id); });
      tabBar.appendChild(btn);
    });

    _activate(active);
  }

  // ── Modal builder ─────────────────────────────────────────────────────────

  function _buildModal(el) {
    const draft = _cloneDraftFormat(el);

    const backdrop = _el('div', [
      'position:fixed;inset:0;',
      'display:flex;align-items:center;justify-content:center;',
      'background:rgba(0,0,0,0.35);',
      'z-index:10000;',
      'font-family:Tahoma,"Microsoft Sans Serif",Arial,sans-serif;',
      'font-size:11px;',
    ].join(''));
    backdrop.id = 'format-editor-modal';
    backdrop.setAttribute('role', 'dialog');
    backdrop.setAttribute('aria-modal', 'true');
    backdrop.setAttribute('aria-label', 'Editor de Formato');

    const dialog = _el('div', [
      'background:#ECE9D8;',
      'border:1px solid #7a96df;',
      'border-radius:3px;',
      'box-shadow:2px 3px 8px rgba(0,0,0,0.4);',
      'min-width:360px;max-width:460px;width:400px;',
      'user-select:none;',
    ].join(''));

    // Title bar
    const titleBar = _el('div', [
      'background:linear-gradient(to right,#0A246A,#A6B8E0);',
      'color:#fff;font-size:11px;font-weight:bold;',
      'padding:4px 8px;display:flex;align-items:center;justify-content:space-between;',
      'border-radius:2px 2px 0 0;cursor:move;',
    ].join(''));
    const titleSpan = _el('span', 'pointer-events:none;', '⚙ Editor de Formato — ' + (el.fieldPath || el.id || el.type || 'elemento'));
    const closeBtn = _el('button', [
      'background:#c0392b;color:#fff;border:none;',
      'width:16px;height:14px;font-size:8px;cursor:pointer;',
      'font-family:monospace;line-height:1;padding:0;',
    ].join(''), '✕');
    closeBtn.title = 'Cerrar';
    closeBtn.addEventListener('click', function() { close(); });
    titleBar.appendChild(titleSpan);
    titleBar.appendChild(closeBtn);

    // Body
    const body = _el('div', 'padding:8px;');

    const tabBar = _el('div', 'display:flex;margin-bottom:0;');
    const tabContent = _el('div', [
      'background:#fff;border:1px solid #ccc;',
      'padding:8px;min-height:180px;',
    ].join(''));

    _buildTabs(tabBar, tabContent, draft);

    body.appendChild(tabBar);
    body.appendChild(tabContent);

    // Buttons
    const btnRow = _el('div', 'display:flex;justify-content:flex-end;gap:6px;padding:8px;');

    const acceptBtn = _el('button', [
      'font-size:10px;padding:3px 14px;cursor:pointer;',
      'background:#ECE9D8;border:1px solid #888;',
      'font-family:Tahoma,Arial,sans-serif;font-weight:bold;',
    ].join(''), 'Aceptar');
    acceptBtn.addEventListener('click', function() { _accept(el, draft); });

    const cancelBtn = _el('button', [
      'font-size:10px;padding:3px 14px;cursor:pointer;',
      'background:#ECE9D8;border:1px solid #888;',
      'font-family:Tahoma,Arial,sans-serif;',
    ].join(''), 'Cancelar');
    cancelBtn.addEventListener('click', function() { close(); });

    btnRow.appendChild(acceptBtn);
    btnRow.appendChild(cancelBtn);

    dialog.appendChild(titleBar);
    dialog.appendChild(body);
    dialog.appendChild(btnRow);
    backdrop.appendChild(dialog);

    // Keyboard: Escape → cancel
    backdrop.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') close();
    });

    return backdrop;
  }

  // ── Accept (save) ────────────────────────────────────────────────────────

  function _accept(el, draft) {
    if (!el.format) el.format = {};

    // number: save if tab was opened (non-null draft)
    if (draft.number !== null) {
      el.format.number = JSON.parse(JSON.stringify(draft.number));
    } else {
      delete el.format.number;
    }

    // borders: save only if at least one side is active
    if (draft.borders !== null) {
      const hasBorder = ['top','right','bottom','left'].some(function(s) { return draft.borders[s]; });
      if (hasBorder) {
        el.format.borders = Object.assign({}, draft.borders);
      } else {
        delete el.format.borders;
      }
    } else {
      delete el.format.borders;
    }

    // Clean up empty format object
    if (el.format && Object.keys(el.format).length === 0) delete el.format;

    // Update design canvas
    if (typeof _canonicalCanvasWriter !== 'undefined') {
      _canonicalCanvasWriter().updateElement(el.id);
    }
    // Persist in history
    if (typeof DS !== 'undefined' && typeof DS.saveHistory === 'function') {
      DS.saveHistory();
    }
    // Refresh Preview if active
    if (typeof DS !== 'undefined' && DS.previewMode) {
      const renderer = global.PreviewEngineRenderer;
      if (renderer && typeof renderer.refresh === 'function') {
        renderer.refresh();
      }
    }

    DebugTrace.log('edit', 'FormatEditorEngine.accept', 'format-saved', { id: el.id, format: el.format });

    close();
  }

  // ── Public API ────────────────────────────────────────────────────────────

  function open(el) {
    if (!el) return;
    close();
    _modal = _buildModal(el);
    global.document.body.appendChild(_modal);
    _modal.focus();
  }

  function close() {
    if (_modal && _modal.parentNode) {
      _modal.parentNode.removeChild(_modal);
    }
    _modal = null;
  }

  global.FormatEditorEngine = { open, close };

})(window);
