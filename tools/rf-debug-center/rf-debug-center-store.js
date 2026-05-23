'use strict';
import { buildZoomDiagnostics } from './rf-debug-center-zoom.js'; import { clearLoopFreezeSnapshot, copyLoopFreezeJSON, getLoopFreezeSnapshot, refreshLoopFreezeSnapshot } from './rf-debug-center-loop-freeze.js';
import { getVisualEvidenceSnapshot } from './rf-debug-center-visual-evidence.js';
import { getAsyncRaceSnapshot, refreshAsyncRaceSnapshot } from './rf-debug-center-async-race.js';
import { clearNetworkSnapshot, copyNetworkJSON, getNetworkSnapshot, refreshNetworkSnapshot } from './rf-debug-center-network.js';
import { getPerformanceSnapshot, refreshPerformanceSnapshot } from './rf-debug-center-performance.js';
import { clearSelectionSnapshot, copySelectionJSON, getSelectionSnapshot, refreshSelectionSnapshot } from './rf-debug-center-selection.js';
import { clearRenderPreviewSnapshot, copyRenderPreviewJSON, getRenderPreviewSnapshot, refreshRenderPreviewSnapshot } from './rf-debug-center-render-preview.js';
import { buildWarningsSnapshot } from './rf-debug-center-warnings.js';
import { clone, compareSnapshots, normalizeSeverity, normalizeSnapshot, safeObject, stringify } from './rf-debug-center-state-utils.js';
const MAX_RECENT = 12;
const timelineState = {
  paused: false,
  cursor: 0,
  sourceState: 'absent',
  sourceCount: 0,
  lastSyncAt: null,
  lastError: null,
  entries: [],
  counts: { debug: 0, info: 0, warning: 0, error: 0 },
  total: 0,
  lastEvent: null,
  warningsPaused: false,
  warnings: { status: 'unknown', total: 0, counts: { info: 0, warning: 0, error: 0 }, warnings: [], sourceState: 'absent', traceState: 'absent' },
};
function inspectTraceApi(traceApi) {
  if (!traceApi) return { state: 'absent', entries: [], count: 0, error: null };
  if (typeof traceApi.getEntries !== 'function') return { state: 'invalid', entries: [], count: 0, error: 'missing getEntries()' };
  try {
    const entries = traceApi.getEntries();
    if (!Array.isArray(entries)) return { state: 'invalid', entries: [], count: 0, error: 'getEntries() must return an array' };
    return { state: entries.length ? 'present' : 'empty', entries, count: entries.length, error: null };
  } catch (error) {
    return { state: 'invalid', entries: [], count: 0, error: error?.message || String(error) };
  }
}
function normalizeTimelineEntry(entry, index) {
  return {
    timestamp: entry?.timestamp ?? null,
    project: entry?.project ?? 'reportforge',
    engine: 'timeline',
    module: entry?.module ?? entry?.source ?? 'unknown',
    source: entry?.source ?? entry?.module ?? 'unknown',
    action: entry?.action ?? entry?.event ?? 'ui',
    event: entry?.event ?? entry?.action ?? 'ui',
    phase: entry?.phase ?? 'after',
    severity: normalizeSeverity(entry?.severity),
    eventId: entry?.eventId ?? entry?.id ?? null,
    transactionId: entry?.transactionId ?? null,
    fn: entry?.fn ?? null,
    before: safeObject(entry?.before),
    after: safeObject(entry?.after),
    state: safeObject(entry?.state),
    dom: safeObject(entry?.dom),
    request: safeObject(entry?.request),
    response: safeObject(entry?.response),
    durationMs: Number.isFinite(Number(entry?.durationMs)) ? Number(entry.durationMs) : null,
    ownerExpected: entry?.ownerExpected ?? entry?.owner ?? null,
    writerActual: entry?.writerActual ?? entry?.writer ?? entry?.fn ?? null,
    invariant: entry?.invariant ?? null,
    result: entry?.result ?? null,
    error: entry?.error ?? null,
    raw: clone(entry),
    index: index + 1,
    summary: `${entry?.source ?? entry?.module ?? 'unknown'} · ${entry?.event ?? entry?.action ?? 'ui'}`,
  };
}

function recomputeTimeline(entries) {
  const counts = { debug: 0, info: 0, warning: 0, error: 0 };
  for (const entry of entries) counts[entry.severity] = (counts[entry.severity] || 0) + 1;
  return counts;
}

function syncTimeline(traceApi) {
  const source = inspectTraceApi(traceApi);
  timelineState.sourceState = source.state;
  timelineState.sourceCount = source.count;
  timelineState.lastError = source.error;
  timelineState.lastSyncAt = new Date().toISOString();
  if (timelineState.paused || source.state === 'absent' || source.state === 'invalid') return timelineState;
  if (source.count < timelineState.cursor) timelineState.cursor = source.count;
  const slice = source.entries.slice(timelineState.cursor);
  if (!slice.length) return timelineState;
  const start = timelineState.cursor;
  timelineState.entries.push(...slice.map((entry, offset) => normalizeTimelineEntry(entry, start + offset)));
  timelineState.cursor = source.count;
  timelineState.total = timelineState.entries.length;
  timelineState.counts = recomputeTimeline(timelineState.entries);
  timelineState.lastEvent = timelineState.entries.at(-1) || null;
  return timelineState;
}

