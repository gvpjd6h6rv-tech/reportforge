'use strict';

/* DiagnosticsGestureLoader — permanent, minimal gesture to toggle the
 * rf-bbox-ink diagnostic without the user needing to remember a command.
 *
 * Contract:
 *  - Always loaded (unlike the diagnostic itself, which is NEVER in the
 *    default HTML — see tools/diagnostics/rf-bbox-ink/README.md).
 *  - Triple click (native 'click' event, e.detail === 3) on the visible
 *    "Parámetros" header toggles the diagnostic on/off.
 *  - Does not touch layout, selection, RF engines, or #10.15. Read-only
 *    gesture + dynamic <script> injection, nothing else.
 *  - Idempotent: attaching twice, activating twice, or missing the
 *    "Parámetros" node must never throw or duplicate the diagnostic script.
 */
(function initDiagnosticsGestureLoader(global) {
  if (typeof document === 'undefined') return;

  const STORAGE_KEY = 'rf_bbox_ink_enabled';
  const SCRIPT_ID = 'rf-bbox-ink-diagnostic-script';
  const SCRIPT_SRC = '/diagnostics/rf-bbox-ink/RfBboxInkDiagnostic.js';
  const UI_ID = 'rf-bbox-ui';
  const LAYER_ID = 'rf-bbox-ink-layer';
  const TOAST_ID = 'rf-diag-toast';
  const ZOOM_VALUE = '40';

  function _findParamsHeader() {
    try {
      const tab = document.getElementById('ptab-params');
      if (tab) return tab;
      const title = document.querySelector('.panel-title');
      if (title && /Par[aá]metros/i.test(title.textContent || '')) return title;
    } catch (_) { /* no DOM available — fail silent */ }
    return null;
  }

  function _isEnabled() {
    try { return global.localStorage.getItem(STORAGE_KEY) === '1'; } catch (_) { return false; }
  }

  function _setEnabled(v) {
    try {
      if (v) global.localStorage.setItem(STORAGE_KEY, '1');
      else global.localStorage.removeItem(STORAGE_KEY);
    } catch (_) { /* storage unavailable — state just won't persist */ }
  }

  function _updateUrl(add) {
    try {
      const u = new global.URL(global.location.href);
      if (add) {
        u.searchParams.set('rf_bbox_ink', '1');
        u.searchParams.set('rf_bbox_zoom', ZOOM_VALUE);
      } else {
        u.searchParams.delete('rf_bbox_ink');
        u.searchParams.delete('rf_bbox_zoom');
      }
      if (global.history && typeof global.history.replaceState === 'function') {
        global.history.replaceState(null, '', u.pathname + u.search + u.hash);
      }
    } catch (_) { /* no History/URL API — URL just won't reflect state */ }
  }

  function _toast(msg) {
    try {
      const prev = document.getElementById(TOAST_ID);
      if (prev) prev.remove();
      const t = document.createElement('div');
      t.id = TOAST_ID;
      t.textContent = msg;
      t.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);'
        + 'background:#1e1e1e;color:#ddd;padding:8px 14px;border-radius:6px;'
        + 'font:12px/1.2 sans-serif;z-index:2147483647;box-shadow:0 4px 16px rgba(0,0,0,.5);'
        + 'opacity:0;transition:opacity .15s ease;pointer-events:none';
      document.body.appendChild(t);
      global.requestAnimationFrame(() => { t.style.opacity = '1'; });
      global.setTimeout(() => {
        t.style.opacity = '0';
        global.setTimeout(() => t.remove(), 200);
      }, 1800);
    } catch (_) { /* toast is cosmetic — never block the toggle on it */ }
  }

  function _loadDiagnosticScript() {
    if (document.getElementById(SCRIPT_ID)) return false; // already loaded — idempotent
    const s = document.createElement('script');
    s.id = SCRIPT_ID;
    s.src = SCRIPT_SRC;
    document.head.appendChild(s);
    return true;
  }

  function _teardownDiagnosticDom() {
    try {
      const ui = document.getElementById(UI_ID);
      if (ui) ui.remove();
      const layer = document.getElementById(LAYER_ID);
      if (layer) layer.remove();
    } catch (_) { /* noop */ }
  }

  function _activate() {
    _setEnabled(true);
    _updateUrl(true);
    try { global.RF_BBOX_INK = true; global.RF_BBOX_ZOOM = Number(ZOOM_VALUE); } catch (_) { /* noop */ }
    _loadDiagnosticScript();
    _toast('🧪 Diagnóstico BBOX activado');
  }

  function _deactivate() {
    const wasLoaded = !!document.getElementById(SCRIPT_ID);
    _setEnabled(false);
    _teardownDiagnosticDom();
    _updateUrl(false);
    try { global.RF_BBOX_INK = false; } catch (_) { /* noop */ }
    _toast('🧹 Diagnóstico BBOX desactivado');
    // RfBboxInkDiagnostic.js attaches document-level listeners/timers it never
    // exposes a teardown for — a reload is the only guaranteed clean stop.
    if (wasLoaded) {
      global.setTimeout(() => { try { global.location.reload(); } catch (_) { /* noop */ } }, 50);
    }
  }

  function _toggle() {
    if (_isEnabled()) _deactivate();
    else _activate();
  }

  function _attach() {
    const header = _findParamsHeader();
    if (!header) return false;
    header.addEventListener('click', (e) => {
      if (e && e.detail === 3) _toggle();
    });
    return true;
  }

  function _init() {
    if (!_attach()) return; // "Parámetros" not found — fail silent, never throw
    if (_isEnabled()) _loadDiagnosticScript();
  }

  global.DiagnosticsGestureLoader = {
    STORAGE_KEY,
    SCRIPT_ID,
    SCRIPT_SRC,
    isEnabled: _isEnabled,
    findHeader: _findParamsHeader,
    attach: _attach,
    toggle: _toggle,
    activate: _activate,
    deactivate: _deactivate,
    init: _init,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else {
    _init();
  }
})(typeof window !== 'undefined' ? window : globalThis);
