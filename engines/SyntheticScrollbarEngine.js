/**
 * SyntheticScrollbarEngine — ReportForge
 * RF-CR-SCROLLBAR-PARITY-1: real X11 captures showed Chromium's native
 * ::-webkit-scrollbar styling renders #workspace's scrollbar at ~17px
 * (matches intent), but Firefox's `scrollbar-width` API only accepts
 * auto|thin|none — no numeric control — and rendered at ~1px on this
 * desktop, nowhere near CR's bold native scrollbar. A custom overlay
 * scrollbar, used identically in every browser, is the only way to get
 * pixel-equal thickness/color everywhere instead of depending on each
 * engine's own (inconsistent) native styling.
 */
'use strict';

window.SyntheticScrollbarEngine = (() => {
  const THICKNESS = 17;
  const MIN_THUMB = 24;
  let _ws = null, _trackV = null, _thumbV = null, _trackH = null, _thumbH = null;
  let _drag = null; // { axis, startClientPos, startScroll, trackLen, thumbLen, range }

  function _buildBar(axis) {
    const track = document.createElement('div');
    track.className = `rf-scrollbar-track rf-scrollbar-track--${axis}`;
    const thumb = document.createElement('div');
    thumb.className = `rf-scrollbar-thumb rf-scrollbar-thumb--${axis}`;
    track.appendChild(thumb);
    return { track, thumb };
  }

  function _trackLen(axis) {
    return axis === 'v' ? _trackV.clientHeight : _trackH.clientWidth;
  }

  // position:fixed tracks aren't affected by #workspace's own scrolling
  // (that's the point — they stay put while content moves), but that
  // also means their screen rect must be synced to #workspace's actual
  // on-screen box by hand whenever it can move (resize, panel toggle).
  function _syncRects(canScrollY, canScrollX) {
    const r = _ws.getBoundingClientRect();
    const hReserve = canScrollX ? THICKNESS : 0;
    const vReserve = canScrollY ? THICKNESS : 0;
    _trackV.style.top = `${r.top}px`;
    _trackV.style.left = `${r.right - THICKNESS}px`;
    _trackV.style.width = `${THICKNESS}px`;
    _trackV.style.height = `${r.height - hReserve}px`;
    _trackH.style.top = `${r.bottom - THICKNESS}px`;
    _trackH.style.left = `${r.left}px`;
    _trackH.style.width = `${r.width - vReserve}px`;
    _trackH.style.height = `${THICKNESS}px`;
  }

  function _update() {
    if (!_ws) return;
    const canScrollY = _ws.scrollHeight > _ws.clientHeight + 1;
    const canScrollX = _ws.scrollWidth > _ws.clientWidth + 1;
    _trackV.style.display = canScrollY ? 'block' : 'none';
    _trackH.style.display = canScrollX ? 'block' : 'none';
    _syncRects(canScrollY, canScrollX);

    if (canScrollY) {
      const trackLen = _trackLen('v');
      const thumbLen = Math.max(MIN_THUMB, Math.round((trackLen * _ws.clientHeight) / _ws.scrollHeight));
      const maxOffset = trackLen - thumbLen;
      const scrollRange = _ws.scrollHeight - _ws.clientHeight;
      const offset = scrollRange > 0 ? Math.round((maxOffset * _ws.scrollTop) / scrollRange) : 0;
      _thumbV.style.height = `${thumbLen}px`;
      _thumbV.style.transform = `translateY(${offset}px)`;
    }
    if (canScrollX) {
      const trackLen = _trackLen('h');
      const thumbLen = Math.max(MIN_THUMB, Math.round((trackLen * _ws.clientWidth) / _ws.scrollWidth));
      const maxOffset = trackLen - thumbLen;
      const scrollRange = _ws.scrollWidth - _ws.clientWidth;
      const offset = scrollRange > 0 ? Math.round((maxOffset * _ws.scrollLeft) / scrollRange) : 0;
      _thumbH.style.width = `${thumbLen}px`;
      _thumbH.style.transform = `translateX(${offset}px)`;
    }
  }

  function _beginDrag(axis, clientPos, thumbEl, trackEl) {
    const trackLen = _trackLen(axis);
    const thumbLen = axis === 'v' ? thumbEl.offsetHeight : thumbEl.offsetWidth;
    const scrollRange = axis === 'v' ? (_ws.scrollHeight - _ws.clientHeight) : (_ws.scrollWidth - _ws.clientWidth);
    _drag = {
      axis, startClientPos: clientPos,
      startScroll: axis === 'v' ? _ws.scrollTop : _ws.scrollLeft,
      maxOffset: trackLen - thumbLen, scrollRange,
    };
  }

  function _onThumbPointerDown(axis, thumbEl, trackEl) {
    return (e) => {
      e.preventDefault();
      e.stopPropagation();
      _beginDrag(axis, axis === 'v' ? e.clientY : e.clientX, thumbEl, trackEl);
      thumbEl.classList.add('rf-scrollbar-thumb--active');
      window.addEventListener('pointermove', _onPointerMove);
      window.addEventListener('pointerup', _onPointerUp, { once: true });
    };
  }

  function _onPointerMove(e) {
    if (!_drag) return;
    const pos = _drag.axis === 'v' ? e.clientY : e.clientX;
    const delta = pos - _drag.startClientPos;
    const scrollDelta = _drag.maxOffset > 0 ? (delta * _drag.scrollRange) / _drag.maxOffset : 0;
    const next = Math.max(0, Math.min(_drag.scrollRange, _drag.startScroll + scrollDelta));
    if (_drag.axis === 'v') _ws.scrollTop = next;
    else _ws.scrollLeft = next;
  }

  function _onPointerUp() {
    if (_drag) {
      const thumbEl = _drag.axis === 'v' ? _thumbV : _thumbH;
      thumbEl.classList.remove('rf-scrollbar-thumb--active');
    }
    _drag = null;
    window.removeEventListener('pointermove', _onPointerMove);
  }

  // Click on the track itself (not the thumb) — page-scroll toward the click, like a native scrollbar.
  function _onTrackPointerDown(axis, trackEl, thumbEl) {
    return (e) => {
      if (e.target === thumbEl) return;
      const rect = trackEl.getBoundingClientRect();
      const clickPos = axis === 'v' ? (e.clientY - rect.top) : (e.clientX - rect.left);
      const thumbStart = axis === 'v' ? thumbEl.offsetTop || 0 : thumbEl.offsetLeft || 0;
      const page = axis === 'v' ? _ws.clientHeight : _ws.clientWidth;
      const dir = clickPos < thumbStart ? -1 : 1;
      if (axis === 'v') _ws.scrollTop += dir * page;
      else _ws.scrollLeft += dir * page;
    };
  }

  return {
    init() {
      _ws = document.getElementById('workspace');
      if (!_ws) return;
      _ws.classList.add('rf-synthetic-scrollbars');

      const v = _buildBar('v'); _trackV = v.track; _thumbV = v.thumb;
      const h = _buildBar('h'); _trackH = h.track; _thumbH = h.thumb;
      _ws.appendChild(_trackV);
      _ws.appendChild(_trackH);

      _thumbV.addEventListener('pointerdown', _onThumbPointerDown('v', _thumbV, _trackV));
      _thumbH.addEventListener('pointerdown', _onThumbPointerDown('h', _thumbH, _trackH));
      _trackV.addEventListener('pointerdown', _onTrackPointerDown('v', _trackV, _thumbV));
      _trackH.addEventListener('pointerdown', _onTrackPointerDown('h', _trackH, _thumbH));

      _ws.addEventListener('scroll', _update);
      _ws.addEventListener('rf:zoom-changed', _update);
      _ws.addEventListener('rf:scroll-geometry', _update);
      window.addEventListener('resize', _update);
      if (typeof ResizeObserver !== 'undefined') {
        const ro = new ResizeObserver(_update);
        ro.observe(_ws);
        ['canvas-layer', 'preview-content'].forEach((id) => {
          const el = document.getElementById(id);
          if (el) ro.observe(el);
        });
      }
      _update();
    },
    update() { _update(); },
    THICKNESS,
  };
})();

if (typeof module !== 'undefined') module.exports = window.SyntheticScrollbarEngine;
