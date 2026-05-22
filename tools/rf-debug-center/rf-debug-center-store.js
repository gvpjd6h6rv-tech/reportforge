'use strict';

import { buildZoomDiagnostics } from './rf-debug-center-zoom.js';

const MAX_RECENT = 12;
const TIMELINE_SEVERITIES = ['debug', 'info', 'warning', 'error'];

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
};

function stringify(value) {
  if (value == null) return '—';
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value); } catch (_) { return String(value); }
}

function clone(value) {
  if (value == null || typeof value !== 'object') return value;
  try { return JSON.parse(JSON.stringify(value)); } catch (_) { return Array.isArray(value) ? value.slice() : { ...value }; }
}

function summarizeElement(node) {
  if (!node) return null;
  return { tag: node.tag || node.tagName || null, id: node.id || null, className: node.className || null, datasetId: node.datasetId || node.dataset?.id || null, datasetOriginId: node.datasetOriginId || node.dataset?.originId || null, datasetPos: node.datasetPos || node.dataset?.pos || null };
}

function normalizeSnapshot(snapshot) {
  if (!snapshot) return null;
  return { dsZoom: snapshot.dsZoom ?? null, sliderValue: snapshot.sliderValue ?? null, pctText: snapshot.pctText ?? null, sliderRect: snapshot.sliderRect ?? null, sliderStyle: snapshot.sliderStyle ?? null, pctStyle: snapshot.pctStyle ?? null, focusRect: snapshot.focusRect ?? null, focusStyle: snapshot.focusStyle ?? null, visibleElement: summarizeElement(snapshot.visibleElement) };
}

function compareSnapshots(before, eventDom, live) {
  if (!eventDom && !live) return { ok: true, mismatches: [], summary: 'idle' };
  const keys = ['dsZoom', 'sliderValue', 'pctText'];
  const mismatches = [];
  for (const key of keys) if (stringify(eventDom?.[key]) !== stringify(live?.[key])) mismatches.push(key);
  return { ok: mismatches.length === 0, mismatches, summary: mismatches.length ? `diverged: ${mismatches.join(', ')}` : 'synced', before: normalizeSnapshot(before), after: normalizeSnapshot(eventDom), live: normalizeSnapshot(live) };
}

function readUiEntries(traceApi) {
  if (!traceApi || typeof traceApi.getEntries !== 'function') return [];
  try { return traceApi.getEntries().filter((entry) => entry && entry.kind === 'ui'); } catch (_) { return []; }
}

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

function normalizeSeverity(value) {
  const severity = String(value || 'info').toLowerCase();
  return TIMELINE_SEVERITIES.includes(severity) ? severity : 'info';
}

function safeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? clone(value) : null;
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

export function readDebugCenterState({ traceApi = window.RF_UI_TRACE, enabled = false, activation = 'disabled' } = {}) {
  syncTimeline(traceApi);
  const timeline = getTimelineSnapshot();
  const last = timeline.lastEvent || null;
  const live = traceApi && typeof traceApi.snapshot === 'function' ? traceApi.snapshot() : null;
  const divergence = compareSnapshots(last?.before || null, last?.dom || last?.after || null, live);
  const build = window.RF_BUILD_INFO || null;
  const debugZoom = window.RF_DEBUG_ZOOM || null;
  const zoom = buildZoomDiagnostics({ ds: typeof DS !== 'undefined' ? DS : null, traceApi, timeline, doc: document });
  return { enabled: Boolean(enabled), activation, build, debugZoom, last, live: normalizeSnapshot(live), divergence, zoom, timeline, recent: timeline.recent };
}

export function pauseDebugCenterTimeline() { return pauseTimeline(); }
export function resumeDebugCenterTimeline() { return resumeTimeline(); }
export function clearDebugCenterTimeline(traceApi = window.RF_UI_TRACE) { return clearTimeline(traceApi); }
export function copyDebugCenterTimelineJSON() { return copyTimelineJSON(); }
export function getDebugCenterTimelineSnapshot() { return getTimelineSnapshot(); }

export function formatValue(value) { return stringify(value); }