function clearTimeline(traceApi) {
  const source = inspectTraceApi(traceApi);
  timelineState.entries = [];
  timelineState.cursor = source.count;
  timelineState.sourceState = source.state;
  timelineState.sourceCount = source.count;
  timelineState.lastError = source.error;
  timelineState.lastSyncAt = new Date().toISOString();
  timelineState.counts = { debug: 0, info: 0, warning: 0, error: 0 };
  timelineState.total = 0;
  timelineState.lastEvent = null;
  return timelineState;
}

function pauseTimeline() { timelineState.paused = true; return timelineState; }
function resumeTimeline() { timelineState.paused = false; return timelineState; }
function getTimelineSnapshot() { return { paused: timelineState.paused, sourceState: timelineState.sourceState, sourceCount: timelineState.sourceCount, lastSyncAt: timelineState.lastSyncAt, lastError: timelineState.lastError, total: timelineState.total, counts: { ...timelineState.counts }, lastEvent: clone(timelineState.lastEvent), recent: timelineState.entries.slice(-MAX_RECENT).map(clone), entries: timelineState.entries.map(clone) }; }
function copyTimelineJSON() { return JSON.stringify(getTimelineSnapshot(), null, 2); }

export function readDebugCenterState({ traceApi = window.RF_UI_TRACE, enabled = false, activation = 'disabled', bundle = null } = {}) {
  syncTimeline(traceApi);
  const timeline = getTimelineSnapshot();
  const last = timeline.lastEvent || null;
  const live = traceApi && typeof traceApi.snapshot === 'function' ? traceApi.snapshot() : null;
  const divergence = compareSnapshots(last?.before || null, last?.dom || last?.after || null, live);
  const build = window.RF_BUILD_INFO || null;
  const debugZoom = window.RF_DEBUG_ZOOM || null;
  const zoom = buildZoomDiagnostics({ ds: typeof DS !== 'undefined' ? DS : null, traceApi, timeline, doc: document });
  const selection = refreshSelectionSnapshot({ ds: typeof DS !== 'undefined' ? DS : null, doc: document, timeline, traceState: timeline.sourceState, bundle, ownership: window.RFDebugCenter?.ownership || null });
  const asyncRace = refreshAsyncRaceSnapshot({ timeline, traceState: timeline.sourceState, bundle, active: Boolean(enabled) });
  const network = refreshNetworkSnapshot({ traceState: timeline.sourceState, timeline, asyncRace, bundle, active: Boolean(enabled) });
  const loopFreeze = refreshLoopFreezeSnapshot({ timeline, traceState: timeline.sourceState, bundle, warnings: timelineState.warnings, active: Boolean(enabled) });
  const performance = refreshPerformanceSnapshot({ timeline, network, loopFreeze, asyncRace, warnings: timelineState.warnings, bundle, active: Boolean(enabled), traceState: timeline.sourceState, win: window });
  const renderPreview = refreshRenderPreviewSnapshot({ ds: typeof DS !== 'undefined' ? DS : null, doc: document, timeline, network, performance, asyncRace, loopFreeze, bundle, traceState: timeline.sourceState, active: Boolean(enabled) });
  if (!timelineState.warningsPaused) timelineState.warnings = buildWarningsSnapshot({ traceState: timeline.sourceState, timeline, zoom, renderPreview, asyncRace, loopFreeze, network, performance, selection, visualEvidence: getVisualEvidenceSnapshot(), dom: { status: zoom.status || 'unknown', findings: zoom.divergences?.map((code) => ({ code })) || [], owners: zoom.suggestedOwner ? [zoom.suggestedOwner] : [] }, bundle, ownership: window.RFDebugCenter?.ownership || null, active: Boolean(enabled) });
  return { enabled: Boolean(enabled), activation, build, debugZoom, last, live: normalizeSnapshot(live), divergence, zoom, timeline, selection, renderPreview, asyncRace, loopFreeze, network, performance, warnings: timelineState.warnings, recent: timeline.recent, visualEvidence: getVisualEvidenceSnapshot() };
}

