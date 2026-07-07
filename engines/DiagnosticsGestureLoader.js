'use strict';

/* DiagnosticsGestureLoader — permanent, minimal gesture to toggle the
 * rf-bbox-ink diagnostic without the user needing to remember a command.
 *
 * Contract:
 *  - Always loaded (unlike the diagnostic itself, which is NEVER in the
 *    default HTML — see tools/diagnostics/rf-bbox-ink/README.md).
 *  - Triple click on the visible "Parámetros" text toggles the diagnostic
 *    on/off. There are two legitimate visible "Parámetros" nodes in the
 *    shell — the left panel's title (#panel-left .panel-title) and the
 *    "Parámetros" tab (#ptab-params) — either must work, so the listener
 *    is delegated (capture phase, on document) and matches any of them,
 *    plus any descendant of either, plus #panel-left itself as a last
 *    resort if neither specific node exists. Click-counting is owned by
 *    this file (timestamp window), not the browser's native event.detail,
 *    which real human triple-clicks cannot be relied on to deliver.
 *  - Does not touch layout, selection, RF engines, or #10.15. Read-only
 *    gesture + dynamic <script> injection, nothing else.
 *  - Idempotent: attaching twice, activating twice, or missing every
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
  const CLICK_WINDOW_MS = 900;
  const PARAMS_TEXT_RE = /Par[aá]metros/i;

  // ---- zone matching -------------------------------------------------

  function _hasAnyParamsNode() {
    try {
      if (document.getElementById('ptab-params')) return true;
      const title = document.querySelector('.panel-title');
      if (title && PARAMS_TEXT_RE.test(title.textContent || '')) return true;
    } catch (_) { /* noop */ }
    return false;
  }

  // True if `target` is #ptab-params, is/descends a "Parámetros" .panel-title,
  // is a leaf node whose own text is exactly "Parámetros", or — only when
  // neither of those exists anywhere — descends #panel-left as a fallback.
  function _isParamsTarget(target) {
    try {
      if (!target || typeof target.closest !== 'function') return false;
      if (target.closest('#ptab-params')) return true;
      const title = target.closest('.panel-title');
      if (title && PARAMS_TEXT_RE.test(title.textContent || '')) return true;
      if ((target.textContent || '').trim() === 'Parámetros') return true;
      if (!_hasAnyParamsNode() && target.closest('#panel-left')) return true;
    } catch (_) { /* noop */ }
    return false;
  }

  // ---- state -----------------------------------------------------------

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
    s.onerror = () => {
      s.remove();
      _setEnabled(false);
      _updateUrl(false);
      try { global.RF_BBOX_INK = false; } catch (_) { /* noop */ }
      _toast('❌ No pude cargar diagnóstico BBOX');
    };
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

  // ---- own click counter (900ms window, not event.detail) --------------

  let _count = 0;
  let _lastAt = 0;

  function _registerClick(now) {
    _count = (now - _lastAt <= CLICK_WINDOW_MS) ? _count + 1 : 1;
    _lastAt = now;
    if (_count >= 3) {
      _count = 0;
      _toggle();
    }
  }

  function _onDocumentClick(e) {
    if (!_isParamsTarget(e.target)) return;
    _registerClick(Date.now());
  }

  function _attach() {
    document.addEventListener('click', _onDocumentClick, true); // capture phase
    if (!_hasAnyParamsNode()) {
      try { console.warn('RF_DIAG_GESTURE_TARGET_NOT_FOUND'); } catch (_) { /* noop */ }
      return false;
    }
    return true;
  }

  function _init() {
    _attach(); // always listens — "Parámetros" missing is logged, never thrown
    if (_isEnabled()) _loadDiagnosticScript();
  }

  global.DiagnosticsGestureLoader = {
    STORAGE_KEY,
    SCRIPT_ID,
    SCRIPT_SRC,
    CLICK_WINDOW_MS,
    isEnabled: _isEnabled,
    isParamsTarget: _isParamsTarget,
    hasAnyParamsNode: _hasAnyParamsNode,
    registerClick: _registerClick,
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
