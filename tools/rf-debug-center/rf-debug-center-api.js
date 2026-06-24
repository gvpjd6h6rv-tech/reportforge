'use strict';
import { clearDebugCenterTimeline, copyDebugCenterTimelineJSON, clearDebugCenterWarnings, copyDebugCenterWarningsJSON, clearDebugCenterLoopFreeze, copyDebugCenterLoopFreezeJSON, clearDebugCenterNetwork, copyDebugCenterNetworkJSON, refreshDebugCenterNetwork, pauseDebugCenterTimeline, readDebugCenterState, resumeDebugCenterTimeline, refreshDebugCenterLoopFreeze, refreshDebugCenterWarnings } from './rf-debug-center-store.js';
import { buildDebugBundle, copyDebugBundleJSON, createBundleFilename, exportDebugBundle } from './rf-debug-center-bundle.js';
import { clearAsyncRaceSnapshot, copyAsyncRaceJSON, refreshAsyncRaceSnapshot } from './rf-debug-center-async-race.js';
import { clearPerformanceSnapshot, copyPerformanceJSON as copyDebugCenterPerformanceJSON, installPerformanceObservers, uninstallPerformanceObservers } from './rf-debug-center-performance.js';
import { installNetworkObserver, uninstallNetworkObserver } from './rf-debug-center-network.js';
import { applySelectionApi } from './rf-debug-center-api-selection.js'; import { applyRenderPreviewApi } from './rf-debug-center-api-render-preview.js';
import { applyVisualEvidenceApi } from './rf-debug-center-api-visual-evidence.js'; import { applyDomScannerApi } from './rf-debug-center-api-dom-scanner.js'; import { applyCausalIntelligenceApi } from './rf-debug-center-api-causal-intelligence.js';
import { mountDebugCenter, renderDebugCenter } from './rf-debug-center-view.js';
import { createDetachedDebugCenterWindow } from './rf-debug-center-detached-window.js';
import { applyVisualDoctorApi, decorateVisualDoctorModel } from './rf-debug-center-api-visual-doctor.js';
import { OWNERSHIP_MAP } from './rf-debug-center-ownership-map.js';
function readActivationFlag() {
  const search = new URLSearchParams(window.location.search || '');
  if (search.has('rfDebugCenter') || search.get('rfDebugCenter') === '1') return 'query:rfDebugCenter';
  if (window.RF_DEBUG_TRACE === true) return 'flag:RF_DEBUG_TRACE';
  try { if (window.localStorage.getItem('RF_DEBUG_CENTER') === '1') return 'localStorage:RF_DEBUG_CENTER'; } catch (_) {}
  return null;
}

