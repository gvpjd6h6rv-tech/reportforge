'use strict';

const LIMITS = Object.freeze({
  maxEntries: 50,
  slowEventThresholdMs: 100,
  slowRequestThresholdMs: 1000,
  frameGapThresholdMs: 250,
  longTaskThresholdMs: 50,
  windowMs: 5000,
  eventRateThreshold: 12,
});

const state = {
  installed: false,
  observerStatus: 'disabled',
  win: null,
  po: null,
  rafId: null,
  lastFrameAt: null,
  longTasks: [],
  frameGaps: [],
  lastInstallAt: null,
  lastError: null,
  lastContext: null,
};

let snapshot = neutralSnapshot();

const nowIso = () => new Date().toISOString();
const toMs = (value) => {
  const time = typeof value === 'number' ? value : Date.parse(value || '');
  return Number.isFinite(time) ? time : null;
};
const clip = (value, limit = 120) => {
  if (value == null) return null;
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
};
const cap = (list, item) => { list.push(item); if (list.length > LIMITS.maxEntries) list.splice(0, list.length - LIMITS.maxEntries); };
const compactLabel = (item) => [item?.source, item?.module, item?.action, item?.path].filter(Boolean).join(' · ') || 'unknown';
const severityScore = (value) => ({ error: 3, warning: 2, info: 1, ok: 0, unknown: 0 })[value] || 0;

function neutralSnapshot() {
  return { timestamp: null, project: 'reportforge', engine: 'performance', status: 'unknown', runtime: { nowMs: null, performanceNow: null, visibilityState: null }, eventRate: { windowMs: LIMITS.windowMs, total: 0, perSecond: 0, topActions: [] }, slowEvents: [], slowRequests: [], longTasks: [], frameGaps: [], topSlowOperations: [], correlations: { loopFreeze: {}, asyncRace: {}, network: {} }, limits: LIMITS, risk: { level: 'none', reason: 'no data' }, evidence: [], suggestedOwner: null, observerStatus: 'disabled', sourceState: 'absent' };
}

function syncSnapshot() { snapshot = buildPerformanceSnapshot(state.lastContext || {}); return snapshot; }
function itemFromEvent(event, kind, durationMs, severity = 'warning') { return { kind, label: compactLabel(event), source: event?.source || event?.module || 'unknown', module: event?.module || event?.source || 'unknown', action: event?.action || event?.event || 'ui', path: event?.path || event?.request?.path || event?.url || null, durationMs, severity, evidence: [`${kind}=${durationMs}`] }; }
function pickWindowEvents(timeline) { return Array.isArray(timeline?.entries) ? timeline.entries.slice(-LIMITS.maxEntries) : Array.isArray(timeline?.recent) ? timeline.recent.slice(-LIMITS.maxEntries) : []; }
function summarizeEventRate(events, nowMs) {
  const counted = events.filter((event) => {
    const time = toMs(event.timestamp);
    return time != null && nowMs - time <= LIMITS.windowMs;
  });
  const buckets = new Map();
  for (const event of counted) {
    const key = [event.source || event.module || 'unknown', event.module || event.source || 'unknown', event.action || event.event || 'ui'].join('|');
    buckets.set(key, (buckets.get(key) || 0) + 1);
  }
  return { windowMs: LIMITS.windowMs, total: counted.length, perSecond: Number((counted.length / (LIMITS.windowMs / 1000)).toFixed(2)), topActions: [...buckets.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([key, count]) => { const [source, module, action] = key.split('|'); return { source, module, action, count }; }) };
}
function summarizeSlowEvents(events) { return events.filter((event) => Number(event.durationMs || 0) >= LIMITS.slowEventThresholdMs).map((event) => ({ ...itemFromEvent(event, 'event', Number(event.durationMs || 0), Number(event.durationMs || 0) >= LIMITS.slowEventThresholdMs * 2 ? 'error' : 'warning'), timestamp: event.timestamp || null, requestId: event.requestId || null, transactionId: event.transactionId || null, renderId: event.renderId || null })); }
function summarizeSlowRequests(network) { return (network?.slowRequests || []).slice(-LIMITS.maxEntries).map((item) => ({ kind: 'request', label: compactLabel(item), source: item.source || 'network', module: item.module || item.source || 'network', action: item.method || 'request', path: item.path || item.url || null, durationMs: Number(item.durationMs || item.ageMs || 0), severity: 'warning', evidence: [`status=${item.status ?? 'n/a'}`, `duration=${Number(item.durationMs || item.ageMs || 0)}`], requestId: item.requestId || null, transactionId: item.transactionId || null })); }
function summarizeTasks(list, kind) { return list.slice(-LIMITS.maxEntries).map((item) => ({ kind, label: clip(item.name || item.label || kind, 100), source: item.source || 'performance', module: item.module || 'performance', action: item.action || kind, path: item.path || null, durationMs: Number(item.durationMs || item.gapMs || 0), severity: 'warning', evidence: item.evidence || [] })); }
function buildTopSlowOperations({ slowEvents, slowRequests, longTasks, frameGaps }) { return [...slowEvents, ...slowRequests, ...longTasks, ...frameGaps].sort((a, b) => (Number(b.durationMs || 0) - Number(a.durationMs || 0))).slice(0, LIMITS.maxEntries); }
function correlationSummary(item, kind) { return { status: item?.status || 'unknown', risk: item?.risk?.level || item?.risk || 'none', reason: item?.risk?.reason || item?.message || item?.status || 'no data', evidence: (item?.evidence || []).slice(0, 4), suggestedOwner: item?.suggestedOwner || null, kind }; }
function overallRisk(snapshotData) {
  const worst = Math.max(severityScore(snapshotData.loopFreeze?.risk?.level), severityScore(snapshotData.asyncRace?.risk?.level), severityScore(snapshotData.network?.risk?.level), snapshotData.eventRate.perSecond > LIMITS.eventRateThreshold ? 2 : 0, snapshotData.slowEvents.length ? 2 : 0, snapshotData.slowRequests.length ? 2 : 0, snapshotData.longTasks.length ? 2 : 0, snapshotData.frameGaps.length ? 2 : 0);
  if (worst >= 3) return { level: 'high', reason: snapshotData.evidence[0] || 'performance risk is high' };
  if (worst >= 2) return { level: 'medium', reason: snapshotData.evidence[0] || 'performance risk detected' };
  if (worst >= 1) return { level: 'low', reason: snapshotData.evidence[0] || 'some performance evidence captured' };
  return { level: 'none', reason: snapshotData.sourceState === 'absent' ? 'no data' : 'healthy' };
}

