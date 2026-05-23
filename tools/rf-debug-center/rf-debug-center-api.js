'use strict';
import {
  clearDebugCenterTimeline,
  copyDebugCenterTimelineJSON,
  clearDebugCenterWarnings,
  copyDebugCenterWarningsJSON,
  clearDebugCenterLoopFreeze,
  copyDebugCenterLoopFreezeJSON,
  clearDebugCenterNetwork,
  copyDebugCenterNetworkJSON,
  refreshDebugCenterNetwork,
  pauseDebugCenterTimeline,
  readDebugCenterState,
  resumeDebugCenterTimeline,
  refreshDebugCenterLoopFreeze,
  refreshDebugCenterWarnings,
} from './rf-debug-center-store.js';
import {
  buildDebugBundle,
  copyDebugBundleJSON,
  createBundleFilename,
  exportDebugBundle,
} from './rf-debug-center-bundle.js';
import { clearAsyncRaceSnapshot, copyAsyncRaceJSON, refreshAsyncRaceSnapshot } from './rf-debug-center-async-race.js';
import { clearPerformanceSnapshot, copyPerformanceJSON as copyDebugCenterPerformanceJSON, installPerformanceObservers, uninstallPerformanceObservers } from './rf-debug-center-performance.js';
import { installNetworkObserver, uninstallNetworkObserver } from './rf-debug-center-network.js';
import { applySelectionApi } from './rf-debug-center-api-selection.js'; import { applyRenderPreviewApi } from './rf-debug-center-api-render-preview.js';
import { applyVisualEvidenceApi } from './rf-debug-center-api-visual-evidence.js'; import { applyDomScannerApi } from './rf-debug-center-api-dom-scanner.js'; import { applyCausalIntelligenceApi } from './rf-debug-center-api-causal-intelligence.js';
import { mountDebugCenter, renderDebugCenter } from './rf-debug-center-view.js';
const OWNERSHIP_MAP = Object.freeze({
  tool: 'RF Debug Center',
  version: 1,
  subsystemsVersion: 1,
  ssot: {
    uiTrace: 'engines/RFAudit.js',
    bootstrap: 'tools/rf-debug-center/rf-debug-center.js',
    store: 'tools/rf-debug-center/rf-debug-center-store.js',
    view: 'tools/rf-debug-center/rf-debug-center-view.js',
    viewSections: 'tools/rf-debug-center/rf-debug-center-view-sections.js',
    loopFreezeView: 'tools/rf-debug-center/rf-debug-center-loop-freeze-view.js',
    asyncRaceView: 'tools/rf-debug-center/rf-debug-center-async-race-view.js',
    networkView: 'tools/rf-debug-center/rf-debug-center-network-view.js',
    performanceView: 'tools/rf-debug-center/rf-debug-center-performance-view.js',
    style: 'tools/rf-debug-center/rf-debug-center.css',
    loopFreeze: 'tools/rf-debug-center/rf-debug-center-loop-freeze.js',
    asyncRace: 'tools/rf-debug-center/rf-debug-center-async-race.js',
    network: 'tools/rf-debug-center/rf-debug-center-network.js',
    performance: 'tools/rf-debug-center/rf-debug-center-performance.js', selection: 'tools/rf-debug-center/rf-debug-center-selection.js', domScanner: 'tools/rf-debug-center/rf-debug-center-dom-scanner.js', domScannerView: 'tools/rf-debug-center/rf-debug-center-dom-scanner-view.js', apiDomScanner: 'tools/rf-debug-center/rf-debug-center-api-dom-scanner.js', causalIntelligence: 'tools/rf-debug-center/rf-debug-center-causal-intelligence.js', causalIntelligenceView: 'tools/rf-debug-center/rf-debug-center-causal-intelligence-view.js', apiCausalIntelligence: 'tools/rf-debug-center/rf-debug-center-api-causal-intelligence.js',
  },
  subsystems: [
    { name: 'ui-trace', source: 'RF_UI_TRACE', owner: 'runtime-observability', onlyWriter: 'RF_UI_TRACE runtime producer', readers: ['tools/rf-debug-center/rf-debug-center-store.js', 'tools/rf-debug-center/rf-debug-center-view.js', 'tools/rf-debug-center/rf-debug-center-warnings-view.js'], forbiddenWriters: ['tools/rf-debug-center/rf-debug-center.js', 'tools/rf-debug-center/rf-debug-center-view.js'], publicAPI: ['getEntries', 'snapshot', 'clear'], invariants: ['read-only', 'no mutation from debug center', 'trace source preserved'] },
    { name: 'state-store', source: 'rf-debug-center-store.js', owner: 'debug-center', onlyWriter: 'tools/rf-debug-center/rf-debug-center-store.js', readers: ['tools/rf-debug-center/rf-debug-center.js', 'tools/rf-debug-center/rf-debug-center-view.js', 'tools/rf-debug-center/rf-debug-center-zoom.js', 'tools/rf-debug-center/rf-debug-center-warnings-view.js', 'tools/rf-debug-center/diagnostics/*'], forbiddenWriters: ['tools/rf-debug-center/rf-debug-center-view.js', 'tools/rf-debug-center/rf-debug-center.js'], publicAPI: ['readDebugCenterState', 'formatValue'], invariants: ['single-writer', 'snapshot-based', 'no direct UI mutation'] },
    { name: 'zoom', source: 'rf-debug-center-zoom.js', owner: 'debug-center', onlyWriter: 'tools/rf-debug-center/rf-debug-center-store.js', readers: ['tools/rf-debug-center/rf-debug-center-store.js', 'tools/rf-debug-center/rf-debug-center-view.js', 'tools/rf-debug-center/rf-debug-center-warnings-view.js', 'reportforge/tests/rf_debug_center_zoom.test.mjs'], forbiddenWriters: ['tools/rf-debug-center/rf-debug-center-view.js', 'tools/rf-debug-center/rf-debug-center.js'], publicAPI: ['buildZoomDiagnostics'], invariants: ['read-only', 'state-derived', 'no mutation of RF_UI_TRACE', 'no direct DOM writes'] },
    { name: 'timeline', source: 'rf-debug-center-store.js/timeline', owner: 'debug-center', onlyWriter: 'tools/rf-debug-center/rf-debug-center-store.js', readers: ['tools/rf-debug-center/rf-debug-center.js', 'tools/rf-debug-center/rf-debug-center-view.js', 'tools/rf-debug-center/rf-debug-center-warnings-view.js'], forbiddenWriters: ['tools/rf-debug-center/rf-debug-center-view.js', 'tools/rf-debug-center/rf-debug-center.js', 'RF_UI_TRACE runtime producer'], publicAPI: ['pauseDebugCenterTimeline', 'resumeDebugCenterTimeline', 'clearDebugCenterTimeline', 'copyDebugCenterTimelineJSON', 'getDebugCenterTimelineSnapshot'], invariants: ['read-only source', 'internal buffer only', 'no mutation of RF_UI_TRACE'] },
    { name: 'bundle', source: 'rf-debug-center-bundle.js', owner: 'debug-center', onlyWriter: 'tools/rf-debug-center/rf-debug-center.js', readers: ['tools/rf-debug-center/rf-debug-center-view.js', 'tools/rf-debug-center/rf-debug-center-warnings-view.js', 'reportforge/tests/rf_debug_center_bundle.test.mjs'], forbiddenWriters: ['tools/rf-debug-center/rf-debug-center-view.js'], publicAPI: ['buildDebugBundle', 'exportDebugBundle', 'copyDebugBundleJSON', 'createBundleFilename'], invariants: ['read-only', 'export-only', 'sanitized evidence', 'no mutation of ReportForge state'] },
    { name: 'warnings', source: 'rf-debug-center-warnings.js', owner: 'debug-center', onlyWriter: 'tools/rf-debug-center/rf-debug-center-store.js', readers: ['tools/rf-debug-center/rf-debug-center-view.js', 'tools/rf-debug-center/rf-debug-center-warnings-view.js', 'tools/rf-debug-center/rf-debug-center-bundle.js', 'reportforge/tests/rf_debug_center_warnings.test.mjs'], forbiddenWriters: ['tools/rf-debug-center/rf-debug-center-view.js', 'tools/rf-debug-center/rf-debug-center.js'], publicAPI: ['buildWarningsSnapshot', 'refreshDebugCenterWarnings', 'clearDebugCenterWarnings', 'copyDebugCenterWarningsJSON'], invariants: ['read-only evidence', 'deduplicated', 'no mutation of RF_UI_TRACE', 'no mutation of DS'] },
    { name: 'loopFreeze', source: 'rf-debug-center-loop-freeze.js', owner: 'debug-center', onlyWriter: 'tools/rf-debug-center/rf-debug-center-store.js', readers: ['tools/rf-debug-center/rf-debug-center-view.js', 'tools/rf-debug-center/rf-debug-center-loop-freeze-view.js', 'tools/rf-debug-center/rf-debug-center-bundle.js', 'tools/rf-debug-center/rf-debug-center-warnings.js', 'reportforge/tests/rf_debug_center_loop_freeze.test.mjs'], forbiddenWriters: ['tools/rf-debug-center/rf-debug-center-view.js', 'tools/rf-debug-center/rf-debug-center.js'], publicAPI: ['buildLoopFreezeSnapshot', 'refreshDebugCenterLoopFreeze', 'clearDebugCenterLoopFreeze', 'copyLoopFreezeJSON'], invariants: ['read-only evidence', 'ring-buffered', 'no mutation of RF_UI_TRACE', 'no mutation of DS'] },
    { name: 'asyncRace', source: 'rf-debug-center-async-race.js', owner: 'debug-center', onlyWriter: 'tools/rf-debug-center/rf-debug-center-store.js', readers: ['tools/rf-debug-center/rf-debug-center-view.js', 'tools/rf-debug-center/rf-debug-center-async-race-view.js', 'tools/rf-debug-center/rf-debug-center-bundle.js', 'tools/rf-debug-center/rf-debug-center-warnings.js', 'reportforge/tests/rf_debug_center_async_race.test.mjs'], forbiddenWriters: ['tools/rf-debug-center/rf-debug-center-view.js', 'tools/rf-debug-center/rf-debug-center.js'], publicAPI: ['buildAsyncRaceSnapshot', 'refreshAsyncRaceSnapshot', 'clearAsyncRaceSnapshot', 'copyAsyncRaceJSON'], invariants: ['read-only evidence', 'no mutation of RF_UI_TRACE', 'no mutation of DS', 'no fetch interception'] },
    { name: 'performance', source: 'rf-debug-center-performance.js', owner: 'debug-center', onlyWriter: 'tools/rf-debug-center/rf-debug-center-store.js', readers: ['tools/rf-debug-center/rf-debug-center-view.js', 'tools/rf-debug-center/rf-debug-center-performance-view.js', 'tools/rf-debug-center/rf-debug-center-bundle.js', 'tools/rf-debug-center/rf-debug-center-warnings.js', 'tools/rf-debug-center/rf-debug-center-loop-freeze.js', 'tools/rf-debug-center/rf-debug-center-async-race.js', 'tools/rf-debug-center/rf-debug-center-network.js', 'reportforge/tests/rf_debug_center_performance.test.mjs'], forbiddenWriters: ['tools/rf-debug-center/rf-debug-center-view.js', 'tools/rf-debug-center/rf-debug-center.js'], publicAPI: ['buildPerformanceSnapshot', 'refreshPerformanceSnapshot', 'clearPerformanceSnapshot', 'copyPerformanceJSON', 'installPerformanceObservers', 'uninstallPerformanceObservers'], invariants: ['read-only evidence', 'observer-based sampling only', 'no monkey patching', 'no mutation of RF_UI_TRACE', 'no mutation of DS'] },
    { name: 'selection', source: 'rf-debug-center-selection.js', owner: 'debug-center', onlyWriter: 'tools/rf-debug-center/rf-debug-center-store.js', readers: ['tools/rf-debug-center/rf-debug-center-view.js', 'tools/rf-debug-center/rf-debug-center-selection-view.js', 'tools/rf-debug-center/rf-debug-center-bundle.js', 'tools/rf-debug-center/rf-debug-center-warnings.js', 'reportforge/tests/rf_debug_center_selection.test.mjs'], forbiddenWriters: ['tools/rf-debug-center/rf-debug-center-view.js', 'tools/rf-debug-center/rf-debug-center.js'], publicAPI: ['buildSelectionSnapshot', 'refreshSelectionSnapshot', 'clearSelectionSnapshot', 'copySelectionJSON'], invariants: ['read-only evidence', 'no mutation of RF_UI_TRACE', 'no mutation of DS', 'no DOM mutation', 'selection overlay mirrored only'] },
    { name: 'network', source: 'rf-debug-center-network.js', owner: 'debug-center', onlyWriter: 'tools/rf-debug-center/rf-debug-center-store.js', readers: ['tools/rf-debug-center/rf-debug-center-view.js', 'tools/rf-debug-center/rf-debug-center-network-view.js', 'tools/rf-debug-center/rf-debug-center-bundle.js', 'tools/rf-debug-center/rf-debug-center-warnings.js', 'tools/rf-debug-center/rf-debug-center-async-race.js', 'reportforge/tests/rf_debug_center_network.test.mjs'], forbiddenWriters: ['tools/rf-debug-center/rf-debug-center-view.js', 'tools/rf-debug-center/rf-debug-center.js'], publicAPI: ['buildNetworkSnapshot', 'refreshNetworkSnapshot', 'clearNetworkSnapshot', 'copyNetworkJSON', 'installNetworkObserver', 'uninstallNetworkObserver'], invariants: ['passthrough perfect', 'sanitized evidence', 'no payload mutation', 'no response mutation', 'no fetch interception when inactive'] },
    { name: 'domScanner', source: 'rf-debug-center-dom-scanner.js', owner: 'debug-center', onlyWriter: 'tools/rf-debug-center/rf-debug-center-store.js', readers: ['tools/rf-debug-center/rf-debug-center-store.js', 'tools/rf-debug-center/rf-debug-center-view.js', 'tools/rf-debug-center/rf-debug-center-dom-scanner-view.js', 'tools/rf-debug-center/rf-debug-center-bundle.js', 'tools/rf-debug-center/rf-debug-center-warnings.js', 'reportforge/tests/rf_debug_center_dom_scanner.test.mjs'], forbiddenWriters: ['tools/rf-debug-center/rf-debug-center-view.js', 'tools/rf-debug-center/rf-debug-center.js'], publicAPI: ['buildDomScanner', 'refreshDebugCenterDomScanner', 'clearDebugCenterDomScanner', 'copyDebugCenterDomScannerJSON'], invariants: ['read-only', 'state-derived', 'no mutation of DS', 'no mutation of RF_UI_TRACE', 'no direct DOM writes'] },
    { name: 'causalIntelligence', source: 'rf-debug-center-causal-intelligence.js', owner: 'debug-center', onlyWriter: 'tools/rf-debug-center/rf-debug-center-store.js', readers: ['tools/rf-debug-center/rf-debug-center-store.js', 'tools/rf-debug-center/rf-debug-center-view.js', 'tools/rf-debug-center/rf-debug-center-causal-intelligence-view.js', 'tools/rf-debug-center/rf-debug-center-bundle.js', 'tools/rf-debug-center/rf-debug-center-warnings.js', 'reportforge/tests/rf_debug_center_causal_intelligence.test.mjs'], forbiddenWriters: ['tools/rf-debug-center/rf-debug-center-view.js', 'tools/rf-debug-center/rf-debug-center.js'], publicAPI: ['buildCausalIntelligenceSnapshot', 'refreshDebugCenterCausalIntelligence', 'clearDebugCenterCausalIntelligence', 'copyDebugCenterCausalIntelligenceJSON'], invariants: ['read-only', 'correlated snapshots only', 'no mutation of DS', 'no mutation of RF_UI_TRACE', 'no direct DOM writes'] },
    { name: 'view', source: 'rf-debug-center-view.js', owner: 'debug-center', onlyWriter: 'n/a', readers: ['tools/rf-debug-center/rf-debug-center.js', 'tools/rf-debug-center/rf-debug-center-warnings-view.js', 'tools/rf-debug-center/rf-debug-center-view-sections.js'], forbiddenWriters: ['tools/rf-debug-center/rf-debug-center-store.js'], publicAPI: ['mountDebugCenter', 'renderDebugCenter'], invariants: ['view-only', 'shadow-dom isolated', 'no state mutation'] },
    { name: 'style', source: 'rf-debug-center.css', owner: 'debug-center', onlyWriter: 'n/a', readers: ['tools/rf-debug-center/rf-debug-center-view.js', 'tools/rf-debug-center/rf-debug-center-warnings-view.js', 'tools/rf-debug-center/rf-debug-center-view-sections.js'], forbiddenWriters: ['global stylesheet', 'designer shell styles'], publicAPI: ['rf-debug-center namespace'], invariants: ['isolated-css', 'no global selectors', 'shadow-root safe'] },
  ],
});
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
    bundlePreview: null, actions: null,
  };
  function applyModel() {
    state.lastModel = readDebugCenterState({ enabled: state.enabled, activation: state.activation, bundle: state.bundle });
    state.lastModel.ownership = state.ownership;
    state.lastModel.bundle = state.bundle;
    state.lastModel.bundlePreview = state.bundlePreview;
    if (state.shadow) renderDebugCenter(state.shadow, state.lastModel, state.actions || {});
    return state.lastModel;
  }
  function ensureHost() {
    if (state.host) return state.host;
    const host = document.createElement('div');
    host.id = 'rf-debug-center-root';
    document.body.appendChild(host);
    state.host = host;
    state.shadow = mountDebugCenter(host);
    const head = state.shadow.getElementById('rf-debug-center-head');
    if (head && typeof window.makePanelDraggable === 'function') window.makePanelDraggable(host, head, 'RF_DEBUG_CENTER_POS', { left: Math.max(12, window.innerWidth - 460), top: Math.max(12, window.innerHeight - 320) });
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
    installPerformanceObservers(window);
    installNetworkObserver(window);
    if (!state.timer) state.timer = window.setInterval(() => { if (state.enabled) applyModel(); }, 150);
    applyModel();
    return true;
  }
  function stop() {
    state.enabled = false;
    uninstallPerformanceObservers(window);
    uninstallNetworkObserver(window);
    if (state.timer) { window.clearInterval(state.timer); state.timer = null; }
    if (state.host) { state.host.classList.remove('is-on'); state.host.remove(); state.host = null; state.shadow = null; }
    return true;
  }
  function toggle(force) { return typeof force === 'boolean' ? (force ? start() : stop()) : (state.enabled ? stop() : start()); }
  function refresh() { if (!state.enabled) return applyModel(); return applyModel(); }
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
    return result;
  }
  async function copyBundleJSON() {
    const bundle = buildBundle();
    const json = await copyDebugBundleJSON(bundle, { win: window });
    state.bundle = { status: 'copied', message: 'copied', filename: null, updatedAt: bundle.generatedAt };
    applyModel();
    return json;
  }
  const api = {
    get enabled() { return state.enabled; },
    get activation() { return state.activation; },
    get state() { return state.lastModel || applyModel(); },
    start, stop, toggle, refresh, refreshTimeline: refresh, getState: () => (state.lastModel || applyModel()),
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
  };
  Object.defineProperty(api, 'ownership', { enumerable: true, get() { return state.ownership; } });
  state.actions = { refreshTimeline: refresh, refresh, pauseTimeline, resumeTimeline, clearTimeline, copyTimelineJSON, refreshLoopFreeze, clearLoopFreeze, copyLoopFreezeJSON, refreshPerformance, clearPerformance, copyPerformanceJSON, refreshAsyncRace, clearAsyncRace, copyAsyncRaceJSON: copyAsyncRaceJSONPublic, refreshNetwork: () => { refreshDebugCenterNetwork(window.RF_UI_TRACE, state.bundle, state.enabled); return applyModel(); }, clearNetwork: () => { clearDebugCenterNetwork(); return applyModel(); }, copyNetworkJSON: copyDebugCenterNetworkJSON, refreshWarnings: () => refreshDebugCenterWarnings(window.RF_UI_TRACE, state.bundle), clearWarnings: clearDebugCenterWarnings, copyWarningsJSON: copyDebugCenterWarningsJSON, buildBundle, exportBundle, copyBundleJSON };
  applySelectionApi(api, state, applyModel); applyRenderPreviewApi(api, state, applyModel); applyVisualEvidenceApi(api, state, applyModel); applyDomScannerApi(api, state, applyModel); applyCausalIntelligenceApi(api, state, applyModel);
  return { state, api };
}
