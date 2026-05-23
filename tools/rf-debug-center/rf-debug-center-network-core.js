'use strict';

import { clip, sanitize } from './rf-debug-center-safe-json.js';

const MAX_REQUESTS = 120;
const MAX_LAST = 12;
const SLOW_MS = 800;
const LEAK_MS = 15_000;
const SENSITIVE = /password|pass|token|authorization|cookie|secret|api[-_]?key|apikey|credential|session|bearer|set-cookie|x-admin-token|csrf|db password|(?:^|[^a-z])key(?:$|[^a-z])/i;

const state = { installed: false, observerStatus: 'disabled', win: null, fetch: null, xhr: null, seq: 0, records: [], redactions: 0, lastInstallAt: null, lastSyncAt: null, lastError: null };

const now = () => new Date().toISOString();
const ms = (value) => Date.parse(value || '') || Date.now();
export const short = (value, limit = 180) => clip(value == null ? '' : String(value), limit);
const headerValue = (headers, name) => { if (!headers) return null; const key = String(name).toLowerCase(); if (typeof headers.get === 'function') return headers.get(name) || headers.get(key) || null; if (Array.isArray(headers)) { const pair = headers.find(([k]) => String(k).toLowerCase() === key); return pair ? pair[1] : null; } if (typeof headers.entries === 'function') { for (const [k, v] of headers.entries()) if (String(k).toLowerCase() === key) return v; } return headers[key] || headers[name] || headers[String(name).toUpperCase()] || null; };
const redact = (key, value, bag) => { if (key && SENSITIVE.test(String(key))) { bag.push(String(key)); return '[REDACTED]'; } return value; };
function safe(value, bag, depth = 0, key = '') {
  if (value == null || typeof value === 'number' || typeof value === 'boolean') return redact(key, value, bag);
  if (typeof value === 'string') return redact(key, short(value), bag);
  if (typeof value === 'function' || typeof value === 'symbol') return short(String(value));
  if (depth > 2) return '[Depth]';
  if (typeof Blob !== 'undefined' && value instanceof Blob) return { kind: 'blob', type: value.type || null, size: value.size || null };
  if (typeof URLSearchParams !== 'undefined' && value instanceof URLSearchParams) {
    const out = {}; for (const [k, v] of value.entries()) out[k] = redact(k, short(v), bag);
    return { kind: 'urlsearchparams', value: out };
  }
  if (typeof FormData !== 'undefined' && value instanceof FormData) {
    const out = {}; for (const [k, v] of value.entries()) out[k] = typeof v === 'string' ? redact(k, short(v), bag) : { kind: v?.type ? 'blob' : typeof v, name: v?.name || null, size: v?.size || null };
    return { kind: 'formdata', value: out };
  }
  if (Array.isArray(value)) return value.slice(0, 12).map((item) => safe(item, bag, depth + 1));
  if (typeof ArrayBuffer !== 'undefined' && (value instanceof ArrayBuffer || ArrayBuffer.isView?.(value))) return { kind: 'binary', size: value.byteLength || value.length || null };
  if (typeof value === 'object') { const out = {}; for (const [k, v] of Object.entries(value)) out[k] = safe(redact(k, v, bag), bag, depth + 1, k); return out; }
  return short(String(value));
}
function classify(path) { const lower = String(path || '').toLowerCase(); if (/designer-preview|\/render\b/.test(lower)) return 'preview/render'; if (/rf-audit/.test(lower)) return 'audit'; if (/\.(?:js|css|map|svg|png|jpe?g|gif|webp|woff2?)$/.test(lower)) return 'asset'; return 'unknown'; }
function ownerFor(path) { const kind = classify(path); if (kind === 'preview/render') return 'engines/PreviewEngineRenderer.js'; if (kind === 'audit') return 'engines/RFAudit.js'; if (kind === 'asset') return 'designer/crystal-reports-designer-v4.html'; return 'tools/rf-debug-center/rf-debug-center-network.js'; }
function shapeUrl(raw, base = state.win?.location?.href || 'http://localhost/') { try { const url = new URL(String(raw), base); const bag = []; const queryKeys = [...new Set([...url.searchParams.keys()].map((key) => short(key, 64)))].slice(0, 12); for (const key of queryKeys) if (SENSITIVE.test(key)) bag.push(key); return { url: `${url.origin}${url.pathname}${queryKeys.length ? `?${queryKeys.join('&')}` : ''}`, path: url.pathname || '/', queryKeys, redactions: bag, category: classify(url.pathname) }; } catch (_) { const text = short(raw); return { url: text, path: text, queryKeys: [], redactions: [], category: classify(text) }; } }
export function textOrJson(text, bag) { const trimmed = short(text, 1000); if ((trimmed.startsWith('{') || trimmed.startsWith('[')) && trimmed.length < 10_000) { try { return safe(JSON.parse(trimmed), bag); } catch (_) {} } return trimmed; }
function bodySummary(body, bag) {
  if (body == null) return { kind: 'none' };
  if (typeof body === 'string') return { kind: 'text', value: textOrJson(body, bag), truncated: body.length > 1000 };
  if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) return safe(body, bag);
  if (typeof FormData !== 'undefined' && body instanceof FormData) return safe(body, bag);
  if (typeof Blob !== 'undefined' && body instanceof Blob) return safe(body, bag);
  if (typeof ArrayBuffer !== 'undefined' && (body instanceof ArrayBuffer || ArrayBuffer.isView?.(body))) return safe(body, bag);
  if (typeof body === 'object') return { kind: 'object', value: safe(body, bag) };
  return { kind: typeof body, value: short(body) };
}
export function startRecord({ source, method, url, body, traceId, headers = null }) {
  const redactions = [];
  const shaped = shapeUrl(url);
  const requestId = traceId || `net-${++state.seq}`;
  const request = { requestId, transactionId: traceId || requestId, source, method: short(method || 'GET').toUpperCase(), url: shaped.url, path: shaped.path, queryKeys: shaped.queryKeys, category: shaped.category, startedAt: now(), requestSummary: bodySummary(body, redactions), responseSummary: null, status: null, ok: null, contentType: headerValue(headers, 'content-type'), durationMs: null, endedAt: null, error: null, sensitiveFieldsRedacted: [...new Set([...redactions, ...shaped.redactions])], asyncRaceMatches: [], ownerExpected: ownerFor(shaped.path), state: 'active' };
  if (headers) request.requestSummary.headers = safe(headers, redactions);
  if (request.contentType) request.requestSummary.contentType = request.contentType;
  state.redactions += request.sensitiveFieldsRedacted.length;
  state.records.push(request);
  trimRecords();
  return request;
}
export function trackRequest(record, patch = {}) {
  if (!record) return null;
  Object.assign(record, patch);
  if (record.status != null) record.ok = record.ok ?? (record.status >= 200 && record.status < 400);
  if (record.error || (record.status != null && record.status >= 400)) record.state = 'failed';
  else if (record.status != null || record.responseSummary != null) record.state = 'completed';
  record.endedAt = record.endedAt || now();
  record.durationMs = record.durationMs ?? Math.max(0, ms(record.endedAt) - ms(record.startedAt));
  return record;
}
function trimRecords() { while (state.records.length > MAX_REQUESTS) { const index = state.records.findIndex((record) => record.state !== 'active'); if (index < 0) break; state.records.splice(index, 1); } }
function shapeRecord(record, nowMs, asyncRace = null) { const shaped = sanitize({ ...record }); shaped.ageMs = record.state === 'active' ? Math.max(0, nowMs - ms(record.startedAt)) : null; if (asyncRace?.raceFindings?.length) shaped.asyncRaceMatches = asyncRace.raceFindings.filter((finding) => finding.requestId === record.requestId || finding.transactionId === record.transactionId).map((finding) => finding.ruleId).slice(0, 4); return shaped; }
function activeSnapshot(asyncRace) { const nowMs = Date.now(); return state.records.filter((record) => record.state === 'active').map((record) => shapeRecord(record, nowMs, asyncRace)); }
function completedSnapshot(asyncRace) { const nowMs = Date.now(); return state.records.filter((record) => record.state === 'completed').map((record) => shapeRecord(record, nowMs, asyncRace)); }
function failedSnapshot(asyncRace) { const nowMs = Date.now(); return state.records.filter((record) => record.state === 'failed').map((record) => shapeRecord(record, nowMs, asyncRace)); }
function slowSnapshot(asyncRace) { const nowMs = Date.now(); return state.records.filter((record) => (record.durationMs || 0) >= SLOW_MS || (record.state === 'active' && nowMs - ms(record.startedAt) >= LEAK_MS)).map((record) => shapeRecord(record, nowMs, asyncRace)); }
function lastSnapshot(asyncRace) { return state.records.slice(-MAX_LAST).map((record) => shapeRecord(record, Date.now(), asyncRace)); }
function riskFrom(snapshot) { if (snapshot.failedRequests.length) return { level: 'high', reason: `${snapshot.failedRequests.length} failed request(s)` }; if (snapshot.slowRequests.length) return { level: 'medium', reason: `${snapshot.slowRequests.length} slow/leaked request(s)` }; if (snapshot.redactions > 0) return { level: 'low', reason: `${snapshot.redactions} redaction(s) applied` }; if (snapshot.observerStatus !== 'installed' && snapshot.counters.total === 0) return { level: 'none', reason: 'observer idle' }; return { level: 'none', reason: snapshot.counters.total ? 'network healthy' : 'no requests yet' }; }
export function buildNetworkSnapshot({ traceState = 'absent', timeline = null, asyncRace = null, bundle = null, active = false } = {}) {
  const activeRequests = activeSnapshot(asyncRace);
  const completedRequests = completedSnapshot(asyncRace);
  const failedRequests = failedSnapshot(asyncRace);
  const slowRequests = slowSnapshot(asyncRace);
  const lastRequests = lastSnapshot(asyncRace);
  const snapshot = { timestamp: now(), project: 'reportforge', engine: 'network', status: 'unknown', observerStatus: state.observerStatus, activeRequests, completedRequests, failedRequests, slowRequests, lastRequests, counters: { total: state.records.length, active: activeRequests.length, completed: completedRequests.length, failed: failedRequests.length, slow: slowRequests.length }, risk: { level: 'none', reason: 'no requests' }, evidence: [], suggestedOwner: null, redactions: state.redactions, traceState, timeline: sanitize(timeline), bundle: sanitize(bundle), lastSyncAt: state.lastSyncAt, lastError: state.lastError };
  if (failedRequests.length) snapshot.evidence.push(failedRequests[0].path || failedRequests[0].url, `failed=${failedRequests[0].status ?? 'error'}`);
  if (slowRequests.length) snapshot.evidence.push(slowRequests[0].path || slowRequests[0].url, `duration=${slowRequests[0].durationMs ?? slowRequests[0].ageMs ?? 0}`);
  if (activeRequests.some((item) => (item.ageMs || 0) >= LEAK_MS)) snapshot.evidence.push('active leak');
  if (state.observerStatus !== 'installed') snapshot.evidence.push(`observer=${state.observerStatus}`);
  snapshot.suggestedOwner = failedRequests[0]?.ownerExpected || slowRequests[0]?.ownerExpected || (state.observerStatus !== 'installed' ? 'tools/rf-debug-center/rf-debug-center-network.js' : null);
  snapshot.risk = riskFrom(snapshot);
  if (failedRequests.length) snapshot.status = failedRequests.some((item) => (item.status || 0) >= 500 || item.error) ? 'error' : 'warning';
  else if (slowRequests.length || activeRequests.some((item) => (item.ageMs || 0) >= LEAK_MS)) snapshot.status = 'warning';
  else if (state.observerStatus !== 'installed' && active) snapshot.status = 'unknown';
  else if (state.records.length) snapshot.status = 'ok';
  else snapshot.status = 'unknown';
  return snapshot;
}
export function refreshNetworkSnapshot({ traceState = 'absent', timeline = null, asyncRace = null, bundle = null, active = false } = {}) { state.lastSyncAt = now(); return buildNetworkSnapshot({ traceState, timeline, asyncRace, bundle, active }); }
export function clearNetworkSnapshot() { state.records = []; state.redactions = 0; state.lastError = null; state.lastSyncAt = now(); return buildNetworkSnapshot({ traceState: 'absent', active: false }); }
export function getNetworkSnapshot(options = {}) { return buildNetworkSnapshot(options); }
export function copyNetworkJSON() { return JSON.stringify(buildNetworkSnapshot({ traceState: 'absent' }), null, 2); }
export function buildNetworkSnapshotPublic(options = {}) { return buildNetworkSnapshot(options); }
export function setNetworkObserverState(patch = {}) { Object.assign(state, patch); return buildNetworkSnapshot(); }
export function getNetworkObserverState() { return { installed: state.installed, observerStatus: state.observerStatus, win: state.win, fetch: state.fetch, xhr: state.xhr, lastInstallAt: state.lastInstallAt, lastError: state.lastError }; }