export function pauseDebugCenterTimeline() { return pauseTimeline(); } export function resumeDebugCenterTimeline() { return resumeTimeline(); }
export function clearDebugCenterTimeline(traceApi = window.RF_UI_TRACE) { return clearTimeline(traceApi); } export function copyDebugCenterTimelineJSON() { return copyTimelineJSON(); } export function getDebugCenterTimelineSnapshot() { return getTimelineSnapshot(); }
export function refreshDebugCenterWarnings(traceApi = window.RF_UI_TRACE, bundle = null) { timelineState.warningsPaused = false; const timeline = getTimelineSnapshot(); const selection = refreshSelectionSnapshot({ ds: typeof DS !== 'undefined' ? DS : null, doc: document, timeline, traceState: timeline.sourceState, bundle, ownership: window.RFDebugCenter?.ownership || null }); const asyncRace = refreshAsyncRaceSnapshot({ timeline, traceState: timeline.sourceState, bundle, active: true }); const loopFreeze = refreshLoopFreezeSnapshot({ timeline, traceState: timeline.sourceState, bundle, warnings: timelineState.warnings, active: true }); const network = getNetworkSnapshot(); const performance = refreshPerformanceSnapshot({ timeline, network, loopFreeze, asyncRace, warnings: timelineState.warnings, bundle, active: true, traceState: timeline.sourceState, win: window }); const renderPreview = refreshRenderPreviewSnapshot({ ds: typeof DS !== 'undefined' ? DS : null, doc: document, timeline, network, performance, asyncRace, loopFreeze, bundle, traceState: timeline.sourceState, active: true }); return timelineState.warnings = buildWarningsSnapshot({ traceState: timelineState.sourceState, timeline, zoom: buildZoomDiagnostics({ ds: typeof DS !== 'undefined' ? DS : null, traceApi, timeline, doc: document }), renderPreview, asyncRace, loopFreeze, network, performance, selection, dom: null, bundle, ownership: window.RFDebugCenter?.ownership || null, active: true }); }
export function clearDebugCenterWarnings() { timelineState.warningsPaused = true; return timelineState.warnings = { status: 'unknown', total: 0, counts: { info: 0, warning: 0, error: 0 }, warnings: [], sourceState: timelineState.sourceState, traceState: timelineState.sourceState }; } export function copyDebugCenterWarningsJSON() { return JSON.stringify(timelineState.warnings, null, 2); }
export function refreshDebugCenterSelection(traceApi = window.RF_UI_TRACE, bundle = null) { syncTimeline(traceApi); return refreshSelectionSnapshot({ ds: typeof DS !== 'undefined' ? DS : null, doc: document, timeline: getTimelineSnapshot(), traceState: timelineState.sourceState, bundle, ownership: window.RFDebugCenter?.ownership || null }); } export function clearDebugCenterSelection() { return clearSelectionSnapshot(); } export function copyDebugCenterSelectionJSON() { return copySelectionJSON(); } export function getDebugCenterSelectionSnapshot() { return getSelectionSnapshot(); }
export function refreshDebugCenterRenderPreview(traceApi = window.RF_UI_TRACE, bundle = null, active = false) { syncTimeline(traceApi); const timeline = getTimelineSnapshot(); const asyncRace = getAsyncRaceSnapshot(); const loopFreeze = getLoopFreezeSnapshot(); const network = getNetworkSnapshot(); const performance = getPerformanceSnapshot(); return refreshRenderPreviewSnapshot({ ds: typeof DS !== 'undefined' ? DS : null, doc: document, timeline, network, performance, asyncRace, loopFreeze, bundle, traceState: timeline.sourceState, active }); }
export function clearDebugCenterRenderPreview() { return clearRenderPreviewSnapshot(); }
export function copyDebugCenterRenderPreviewJSON() { return copyRenderPreviewJSON(); }
export function getDebugCenterRenderPreviewSnapshot() { return getRenderPreviewSnapshot(); }
export function refreshDebugCenterLoopFreeze(traceApi = window.RF_UI_TRACE, bundle = null) { syncTimeline(traceApi); return refreshLoopFreezeSnapshot({ timeline: getTimelineSnapshot(), traceState: timelineState.sourceState, bundle, warnings: timelineState.warnings, active: true }); }
export function clearDebugCenterLoopFreeze() { return clearLoopFreezeSnapshot(); }
export function copyDebugCenterLoopFreezeJSON() { return copyLoopFreezeJSON(); }
export function getDebugCenterLoopFreezeSnapshot() { return getLoopFreezeSnapshot(); }
export function refreshDebugCenterNetwork(traceApi = window.RF_UI_TRACE, bundle = null, active = false) { syncTimeline(traceApi); const timeline = getTimelineSnapshot(); const asyncRace = refreshAsyncRaceSnapshot({ timeline, traceState: timeline.sourceState, bundle, active }); return refreshNetworkSnapshot({ traceState: timeline.sourceState, timeline, asyncRace, bundle, active }); }
export function clearDebugCenterNetwork() { return clearNetworkSnapshot(); }
export function copyDebugCenterNetworkJSON() { return copyNetworkJSON(); }
export function getDebugCenterNetworkSnapshot() { return getNetworkSnapshot(); }
export function formatValue(value) { return stringify(value); }
