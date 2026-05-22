'use strict';

import {
  clearDebugCenterTimeline,
  copyDebugCenterTimelineJSON,
  pauseDebugCenterTimeline,
  readDebugCenterState,
  resumeDebugCenterTimeline,
} from './rf-debug-center-store.js';
import { mountDebugCenter, renderDebugCenter } from './rf-debug-center-view.js';

const OWNERSHIP_MAP = Object.freeze({
  tool: 'RF Debug Center', version: 1, subsystemsVersion: 1,
  ssot: { uiTrace: 'engines/RFAudit.js', bootstrap: 'tools/rf-debug-center/rf-debug-center.js', store: 'tools/rf-debug-center/rf-debug-center-store.js', view: 'tools/rf-debug-center/rf-debug-center-view.js', style: 'tools/rf-debug-center/rf-debug-center.css' },
  subsystems: [
    { name: 'ui-trace', source: 'RF_UI_TRACE', owner: 'runtime-observability', onlyWriter: 'RF_UI_TRACE runtime producer', readers: ['tools/rf-debug-center/rf-debug-center-store.js', 'tools/rf-debug-center/rf-debug-center-view.js'], forbiddenWriters: ['tools/rf-debug-center/rf-debug-center.js', 'tools/rf-debug-center/rf-debug-center-view.js'], publicAPI: ['getEntries', 'snapshot', 'clear'], invariants: ['read-only', 'no mutation from debug center', 'trace source preserved'] },
    { name: 'state-store', source: 'rf-debug-center-store.js', owner: 'debug-center', onlyWriter: 'tools/rf-debug-center/rf-debug-center-store.js', readers: ['tools/rf-debug-center/rf-debug-center.js', 'tools/rf-debug-center/rf-debug-center-view.js', 'tools/rf-debug-center/rf-debug-center-zoom.js', 'tools/rf-debug-center/diagnostics/*'], forbiddenWriters: ['tools/rf-debug-center/rf-debug-center-view.js', 'tools/rf-debug-center/rf-debug-center.js'], publicAPI: ['readDebugCenterState', 'formatValue'], invariants: ['single-writer', 'snapshot-based', 'no direct UI mutation'] },
    { name: 'zoom', source: 'rf-debug-center-zoom.js', owner: 'debug-center', onlyWriter: 'tools/rf-debug-center/rf-debug-center-store.js', readers: ['tools/rf-debug-center/rf-debug-center-store.js', 'tools/rf-debug-center/rf-debug-center-view.js', 'reportforge/tests/rf_debug_center_zoom.test.mjs'], forbiddenWriters: ['tools/rf-debug-center/rf-debug-center-view.js', 'tools/rf-debug-center/rf-debug-center.js'], publicAPI: ['buildZoomDiagnostics'], invariants: ['read-only', 'state-derived', 'no mutation of RF_UI_TRACE', 'no direct DOM writes'] },
    { name: 'timeline', source: 'rf-debug-center-store.js/timeline', owner: 'debug-center', onlyWriter: 'tools/rf-debug-center/rf-debug-center-store.js', readers: ['tools/rf-debug-center/rf-debug-center.js', 'tools/rf-debug-center/rf-debug-center-view.js'], forbiddenWriters: ['tools/rf-debug-center/rf-debug-center-view.js', 'tools/rf-debug-center/rf-debug-center.js', 'RF_UI_TRACE runtime producer'], publicAPI: ['pauseDebugCenterTimeline', 'resumeDebugCenterTimeline', 'clearDebugCenterTimeline', 'copyDebugCenterTimelineJSON', 'getDebugCenterTimelineSnapshot'], invariants: ['read-only source', 'internal buffer only', 'no mutation of RF_UI_TRACE'] },
    { name: 'view', source: 'rf-debug-center-view.js', owner: 'debug-center', onlyWriter: 'n/a', readers: ['tools/rf-debug-center/rf-debug-center.js'], forbiddenWriters: ['tools/rf-debug-center/rf-debug-center-store.js'], publicAPI: ['mountDebugCenter', 'renderDebugCenter'], invariants: ['view-only', 'shadow-dom isolated', 'no state mutation'] },
    { name: 'style', source: 'rf-debug-center.css', owner: 'debug-center', onlyWriter: 'n/a', readers: ['tools/rf-debug-center/rf-debug-center-view.js'], forbiddenWriters: ['global stylesheet', 'designer shell styles'], publicAPI: ['rf-debug-center namespace'], invariants: ['isolated-css', 'no global selectors', 'shadow-root safe'] },
  ],
});