export function recordPerformanceLongTask(entry) {
  cap(state.longTasks, { timestamp: nowIso(), name: clip(entry?.name || 'longtask', 100), durationMs: Number(entry?.duration || entry?.durationMs || 0), source: 'performanceobserver', evidence: [`duration=${Number(entry?.duration || entry?.durationMs || 0)}`] });
  return syncSnapshot();
}

export function recordPerformanceFrameGap(gapMs) {
  cap(state.frameGaps, { timestamp: nowIso(), source: 'requestAnimationFrame', gapMs: Number(gapMs || 0), durationMs: Number(gapMs || 0), thresholdMs: LIMITS.frameGapThresholdMs, evidence: [`gap=${Number(gapMs || 0)}`] });
  return syncSnapshot();
}

function scheduleFrame() {
  if (!state.installed || !state.win?.requestAnimationFrame) return;
  state.rafId = state.win.requestAnimationFrame((ts) => {
    if (!state.installed) return;
    const now = typeof ts === 'number' ? ts : state.win?.performance?.now?.() ?? Date.now();
    if (state.lastFrameAt != null) {
      const gap = Math.max(0, now - state.lastFrameAt);
      if (gap >= LIMITS.frameGapThresholdMs) recordPerformanceFrameGap(gap);
    }
    state.lastFrameAt = now;
    scheduleFrame();
  });
}

export function installPerformanceObservers(win = typeof window !== 'undefined' ? window : null) {
  if (!win || state.installed) return getPerformanceSnapshot();
  state.win = win;
  state.installed = true;
  state.lastInstallAt = nowIso();
  let poOk = false;
  let rafOk = false;
  try {
    if (typeof win.PerformanceObserver === 'function') {
      state.po = new win.PerformanceObserver((list) => {
        try { for (const entry of list.getEntries ? list.getEntries() : list) if ((entry.entryType || entry.name) === 'longtask' || Number(entry.duration || entry.durationMs || 0) >= LIMITS.longTaskThresholdMs) recordPerformanceLongTask(entry); }
        catch (error) { state.lastError = error?.message || String(error); }
      });
      state.po.observe?.({ entryTypes: ['longtask'] });
      poOk = true;
    }
  } catch (error) { state.lastError = error?.message || String(error); }
  try {
    if (typeof win.requestAnimationFrame === 'function') {
      state.lastFrameAt = null;
      scheduleFrame();
      rafOk = true;
    }
  } catch (error) { state.lastError = error?.message || String(error); }
  state.observerStatus = poOk && rafOk ? 'installed' : poOk || rafOk ? 'partial' : 'disabled';
  return syncSnapshot();
}

export function uninstallPerformanceObservers(win = typeof window !== 'undefined' ? window : null) {
  const current = win || state.win;
  if (state.po?.disconnect) try { state.po.disconnect(); } catch (_) {}
  if (state.rafId != null && current?.cancelAnimationFrame) try { current.cancelAnimationFrame(state.rafId); } catch (_) {}
  state.installed = false;
  state.po = null;
  state.rafId = null;
  state.win = null;
  state.lastFrameAt = null;
  state.observerStatus = 'disabled';
  return syncSnapshot();
}

