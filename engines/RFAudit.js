'use strict';

(function initRFAudit(global) {
  global.RF = global.RF || {};
  const root = global.RF;
  if (root.RFAudit) return;

  const LOG_LIMIT = 500;
  const state = { entries: [] };

  function _clone(value) {
    if (value == null) return value;
    if (Array.isArray(value)) return value.map(_clone);
    if (value instanceof Set) return [...value];
    if (typeof value === 'object') {
      try {
        return JSON.parse(JSON.stringify(value));
      } catch (_) {
        return value;
      }
    }
    return value;
  }

  function _push(entry) {
    state.entries.push(entry);
    if (state.entries.length > LOG_LIMIT) state.entries.shift();
    return entry;
  }

  function _postBackend(entry) {
    if (typeof fetch !== 'function') return;
    if (typeof location === 'undefined' || !location.origin) return;
    try {
      fetch('/rf-audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
        keepalive: true,
      }).catch(() => {});
    } catch (_) {}
  }

  function _styleSummary(node) {
    if (!node || typeof global.getComputedStyle !== 'function') return null;
    const style = global.getComputedStyle(node);
    return {
      display: style.display,
      visibility: style.visibility,
      opacity: style.opacity,
      zIndex: style.zIndex,
      pointerEvents: style.pointerEvents,
    };
  }

  function _rectSummary(node) {
    if (!node || typeof node.getBoundingClientRect !== 'function') return null;
    const rect = node.getBoundingClientRect();
    return {
      x: rect.x,
      y: rect.y,
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      right: rect.right,
      bottom: rect.bottom,
    };
  }

  function _elementSummary(node) {
    if (!node) return null;
    return {
      tag: node.tagName || null,
      id: node.id || null,
      className: typeof node.className === 'string' ? node.className : null,
      datasetId: node.dataset?.id || null,
      datasetOriginId: node.dataset?.originId || null,
      datasetPos: node.dataset?.pos || null,
    };
  }

  function _focusElement(focus) {
    if (!focus) return null;
    if (typeof focus === 'string') return document.querySelector(focus);
    if (focus instanceof Element) return focus;
    return null;
  }

  function snapshotUI({ focus = null } = {}) {
    const slider = document.getElementById('zw-slider');
    const pct = document.getElementById('zw-pct');
    const target = _focusElement(focus);
    const rect = _rectSummary(target || slider || pct);
    let visibleElement = null;
    if (rect) {
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      visibleElement = _elementSummary(document.elementFromPoint(cx, cy));
    }
    return {
      dsZoom: typeof DS !== 'undefined' ? DS.zoom : null,
      sliderValue: slider ? slider.value : null,
      pctText: pct ? pct.textContent : null,
      sliderRect: _rectSummary(slider),
      sliderStyle: _styleSummary(slider),
      pctStyle: _styleSummary(pct),
      focusRect: rect,
      focusStyle: _styleSummary(target),
      visibleElement,
    };
  }

  function emit(entry = {}) {
    const normalized = {
      timestamp: new Date().toISOString(),
      channel: 'audit',
      ..._clone(entry),
    };
    _push(normalized);
    if (typeof console !== 'undefined' && typeof console.info === 'function') {
      console.info('[RF_AUDIT]', normalized);
    }
    _postBackend(normalized);
    return normalized;
  }

  function trace(channel, event, payload) {
    const normalized = {
      timestamp: new Date().toISOString(),
      channel: String(channel || 'runtime'),
      event: String(event || 'trace'),
      payload: _clone(payload) ?? null,
    };
    _push({ kind: 'trace', ...normalized });
    if (typeof console !== 'undefined' && typeof console.info === 'function') {
      console.info(`[RF_TRACE:${normalized.channel}]`, normalized.event, normalized.payload);
    }
    if (typeof global.rfTrace === 'function') {
      global.rfTrace(normalized.channel, normalized.event, normalized.payload);
    }
    return normalized;
  }

  function uiTrace(event, detail = {}) {
    const normalized = {
      timestamp: new Date().toISOString(),
      channel: 'ui',
      event: String(event || 'ui'),
      ..._clone(detail),
      dom: snapshotUI({ focus: detail.focus || null }),
    };
    _push({ kind: 'ui', ...normalized });
    if (typeof console !== 'undefined' && typeof console.info === 'function') {
      console.info('[RF_UI_TRACE]', normalized);
    }
    return normalized;
  }

  function getEntries() {
    return state.entries.slice();
  }

  function clear() {
    state.entries = [];
  }

  root.RFAudit = { emit, trace, uiTrace, snapshotUI, getEntries, clear };
  global.RF_AUDIT = emit;
  global.RF_TRACE = trace;
  global.RF_UI_TRACE = uiTrace;
  window.RF_AUDIT = emit;
  window.RF_TRACE = trace;
  window.RF_UI_TRACE = uiTrace;
  window.RF_UI_TRACE.snapshot = snapshotUI;
  window.RF_UI_TRACE.getEntries = getEntries;
  window.RF_UI_TRACE.clear = clear;
})(window);