function readActivationFlag() {
  const search = new URLSearchParams(window.location.search || '');
  if (search.has('rfDebugCenter') || search.get('rfDebugCenter') === '1') return 'query:rfDebugCenter';
  if (window.RF_DEBUG_TRACE === true) return 'flag:RF_DEBUG_TRACE';
  try {
    if (window.localStorage.getItem('RF_DEBUG_CENTER') === '1') return 'localStorage:RF_DEBUG_CENTER';
  } catch (_) {}
  return null;
}

function createApi() {
  const state = {
    enabled: false,
    activation: 'disabled',
    host: null,
    shadow: null,
    timer: null,
    lastModel: null,
    ownership: null,
    actions: null,
  };

  function applyModel() {
    state.lastModel = readDebugCenterState({
      enabled: state.enabled,
      activation: state.activation,
    });
    state.lastModel.ownership = state.ownership;
    if (state.shadow) renderDebugCenter(state.shadow, state.lastModel, state.actions || {});
    return state.lastModel;
  }

  async function loadOwnershipMap() {
    return OWNERSHIP_MAP;
  }

  function ensureHost() {
    if (state.host) return state.host;
    const host = document.createElement('div');
    host.id = 'rf-debug-center-root';
    document.body.appendChild(host);
    state.host = host;
    state.shadow = mountDebugCenter(host);
    const head = state.shadow.getElementById('rf-debug-center-head');
    if (head && typeof window.makePanelDraggable === 'function') {
      window.makePanelDraggable(host, head, 'RF_DEBUG_CENTER_POS', {
        left: Math.max(12, window.innerWidth - 460),
        top: Math.max(12, window.innerHeight - 320),
      });
    }
    host.classList.add('is-on');
    return host;
  }

  function start() {
    if (state.enabled) return true;
    const activation = readActivationFlag();
    if (!activation) return false;
    state.enabled = true;
    state.activation = activation;
    ensureHost();
    if (!state.timer) {
      state.timer = window.setInterval(() => {
        if (!state.enabled) return;
        applyModel();
      }, 150);
    }
    applyModel();
    return true;
  }

  function pauseTimeline() {
    pauseDebugCenterTimeline();
    return applyModel();
  }

  function resumeTimeline() {
    resumeDebugCenterTimeline();
    return applyModel();
  }

  function clearTimeline() {
    clearDebugCenterTimeline();
    return applyModel();
  }

  function copyTimelineJSON() {
    return copyDebugCenterTimelineJSON();
  }

  function stop() {
    state.enabled = false;
    if (state.timer) {
      window.clearInterval(state.timer);
      state.timer = null;
    }
    if (state.host) {
      state.host.classList.remove('is-on');
      state.host.remove();
      state.host = null;
      state.shadow = null;
    }
    return true;
  }

  function toggle(force) {
    if (typeof force === 'boolean') return force ? start() : stop();
    return state.enabled ? stop() : start();
  }

  async function refresh() {
    if (!state.enabled) return applyModel();
    if (!state.ownership) state.ownership = await loadOwnershipMap();
    return applyModel();
  }

  function getState() {
    if (!state.lastModel) applyModel();
    return state.lastModel;
  }

  const api = {
    get enabled() { return state.enabled; },
    get activation() { return state.activation; },
    get state() { return getState(); },
    start,
    stop,
    toggle,
    refresh,
    refreshTimeline: refresh,
    getState,
    pauseTimeline,
    resumeTimeline,
    clearTimeline,
    copyTimelineJSON,
  };

  Object.defineProperty(api, 'ownership', {
    enumerable: true,
    get() {
      return state.ownership;
    },
  });

  state.actions = {
    refreshTimeline: refresh,
    refresh,
    pauseTimeline,
    resumeTimeline,
    clearTimeline,
    copyTimelineJSON,
  };

  return { state, api };
}

const center = createApi();
window.RFDebugCenter = center.api;

async function boot() {
  if (!document.body) {
    window.addEventListener('DOMContentLoaded', boot, { once: true });
    return;
  }
  if (!center.api.start()) return;
  center.api.refresh();
}

boot();