export function buildPerformanceSnapshot({ timeline = null, network = null, loopFreeze = null, asyncRace = null, warnings = null, bundle = null, active = false, win = state.win || (typeof window !== 'undefined' ? window : null), traceState = timeline?.sourceState || 'absent' } = {}) {
  const nowMs = win?.performance?.now?.() ?? Date.now();
  const eventWindowNow = toMs(timeline?.lastSyncAt) ?? Date.now();
  const events = pickWindowEvents(timeline);
  const eventRate = summarizeEventRate(Array.isArray(timeline?.entries) ? timeline.entries : events, eventWindowNow);
  const slowEvents = summarizeSlowEvents(events);
  const slowRequests = summarizeSlowRequests(network);
  const longTasks = summarizeTasks(state.longTasks, 'longtask').filter((item) => Number(item.durationMs || 0) >= LIMITS.longTaskThresholdMs);
  const frameGaps = summarizeTasks(state.frameGaps, 'framegap').filter((item) => Number(item.durationMs || 0) >= LIMITS.frameGapThresholdMs);
  const topSlowOperations = buildTopSlowOperations({ slowEvents, slowRequests, longTasks, frameGaps }).map((item) => ({ label: item.label, source: item.source, module: item.module, action: item.action, path: item.path || null, durationMs: Number(item.durationMs || 0), severity: item.severity || 'warning', evidence: item.evidence || [] }));
  const correlations = { loopFreeze: correlationSummary(loopFreeze, 'loopFreeze'), asyncRace: correlationSummary(asyncRace, 'asyncRace'), network: correlationSummary(network, 'network') };
  const evidence = [...new Set([
    slowEvents[0]?.label,
    slowRequests[0]?.label,
    longTasks[0]?.label,
    frameGaps[0]?.label,
    correlations.loopFreeze.reason,
    correlations.asyncRace.reason,
    correlations.network.reason,
    eventRate.perSecond > LIMITS.eventRateThreshold ? `eventRate ${eventRate.perSecond}/s` : null,
  ].filter(Boolean).map((item) => clip(item, 160)).slice(0, 24))];
  const risk = overallRisk({ slowEvents, slowRequests, longTasks, frameGaps, loopFreeze, asyncRace, network, eventRate, evidence, sourceState: traceState });
  const status = [slowEvents.length, slowRequests.length, longTasks.length, frameGaps.length, correlations.loopFreeze.risk, correlations.asyncRace.risk, correlations.network.risk].some((item) => ['high', 'error'].includes(String(item))) ? 'error' : [slowEvents.length, slowRequests.length, longTasks.length, frameGaps.length, eventRate.perSecond > LIMITS.eventRateThreshold, correlations.loopFreeze.risk === 'medium', correlations.asyncRace.risk === 'medium', correlations.network.risk === 'medium'].some(Boolean) ? 'warning' : !timeline && !network && !loopFreeze && !asyncRace && !warnings ? 'unknown' : 'ok';
  const suggestedOwner = slowRequests[0]?.path ? slowRequests[0]?.source || slowRequests[0]?.ownerExpected || 'tools/rf-debug-center/rf-debug-center-network.js' : loopFreeze?.suggestedOwner || asyncRace?.suggestedOwner || network?.suggestedOwner || null;
  return { timestamp: nowIso(), project: 'reportforge', engine: 'performance', status, runtime: { nowMs, performanceNow: win?.performance?.now?.() ?? null, visibilityState: win?.document?.visibilityState ?? null }, eventRate, slowEvents, slowRequests, longTasks, frameGaps, topSlowOperations, correlations, limits: LIMITS, evidence, suggestedOwner, risk, observerStatus: state.observerStatus, sourceState: traceState || 'absent', bundle: bundle ? { status: bundle.status || 'unknown', filename: bundle.filename || null } : null, warnings: warnings ? { status: warnings.status || 'unknown', total: warnings.total || 0 } : null };
}

export function refreshPerformanceSnapshot(context = {}) { state.lastContext = context; snapshot = buildPerformanceSnapshot(context); return snapshot; }
export function clearPerformanceSnapshot() { state.longTasks = []; state.frameGaps = []; state.lastFrameAt = null; state.lastError = null; state.lastContext = {}; snapshot = neutralSnapshot(); snapshot.observerStatus = state.observerStatus; return snapshot; }
export function getPerformanceSnapshot() { return snapshot.timestamp ? snapshot : buildPerformanceSnapshot(state.lastContext || {}); }
export function copyPerformanceJSON() { return JSON.stringify(getPerformanceSnapshot(), null, 2); }
