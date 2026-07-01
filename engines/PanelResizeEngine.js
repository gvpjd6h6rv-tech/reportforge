'use strict';

/* PanelResizeEngine — vertical resize of #properties-panel via #props-title.
 *
 * Contract:
 *  - pointerdown on header starts tracking; no side-effect until DRAG_THRESHOLD px moved.
 *  - < 4 px movement → treat as click; collapse/expand handled by RuntimeBootstrap's
 *    existing 'click' listener; we suppress nothing.
 *  - ≥ 4 px movement → enter resize mode; suppress next 'click' via capture-phase listener
 *    so RuntimeBootstrap's collapse binding does not fire.
 *  - Drag up   → panel grows   (dy < 0 → height increases).
 *  - Drag down → panel shrinks (dy > 0 → height decreases).
 *  - Height clamped: MIN_H … max(MIN_H+1, 70 % of viewport height).
 *  - Persisted in localStorage under STORAGE_KEY.
 *  - Binding is idempotent: safe to call init() multiple times.
 */
const PanelResizeEngine = (function () {
  const STORAGE_KEY    = 'rf-properties-panel-height';
  const MIN_H          = 120;
  const DRAG_THRESHOLD = 4;

  let _panel  = null;
  let _header = null;
  let _body   = null;

  /* Drag state (null when not dragging) */
  let _drag = null;
  /* Set to true between pointerup and the subsequent click event */
  let _suppressNextClick = false;

  /* ── helpers ─────────────────────────────────────────────── */

  function _maxH() {
    return Math.max(MIN_H + 1, Math.floor(window.innerHeight * 0.70));
  }

  function _clamp(h) {
    return Math.max(MIN_H, Math.min(h, _maxH()));
  }

  function _applyHeight(h) {
    h = _clamp(h);
    _panel.style.blockSize = h + 'px';
    _panel.classList.add('sized');
  }

  function _persist(h) {
    try { localStorage.setItem(STORAGE_KEY, String(Math.round(h))); } catch (_) {}
  }

  function _restore() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const h = parseInt(raw, 10);
      if (!isNaN(h) && h >= MIN_H) _applyHeight(h);
    } catch (_) {}
  }

  /* ── pointer handlers ────────────────────────────────────── */

  function _onPointerDown(e) {
    /* Only primary button */
    if (e.button !== 0) return;
    _drag = {
      pointerId : e.pointerId,
      startY    : e.clientY,
      startH    : _panel.getBoundingClientRect().height,
      moved     : false,
    };
    _header.setPointerCapture(e.pointerId);
    /* Don't preventDefault — let click fire if we stay under threshold */
  }

  function _onPointerMove(e) {
    if (!_drag) return;
    const dy = e.clientY - _drag.startY;
    if (!_drag.moved && Math.abs(dy) < DRAG_THRESHOLD) return;

    if (!_drag.moved) {
      /* First real move — enter resize mode */
      _drag.moved = true;
      _panel.classList.add('resizing');
      document.body.classList.add('rf-resizing');
    }

    const newH = _clamp(_drag.startH - dy);
    _applyHeight(newH);
  }

  function _onPointerUp(e) {
    if (!_drag) return;

    const wasDrag = _drag.moved;
    _drag = null;

    _panel.classList.remove('resizing');
    document.body.classList.remove('rf-resizing');

    try { _header.releasePointerCapture(e.pointerId); } catch (_) {}

    if (wasDrag) {
      /* Suppress the click that will fire right after pointerup */
      _suppressNextClick = true;
      /* Persist the final height */
      _persist(_panel.getBoundingClientRect().height);
    }
  }

  function _onPointerCancel(e) {
    if (!_drag) return;
    _drag = null;
    _panel.classList.remove('resizing');
    document.body.classList.remove('rf-resizing');
    try { _header.releasePointerCapture(e.pointerId); } catch (_) {}
  }

  /* Capture-phase click interceptor — blocks collapse when drag happened */
  function _onClickCapture(e) {
    if (_suppressNextClick) {
      _suppressNextClick = false;
      e.stopImmediatePropagation();
      e.preventDefault();
    }
  }

  /* ── public ──────────────────────────────────────────────── */

  function init() {
    _panel  = document.getElementById('properties-panel');
    _header = document.getElementById('props-title');
    _body   = document.getElementById('props-body');
    if (!_panel || !_header) return;

    /* Idempotent guard */
    if (_header.dataset.pResizeInit) return;
    _header.dataset.pResizeInit = '1';

    _header.addEventListener('pointerdown',   _onPointerDown);
    _header.addEventListener('pointermove',   _onPointerMove);
    _header.addEventListener('pointerup',     _onPointerUp);
    _header.addEventListener('pointercancel', _onPointerCancel);
    /* Capture phase — runs before RuntimeBootstrap's bubble-phase 'click' */
    _header.addEventListener('click', _onClickCapture, true);

    _restore();
  }

  return { init };
})();
