'use strict';
/**
 * DocumentLoadModal
 *
 * Responsabilidad única: UI del diálogo "Cargar documento".
 * Recolecta tipo + número, delega a DocumentDataProvider.load(),
 * muestra estados loading / success / error.
 *
 * NO asigna DS._sampleData directamente.
 * NO llama PreviewEngineRenderer.refresh() directamente.
 * Esas responsabilidades son de DocumentDataProvider.
 *
 * API pública:
 *   DocumentLoadModal.open()   → abre el modal (idempotente)
 *   DocumentLoadModal.close()  → cierra el modal (idempotente)
 */
(function initDocumentLoadModal(global) {

  const _DOC_TYPES = ['factura', 'remision', 'nota_credito', 'retencion', 'liquidacion'];

  const _DOC_LABELS = {
    factura:      'Factura',
    remision:     'Guía de Remisión',
    nota_credito: 'Nota de Crédito',
    retencion:    'Retención',
    liquidacion:  'Liquidación de Compras',
  };

  let _modal      = null;
  let _statusEl   = null;
  let _dsSelEl    = null;
  let _recentEl   = null;

  const _LAST_DATASOURCE_KEY = 'rf.dlm.lastDatasource';

  // RF-DLM-RECENT-DOCS-1: an app-owned "last 10 documents" list, rendered
  // via a <datalist> bound to the Número input — not the browser's native
  // form-autofill history. Chrome's own autofill only remembered the last
  // couple of entries and ungoogled-chromium doesn't show any at all (it
  // ships with autofill/form-history disabled) — a <datalist> is a plain
  // HTML feature whose content is entirely ours, so both browsers show the
  // identical list regardless of their autofill settings.
  const _RECENT_DOCS_KEY = 'rf.dlm.recentDocs';
  const _MAX_RECENT_DOCS = 10;

  // ── DOM helpers ───────────────────────────────────────────────────────────

  function _el(tag, props) {
    const node = global.document.createElement(tag);
    if (!props) return node;
    if (props.id)        node.id          = props.id;
    if (props.className) node.className   = props.className;
    if (props.text)      node.textContent = props.text;
    if (props.style)     node.style.cssText = props.style;
    if (props.role)      node.setAttribute('role', props.role);
    if (props.type)      node.setAttribute('type', props.type);
    if (props.value)     node.value = props.value;
    if (props.min)       node.setAttribute('min', props.min);
    if (props.for)       node.setAttribute('for', props.for);
    return node;
  }

  function _option(value, label, selected) {
    const o = global.document.createElement('option');
    o.value = value;
    o.textContent = label;
    if (selected) o.setAttribute('selected', '');
    return o;
  }

  // ── Modal builder ─────────────────────────────────────────────────────────

  function _buildModal() {
    /* Backdrop */
    const backdrop = _el('div', {
      id:    'doc-load-modal',
      role:  'dialog',
      style: [
        'position:fixed;inset:0;',
        'display:flex;align-items:center;justify-content:center;',
        'background:rgba(0,0,0,0.35);',
        'z-index:9999;',
        'font-family:Tahoma,"Microsoft Sans Serif",Arial,sans-serif;',
        'font-size:11px;',
      ].join(''),
    });
    backdrop.setAttribute('aria-modal', 'true');
    backdrop.setAttribute('aria-label', 'Cargar documento desde SAP');

    /* Dialog box — XP Windows chrome */
    const dialog = _el('div', {
      style: [
        'background:#ECE9D8;',
        'border:2px solid #0A246A;',
        'box-shadow:3px 3px 8px rgba(0,0,0,0.5);',
        'min-width:300px;max-width:380px;width:340px;',
      ].join(''),
    });

    /* Title bar */
    const titlebar = _el('div', {
      style: [
        'background:linear-gradient(to bottom,#0A246A,#3A6EA5);',
        'color:#fff;',
        'display:flex;align-items:center;justify-content:space-between;',
        'padding:3px 6px;',
        'user-select:none;',
      ].join(''),
    });
    const titleText = _el('span', { text: 'Cargar documento', style: 'font-weight:bold;font-size:11px;' });
    const closeBtn  = _el('button', {
      id:    'dlm-close',
      text:  '×',
      style: [
        'background:linear-gradient(to bottom,#ECE9D8,#D4D0C8);',
        'border:1px outset #AAAAAA;border-radius:2px;',
        'color:#000;font-weight:bold;font-size:12px;',
        'width:18px;height:18px;cursor:pointer;',
        'display:flex;align-items:center;justify-content:center;',
        'padding:0;',
      ].join(''),
    });
    titlebar.appendChild(titleText);
    titlebar.appendChild(closeBtn);

    /* Body */
    const body = _el('div', { style: 'padding:12px 14px 8px;display:flex;flex-direction:column;gap:8px;' });

    /* Type row */
    const rowType = _el('div', { style: 'display:flex;align-items:center;gap:8px;' });
    const lblType = _el('label', { for: 'dlm-type', text: 'Tipo:', style: 'min-width:60px;' });
    const selType = _el('select', {
      id:    'dlm-type',
      style: 'flex:1;border:1px inset #808080;background:white;padding:1px 2px;font-family:inherit;font-size:11px;',
    });
    _DOC_TYPES.forEach((k, i) => selType.appendChild(_option(k, _DOC_LABELS[k], i === 0)));
    rowType.appendChild(lblType);
    rowType.appendChild(selType);

    /* Number row */
    const rowNum = _el('div', { style: 'display:flex;align-items:center;gap:8px;' });
    const lblNum = _el('label', { for: 'dlm-num', text: 'Número:', style: 'min-width:60px;' });
    const inpNum = _el('input', {
      id:    'dlm-num',
      type:  'text',
      style: 'flex:1;border:1px inset #808080;background:white;padding:1px 4px;font-family:inherit;font-size:11px;',
    });
    inpNum.setAttribute('inputmode', 'numeric');
    inpNum.setAttribute('placeholder', 'DocNum (ej: 12345)');
    inpNum.setAttribute('list', 'dlm-recent-nums');
    const recentList = _el('datalist', { id: 'dlm-recent-nums' });
    rowNum.appendChild(lblNum);
    rowNum.appendChild(inpNum);
    rowNum.appendChild(recentList);

    /* Datasource row */
    const rowDs = _el('div', { style: 'display:flex;align-items:center;gap:8px;' });
    const lblDs = _el('label', { for: 'dlm-datasource', text: 'Conexión:', style: 'min-width:60px;' });
    const selDs = _el('select', {
      id:    'dlm-datasource',
      style: 'flex:1;border:1px inset #808080;background:white;padding:1px 2px;font-family:inherit;font-size:11px;',
    });
    selDs.appendChild(_option('default', 'default', true));
    rowDs.appendChild(lblDs);
    rowDs.appendChild(selDs);

    body.appendChild(rowType);
    body.appendChild(rowNum);
    body.appendChild(rowDs);

    /* Status row */
    const statusEl = _el('div', {
      id:    'dlm-status',
      style: 'min-height:16px;font-size:10px;color:#CC0000;word-break:break-word;user-select:text;-webkit-user-select:text;cursor:text;',
    });
    statusEl.setAttribute('data-status-type', 'idle');
    body.appendChild(statusEl);

    /* Footer */
    const footer = _el('div', {
      style: [
        'padding:6px 14px 10px;',
        'display:flex;justify-content:flex-end;gap:6px;',
        'border-top:1px solid #ACA899;',
      ].join(''),
    });
    const loadBtn = _el('button', {
      id:   'dlm-load',
      text: 'Cargar',
      style: [
        'background:linear-gradient(to bottom,#ECE9D8,#D4D0C8);',
        'border:1px outset #AAAAAA;border-radius:2px;',
        'padding:3px 16px;cursor:pointer;font-family:inherit;font-size:11px;',
      ].join(''),
    });
    const cancelBtn = _el('button', {
      id:   'dlm-cancel',
      text: 'Cancelar',
      style: [
        'background:linear-gradient(to bottom,#ECE9D8,#D4D0C8);',
        'border:1px outset #AAAAAA;border-radius:2px;',
        'padding:3px 10px;cursor:pointer;font-family:inherit;font-size:11px;',
      ].join(''),
    });
    footer.appendChild(loadBtn);
    footer.appendChild(cancelBtn);

    /* Assemble */
    dialog.appendChild(titlebar);
    dialog.appendChild(body);
    dialog.appendChild(footer);
    backdrop.appendChild(dialog);

    _statusEl = statusEl;
    _dsSelEl  = selDs;
    _recentEl = recentList;
    return backdrop;
  }

  // ── Datasource loader (non-critical: fails silently) ─────────────────────

  async function _fetchDatasources(selEl) {
    if (!selEl) return;
    if (typeof global.fetch !== 'function') { _restoreLastDatasource(selEl); return; }
    try {
      const res = await global.fetch('/datasources');
      const items = await res.json();
      if (Array.isArray(items)) {
        items.forEach(ds => {
          if (ds.alias && ds.alias !== 'default') selEl.appendChild(_option(ds.alias, ds.alias));
        });
      }
    } catch (_) { /* non-critical — default stays selected */ }
    _restoreLastDatasource(selEl);
  }

  // ── Last-used connection (localStorage, non-critical: fails silently) ────

  function _restoreLastDatasource(selEl) {
    if (!selEl) return;
    let last;
    try { last = global.localStorage && global.localStorage.getItem(_LAST_DATASOURCE_KEY); } catch (_) { last = null; }
    if (!last) return;
    const hasOption = Array.prototype.some.call(selEl.options, o => o.value === last);
    if (hasOption) selEl.value = last;
  }

  function _rememberDatasource(value) {
    try { global.localStorage && global.localStorage.setItem(_LAST_DATASOURCE_KEY, value); } catch (_) { /* ignore */ }
  }

  // ── Recent documents (localStorage, non-critical: fails silently) ────────

  function _loadRecentDocs() {
    try {
      const raw = global.localStorage && global.localStorage.getItem(_RECENT_DOCS_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) { return []; }
  }

  function _rememberRecentDoc(type, num) {
    try {
      const list = _loadRecentDocs().filter(d => !(d.type === type && d.num === num));
      list.unshift({ type, num });
      global.localStorage && global.localStorage.setItem(_RECENT_DOCS_KEY, JSON.stringify(list.slice(0, _MAX_RECENT_DOCS)));
    } catch (_) { /* ignore */ }
  }

  function _refreshRecentDocsDatalist(type) {
    if (!_recentEl) return;
    _recentEl.innerHTML = '';
    _loadRecentDocs()
      .filter(d => d.type === type)
      .forEach(d => _recentEl.appendChild(_option(String(d.num), String(d.num))));
  }

  // ── Status renderer ───────────────────────────────────────────────────────

  function _setStatus(state) {
    if (!_statusEl) return;
    _statusEl.setAttribute('data-status-type', state.type);
    if (state.type === 'idle') {
      _statusEl.textContent = '';
      _statusEl.style.color = '#CC0000';
    } else if (state.type === 'loading') {
      _statusEl.textContent = 'Cargando…';
      _statusEl.style.color = '#004080';
    } else if (state.type === 'success') {
      _statusEl.textContent = '✓ Documento ' + state.docType + ' #' + state.docNumber + ' cargado correctamente';
      _statusEl.style.color = '#006600';
    } else if (state.type === 'error') {
      _statusEl.textContent = state.code + ': ' + state.message;
      _statusEl.style.color = '#CC0000';
    }
  }

  // ── Load handler ──────────────────────────────────────────────────────────

  async function _handleLoad() {
    if (!_modal) return;

    const typeEl = _modal.querySelector('#dlm-type');
    const numEl  = _modal.querySelector('#dlm-num');
    const type   = typeEl ? typeEl.value : '';
    const numStr = numEl  ? String(numEl.value).trim() : '';
    const num    = parseInt(numStr, 10);

    if (!_DOC_TYPES.includes(type)) {
      _setStatus({ type: 'error', code: 'INVALID_DOC_TYPE', message: 'Tipo de documento no reconocido: ' + type });
      return;
    }
    if (!numStr || !Number.isFinite(num) || num <= 0) {
      _setStatus({ type: 'error', code: 'INVALID_DOC_NUMBER', message: 'El número debe ser un entero positivo' });
      return;
    }

    _setStatus({ type: 'loading' });

    const provider = global.DocumentDataProvider;
    if (!provider || typeof provider.load !== 'function') {
      _setStatus({ type: 'error', code: 'PROVIDER_MISSING', message: 'DocumentDataProvider no disponible' });
      return;
    }

    const dsAlias = (_modal && _modal.querySelector('#dlm-datasource'))?.value || 'default';
    _rememberDatasource(dsAlias);
    const result = await provider.load(type, num, { datasource: dsAlias });

    if (result.ok) {
      _setStatus({ type: 'success', docType: type, docNumber: num });
      _rememberRecentDoc(type, num);
      _refreshRecentDocsDatalist(type);
    } else {
      _setStatus({ type: 'error', code: result.error.code, message: result.error.message });
    }
  }

  // ── open / close ──────────────────────────────────────────────────────────

  function open() {
    if (_modal) return;
    _modal = _buildModal();

    const doc = global.document;
    doc.body.appendChild(_modal);

    const closeBtn  = _modal.querySelector('#dlm-close');
    const cancelBtn = _modal.querySelector('#dlm-cancel');
    const loadBtn   = _modal.querySelector('#dlm-load');
    const numInput  = _modal.querySelector('#dlm-num');
    const typeSel   = _modal.querySelector('#dlm-type');

    if (closeBtn)  closeBtn.addEventListener('click',  close);
    if (cancelBtn) cancelBtn.addEventListener('click', close);
    if (loadBtn)   loadBtn.addEventListener('click',   _handleLoad);
    if (typeSel)   typeSel.addEventListener('change',  () => _refreshRecentDocsDatalist(typeSel.value));
    if (typeSel)   _refreshRecentDocsDatalist(typeSel.value);

    // Enter anywhere in the dialog (except on a button, which already
    // handles its own Enter/click) triggers the same action as "Cargar".
    _modal.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      if (e.target && e.target.tagName === 'BUTTON') return;
      e.preventDefault();
      _handleLoad();
    });

    if (numInput && typeof numInput.focus === 'function') numInput.focus();

    _fetchDatasources(_dsSelEl);
  }

  function close() {
    if (!_modal) return;
    _modal.remove();
    _modal    = null;
    _statusEl = null;
    _dsSelEl  = null;
    _recentEl = null;
  }

  // ── Export ────────────────────────────────────────────────────────────────

  const DocumentLoadModal = { open, close };
  global.DocumentLoadModal = DocumentLoadModal;
  if (typeof module !== 'undefined') module.exports = DocumentLoadModal;

})(typeof window !== 'undefined' ? window : globalThis);