export function createDebugCenterApi() {
  const state = {
    enabled: false, activation: 'disabled', host: null, shadow: null, timer: null,
    lastModel: null, ownership: OWNERSHIP_MAP, bundle: { status: 'idle', message: 'idle', filename: null, updatedAt: null },
    bundlePreview: null, actions: null, draggable: null, detachedWindow: null,
  };
  function applyModel() {
    state.lastModel = readDebugCenterState({ enabled: state.enabled, activation: state.activation, bundle: state.bundle });
    state.lastModel.ownership = state.ownership;
    state.lastModel.bundle = state.bundle;
    state.lastModel.bundlePreview = state.bundlePreview;
    decorateVisualDoctorModel(state.lastModel, state);
    if (state.shadow) renderDebugCenter(state.shadow, state.lastModel, state.actions || {});
    return state.lastModel;
  }
  function currentModel() { return state.lastModel || applyModel(); }
  function ensureHost() {
    if (state.host) return state.host;
    const host = document.createElement('div');
    host.id = 'rf-debug-center-root';
    document.body.appendChild(host);
    state.host = host;
    state.shadow = mountDebugCenter(host);
    // The shadow root's CSS loads async via <link> — measuring `host`
    // before it parses gets the unstyled (~full body width) box instead
    // of ~420px, driving clampPosition's left to its floor (8). Gate
    // position/visibility setup on stylesheet readiness.
    const link = state.shadow.querySelector('link[rel="stylesheet"]');
    const finishMount = () => {
      const head = state.shadow.getElementById('rf-debug-center-head');
      if (head && typeof window.makePanelDraggable === 'function') {
        state.draggable = window.makePanelDraggable(host, head, 'RF_DEBUG_CENTER_POS', { left: Math.max(12, window.innerWidth - 460), top: 72 });
      }
      syncHostLayout();
      host.classList.add('is-on');
    };
    if (!link || link.sheet) finishMount();
    else link.addEventListener('load', finishMount, { once: true });
    return host;
  }
  function syncHostLayout() {
    if (!state.host) return null;
    const hud = typeof window.syncDebugHudStack === 'function' ? window.syncDebugHudStack() : null;
    const viewportHeight = Math.max(0, window.innerHeight || document.documentElement.clientHeight || 0);
    const reservedBottom = hud?.zoom?.top != null ? Math.max(188, Math.max(0, Math.floor(viewportHeight - hud.zoom.top))) : 188;
    const maxHeight = Math.max(0, viewportHeight - 72 - reservedBottom - 16);
    state.host.style.blockSize = `${maxHeight}px`;
    state.host.style.maxBlockSize = `${maxHeight}px`;
    return { maxHeight, reservedBottom };
  }
  function resetPosition() {
    if (state.draggable?.reset) {
      const next = state.draggable.reset();
      syncHostLayout();
      return next;
    }
    if (!state.host) return null;
    try { localStorage.removeItem('RF_DEBUG_CENTER_POS'); } catch (_) {}
    state.host.style.left = `${Math.max(12, window.innerWidth - 460)}px`;
    state.host.style.top = '72px';
    state.host.style.right = 'auto';
    state.host.style.bottom = 'auto';
    syncHostLayout();
    return { left: state.host.offsetLeft, top: state.host.offsetTop };
  }
  function start() {
    if (state.enabled) return true;
    const activation = readActivationFlag();
    if (!activation) return false;
    state.enabled = true;
    state.activation = activation;
    ensureHost();
    syncHostLayout();
    installPerformanceObservers(window);
    installNetworkObserver(window);
    if (!state.timer) state.timer = window.setInterval(() => { if (state.enabled) applyModel(); }, 150);
    applyModel();
    state.detachedWindow?.sync();
    return true;
  }
  function stop() {
    state.enabled = false;
    uninstallPerformanceObservers(window);
    uninstallNetworkObserver(window);
    if (state.timer) { window.clearInterval(state.timer); state.timer = null; }
    state.detachedWindow?.close();
    if (state.host) { state.host.classList.remove('is-on'); state.host.remove(); state.host = null; state.shadow = null; state.draggable = null; }
    return true;
  }
  function toggle(force) { return typeof force === 'boolean' ? (force ? start() : stop()) : (state.enabled ? stop() : start()); }
  function refresh() { if (!state.enabled) return applyModel(); syncHostLayout(); const model = applyModel(); state.detachedWindow?.sync(); return model; }
  function pauseTimeline() { pauseDebugCenterTimeline(); return applyModel(); }
  function resumeTimeline() { resumeDebugCenterTimeline(); return applyModel(); }
  function clearTimeline() { clearDebugCenterTimeline(); return applyModel(); }
  function copyTimelineJSON() { return copyDebugCenterTimelineJSON(); }
  function refreshLoopFreeze() { refreshDebugCenterLoopFreeze(window.RF_UI_TRACE, state.bundle); return applyModel(); }
  function clearLoopFreeze() { clearDebugCenterLoopFreeze(); return applyModel(); }
  function copyLoopFreezeJSON() { return copyDebugCenterLoopFreezeJSON(); }
  function refreshPerformance() { return applyModel(); }
  function clearPerformance() { clearPerformanceSnapshot(); return applyModel(); }
  function copyPerformanceJSON() { return copyDebugCenterPerformanceJSON(); }
  function refreshAsyncRace() { refreshAsyncRaceSnapshot({ timeline: state.lastModel?.timeline || applyModel().timeline, traceState: state.lastModel?.timeline?.sourceState || 'absent', bundle: state.bundle, active: true }); return applyModel(); }
  function clearAsyncRace() { clearAsyncRaceSnapshot(); return applyModel(); }
  function copyAsyncRaceJSONPublic() { return copyAsyncRaceJSON(); }
  function buildBundle() {
    const model = state.lastModel || applyModel();
    state.bundlePreview = buildDebugBundle({ state: model, traceApi: window.RF_UI_TRACE, doc: document, win: window, ownership: state.ownership });
    state.bundle = { status: 'ready', message: 'ready', filename: null, updatedAt: state.bundlePreview.generatedAt };
    applyModel();
    return state.bundlePreview;
  }
  function exportBundle() {
    const bundle = buildBundle();
    const result = exportDebugBundle(bundle, { doc: document, win: window, filename: createBundleFilename(new Date(bundle.generatedAt)) });
    state.bundle = { status: result.ok ? 'exported' : 'error', message: result.ok ? 'exported' : (result.error || 'export failed'), filename: result.filename || null, updatedAt: bundle.generatedAt };
    applyModel();
    state.detachedWindow?.sync();
    return result;
  }
  async function copyBundleJSON() {
    const bundle = buildBundle();
    const json = await copyDebugBundleJSON(bundle, { win: window });
    state.bundle = { status: 'copied', message: 'copied', filename: null, updatedAt: bundle.generatedAt };
    applyModel();
    state.detachedWindow?.sync();
    return json;
  }
  state.detachedWindow = createDetachedDebugCenterWindow(window, { getState: currentModel, buildBundle, copyBundleJSON });
  const api = {
    get enabled() { return state.enabled; },
    get activation() { return state.activation; },
    get state() { return state.lastModel || applyModel(); },
    start, stop, toggle, refresh, refreshTimeline: refresh, getState: () => (state.lastModel || applyModel()),
    resetPosition,
    pauseTimeline, resumeTimeline, clearTimeline, copyTimelineJSON,
  refreshLoopFreeze, clearLoopFreeze, copyLoopFreezeJSON,
  refreshPerformance, clearPerformance, copyPerformanceJSON,
  refreshAsyncRace, clearAsyncRace, copyAsyncRaceJSON: copyAsyncRaceJSONPublic,
  refreshNetwork: () => { refreshDebugCenterNetwork(window.RF_UI_TRACE, state.bundle, state.enabled); return applyModel(); },
  clearNetwork: () => { clearDebugCenterNetwork(); return applyModel(); },
  copyNetworkJSON: copyDebugCenterNetworkJSON,
    refreshWarnings: () => refreshDebugCenterWarnings(window.RF_UI_TRACE, state.bundle),
    clearWarnings: clearDebugCenterWarnings, copyWarningsJSON: copyDebugCenterWarningsJSON,
    buildBundle, exportBundle, copyBundleJSON,
    openDetachedWindow: () => state.detachedWindow.open(),
    closeDetachedWindow: () => state.detachedWindow.close(),
    syncDetachedWindow: () => state.detachedWindow.sync(),
    getDetachedWindowState: () => state.detachedWindow.getState(),
  };
  Object.defineProperty(api, 'ownership', { enumerable: true, get() { return state.ownership; } });
  state.actions = { refreshTimeline: refresh, refresh, resetPosition, pauseTimeline, resumeTimeline, clearTimeline, copyTimelineJSON, refreshLoopFreeze, clearLoopFreeze, copyLoopFreezeJSON, refreshPerformance, clearPerformance, copyPerformanceJSON, refreshAsyncRace, clearAsyncRace, copyAsyncRaceJSON: copyAsyncRaceJSONPublic, refreshNetwork: () => { refreshDebugCenterNetwork(window.RF_UI_TRACE, state.bundle, state.enabled); return applyModel(); }, clearNetwork: () => { clearDebugCenterNetwork(); return applyModel(); }, copyNetworkJSON: copyDebugCenterNetworkJSON, refreshWarnings: () => refreshDebugCenterWarnings(window.RF_UI_TRACE, state.bundle), clearWarnings: clearDebugCenterWarnings, copyWarningsJSON: copyDebugCenterWarningsJSON, buildBundle, exportBundle, copyBundleJSON, openDetachedWindow: () => state.detachedWindow.open(), closeDetachedWindow: () => state.detachedWindow.close(), syncDetachedWindow: () => state.detachedWindow.sync(), getDetachedWindowState: () => state.detachedWindow.getState() };
  window.addEventListener('resize', () => { syncHostLayout(); });
  applyVisualDoctorApi(api, state, applyModel);
  applySelectionApi(api, state, applyModel); applyRenderPreviewApi(api, state, applyModel); applyVisualEvidenceApi(api, state, applyModel); applyDomScannerApi(api, state, applyModel); applyCausalIntelligenceApi(api, state, applyModel);
  return { state, api };
}
