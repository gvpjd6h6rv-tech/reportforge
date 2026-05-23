'use strict';

import { clone } from './rf-debug-center-state-utils.js';

const LIMITS = Object.freeze({ maxEvents: 96, maxFindings: 20, maxLastEvents: 12, openWindowMs: 1800 });
let snapshot = neutralSnapshot();

function nowIso() { return new Date().toISOString(); }
function toMs(value) { const time = typeof value === 'number' ? value : Date.parse(value || ''); return Number.isFinite(time) ? time : null; }
function clip(value, limit = 120) { const text = value == null ? 'null' : typeof value === 'string' ? value : JSON.stringify(value); return text.length > limit ? `${text.slice(0, limit - 1)}…` : text; }
function neutralSnapshot() { return { timestamp: null, project: 'reportforge', engine: 'async-race', status: 'unknown', activeTransactions: [], completedTransactions: [], raceFindings: [], staleWrites: [], missingEnds: [], lastAsyncEvents: [], risk: { level: 'none', reason: 'no data' }, evidence: [], suggestedOwner: null, sourceState: 'absent', timelineTotal: 0, limits: LIMITS }; }
function txKey(event) { return event?.transactionId || event?.requestId || event?.renderId || null; }
function signature(event) { return [event?.source, event?.module, event?.action, event?.mode, event?.docId || event?.documentId].filter(Boolean).join('|') || 'unknown'; }
function text(event) { return [event?.source, event?.module, event?.action, event?.event, event?.result, event?.error, event?.phase].filter(Boolean).join(' ').toLowerCase(); }
function classify(event) { const s = text(event); return { start: /(?:^|\b)(start|begin|open|request-start|render-start|load-start|hydrate-start|fetch-start|async-start)\b/.test(s), end: /(?:^|\b)(end|done|complete|response|finish|close|resolved|request-end|render-end|load-end|hydrate-end|fetch-end|async-end|reject|error|fail)\b/.test(s), write: /(?:^|\b)(write|render|hydrate|commit|apply|update|patch|mutate|save|set)\b/.test(s) }; }
function normalize(entry, index) {
  const docId = entry?.docId ?? entry?.documentId ?? null;
  const stateRevision = Number.isFinite(Number(entry?.stateRevision)) ? Number(entry.stateRevision) : null;
  return { index: index + 1, timestamp: entry?.timestamp ?? null, source: entry?.source ?? entry?.module ?? 'unknown', module: entry?.module ?? entry?.source ?? 'unknown', action: entry?.action ?? entry?.event ?? 'ui', severity: entry?.severity ?? 'info', eventId: entry?.eventId ?? entry?.id ?? null, transactionId: entry?.transactionId ?? null, requestId: entry?.requestId ?? null, renderId: entry?.renderId ?? null, stateRevision, mode: entry?.mode ?? null, docId, documentId: entry?.documentId ?? null, phase: entry?.phase ?? 'after', result: entry?.result ?? null, error: entry?.error ?? null, ownerExpected: entry?.ownerExpected ?? entry?.owner ?? null, writerActual: entry?.writerActual ?? entry?.writer ?? entry?.fn ?? null, before: clone(entry?.before), after: clone(entry?.after), state: clone(entry?.state), dom: clone(entry?.dom), request: clone(entry?.request), response: clone(entry?.response), raw: clone(entry), summary: `${entry?.source ?? entry?.module ?? 'unknown'} · ${entry?.action ?? entry?.event ?? 'ui'}` };
}
function issue(ruleId, severity, message, tx, requestId, renderId, stateRevision, events, evidence, suggestedOwner) { return { ruleId, severity, message, transactionId: tx || null, requestId: requestId || null, renderId: renderId || null, stateRevision: stateRevision ?? null, events: events.slice(0, 6).map((event) => event.index), evidence: evidence.slice(0, 6).map((item) => clip(item)), suggestedOwner: suggestedOwner || null }; }
function dedupe(findings) { const seen = new Set(); const out = []; for (const finding of findings) { const key = [finding.ruleId, finding.transactionId || finding.requestId || finding.renderId || 'none', finding.message, finding.evidence.join('|')].join('|'); if (seen.has(key)) continue; seen.add(key); out.push({ ...finding, status: 'active' }); } return out.slice(0, LIMITS.maxFindings); }
function summarizeTransaction(tx) { return { key: tx.key, kind: tx.kind, signature: tx.signature, source: tx.source, module: tx.module, action: tx.action, transactionId: tx.transactionId, requestId: tx.requestId, renderId: tx.renderId, startAt: tx.startAt, endAt: tx.endAt, stateRevision: tx.stateRevision ?? null, mode: tx.mode ?? null, docId: tx.docId ?? null, events: tx.events.length, ownerExpected: tx.ownerExpected ?? null, writerActual: tx.writerActual ?? null }; }

export function buildAsyncRaceSnapshot({ timeline = null, traceState = 'absent', bundle = null, warnings = null, previous = snapshot, now = nowIso() } = {}) {
  const events = Array.isArray(timeline?.entries) ? timeline.entries.slice(-LIMITS.maxEvents).map(normalize) : [];
  const nowMs = toMs(now) ?? Date.now();
  const txMap = new Map();
  const findings = [];
  const seenWriteContexts = { mode: null, docId: null };
  let maxStateRevision = null;
  for (const event of events) {
    const key = txKey(event) || `sig:${signature(event)}`;
    const c = classify(event);
    if (c.write && ((seenWriteContexts.mode != null && event.mode != null && event.mode !== seenWriteContexts.mode) || (seenWriteContexts.docId != null && (event.docId ?? event.documentId) != null && (event.docId ?? event.documentId) !== seenWriteContexts.docId))) findings.push(issue('STALE_WRITE_AFTER_MODE_CHANGE', 'warning', 'Stale write after mode change', key, event.requestId, event.renderId, event.stateRevision, [event], [`mode=${event.mode ?? 'n/a'} current=${seenWriteContexts.mode ?? 'n/a'}`, `doc=${event.docId ?? event.documentId ?? 'n/a'} current=${seenWriteContexts.docId ?? 'n/a'}`], event.ownerExpected || event.writerActual || 'tools/rf-debug-center/rf-debug-center-store.js'));
    if (event.mode != null) seenWriteContexts.mode = event.mode;
    if ((event.docId ?? event.documentId) != null) seenWriteContexts.docId = event.docId ?? event.documentId;
    if (event.stateRevision != null) {
      const rev = Number(event.stateRevision);
      if (Number.isFinite(rev) && maxStateRevision != null && rev < maxStateRevision) findings.push(issue('STATE_REVISION_REGRESSION', 'error', `state revision regressed from ${maxStateRevision} to ${rev}`, key, event.requestId, event.renderId, rev, [event], [`stateRevision ${maxStateRevision} -> ${rev}`], event.ownerExpected || event.writerActual || 'tools/rf-debug-center/rf-debug-center-store.js'));
      if (Number.isFinite(rev)) maxStateRevision = maxStateRevision == null ? rev : Math.max(maxStateRevision, rev);
    }
    const tx = txMap.get(key) || { key, signature: signature(event), kind: event.renderId ? 'render' : event.requestId ? 'request' : 'transaction', source: event.source, module: event.module, action: event.action, transactionId: event.transactionId ?? null, requestId: event.requestId ?? null, renderId: event.renderId ?? null, startAt: null, endAt: null, events: [], stateRevision: event.stateRevision ?? null, mode: event.mode ?? null, docId: event.docId ?? event.documentId ?? null, ownerExpected: event.ownerExpected ?? null, writerActual: event.writerActual ?? null };
    tx.events.push(event);
    if (c.start && !tx.startAt) tx.startAt = event.timestamp;
    if (c.end) tx.endAt = event.timestamp;
    if (event.stateRevision != null) tx.stateRevision = event.stateRevision;
    if (event.mode != null) tx.mode = event.mode;
    if ((event.docId ?? event.documentId) != null) tx.docId = event.docId ?? event.documentId;
    if (event.ownerExpected || event.writerActual) { tx.ownerExpected = tx.ownerExpected || event.ownerExpected || null; tx.writerActual = tx.writerActual || event.writerActual || null; }
    txMap.set(key, tx);
  }
  const txs = [...txMap.values()].filter((tx) => tx.startAt).sort((a, b) => (toMs(a.startAt) ?? 0) - (toMs(b.startAt) ?? 0));
  const activeTransactions = [];
  const completedTransactions = [];
  for (const tx of txs) (tx.endAt ? completedTransactions : activeTransactions).push(summarizeTransaction(tx));
  for (let i = 0; i < txs.length; i += 1) for (let j = i + 1; j < txs.length; j += 1) {
    const a = txs[i], b = txs[j];
    const aStart = toMs(a.startAt), aEnd = toMs(a.endAt), bStart = toMs(b.startAt), bEnd = toMs(b.endAt);
    const overlap = aStart != null && aEnd != null && bStart != null && bEnd != null && aStart < bStart && aEnd > bEnd;
    if (!overlap) continue;
    const ruleId = a.kind === 'render' || b.kind === 'render' ? 'RENDER_AFTER_NEWER_RENDER' : 'OUT_OF_ORDER_RESPONSE';
    findings.push(issue(ruleId, 'warning', ruleId === 'RENDER_AFTER_NEWER_RENDER' ? 'Render finished after newer render' : 'Out of order response', ruleId === 'RENDER_AFTER_NEWER_RENDER' ? b.renderId || a.renderId || b.requestId || a.requestId || b.key : b.requestId || a.requestId || b.transactionId || a.transactionId || b.key, b.requestId || a.requestId || null, b.renderId || a.renderId || null, b.stateRevision ?? a.stateRevision ?? null, [a, b], [`${a.signature} ended after ${b.signature}`, `start ${a.startAt} → ${b.startAt}`, `end ${a.endAt} → ${b.endAt}`], a.writerActual || a.ownerExpected || b.writerActual || b.ownerExpected || 'tools/rf-debug-center/rf-debug-center-store.js'));
  }
  for (const tx of txs) {
    const openAge = tx.startAt && !tx.endAt ? nowMs - (toMs(tx.startAt) ?? nowMs) : -1;
    if (openAge > LIMITS.openWindowMs) findings.push(issue('MISSING_END_EVENT', openAge > LIMITS.openWindowMs * 2 ? 'warning' : 'info', 'Missing end event', tx.transactionId || tx.requestId || tx.renderId || tx.key, tx.requestId, tx.renderId, tx.stateRevision, tx.events, [`open for ${openAge}ms`, `signature=${tx.signature}`], tx.writerActual || tx.ownerExpected || 'tools/rf-debug-center/rf-debug-center-store.js'));
    if (tx.endAt) {
      const endMs = toMs(tx.endAt) ?? nowMs;
      for (const event of tx.events) if (event.error && toMs(event.timestamp) != null && toMs(event.timestamp) > endMs) findings.push(issue('LATE_ASYNC_ERROR', 'warning', 'Late async error', tx.transactionId || tx.requestId || tx.renderId || tx.key, event.requestId, event.renderId, event.stateRevision, [event, tx], [`error after end ${tx.endAt}`, `signature=${tx.signature}`], event.ownerExpected || event.writerActual || tx.writerActual || tx.ownerExpected || 'tools/rf-debug-center/rf-debug-center-store.js'));
    }
  }
  const sigBuckets = new Map();
  for (const tx of txs) {
    const list = sigBuckets.get(tx.signature) || [];
    list.push(tx);
    sigBuckets.set(tx.signature, list);
  }
  for (const list of sigBuckets.values()) {
    if (list.length < 2) continue;
    for (let i = 0; i < list.length - 1; i += 1) for (let j = i + 1; j < list.length; j += 1) {
      const a = list[i], b = list[j];
      const aEnd = a.endAt ? toMs(a.endAt) : null;
      const bStart = b.startAt ? toMs(b.startAt) : null;
      if (aEnd != null && bStart != null && aEnd > bStart && a.key !== b.key) findings.push(issue('DUPLICATE_ACTIVE_TRANSACTION', 'warning', 'Duplicate active transaction', b.transactionId || b.requestId || b.renderId || b.key, b.requestId, b.renderId, b.stateRevision, [a, b], [`${a.signature} overlaps active window`, `active ${a.startAt} → ${a.endAt || 'open'}`, `next ${b.startAt} → ${b.endAt || 'open'}`], b.writerActual || b.ownerExpected || a.writerActual || a.ownerExpected || 'tools/rf-debug-center/rf-debug-center-store.js'));
    }
  }
  const deduped = dedupe(findings);
  const raceFindings = deduped.filter((item) => ['OUT_OF_ORDER_RESPONSE', 'RENDER_AFTER_NEWER_RENDER', 'STATE_REVISION_REGRESSION', 'LATE_ASYNC_ERROR', 'DUPLICATE_ACTIVE_TRANSACTION'].includes(item.ruleId));
  const staleWrites = deduped.filter((item) => item.ruleId === 'STALE_WRITE_AFTER_MODE_CHANGE');
  const missingEnds = deduped.filter((item) => item.ruleId === 'MISSING_END_EVENT');
  const evidence = [...new Set(deduped.flatMap((item) => item.evidence || []).concat(warnings?.warnings?.slice(0, 4).flatMap((item) => item.evidence || []) || []).slice(0, 24))];
  const risk = deduped.some((item) => item.severity === 'error') ? { level: 'high', reason: raceFindings[0]?.message || staleWrites[0]?.message || missingEnds[0]?.message || 'async/race evidence found' } : deduped.some((item) => item.severity === 'warning') ? { level: 'medium', reason: raceFindings[0]?.message || staleWrites[0]?.message || missingEnds[0]?.message || 'async/race evidence found' } : deduped.some((item) => item.severity === 'info') ? { level: 'low', reason: missingEnds[0]?.message || 'limited async evidence' } : { level: 'none', reason: 'no data' };
  const status = deduped.some((item) => item.severity === 'error') ? 'error' : deduped.some((item) => item.severity === 'warning') ? 'warning' : deduped.some((item) => item.severity === 'info') ? 'info' : (traceState === 'absent' || traceState === 'invalid') ? 'unknown' : 'ok';
  const suggestedOwner = deduped.find((item) => item.suggestedOwner)?.suggestedOwner || completedTransactions.at(-1)?.writerActual || completedTransactions.at(-1)?.ownerExpected || activeTransactions.at(-1)?.writerActual || activeTransactions.at(-1)?.ownerExpected || null;
  snapshot = { timestamp: now, project: 'reportforge', engine: 'async-race', status, activeTransactions: activeTransactions.slice(0, 12), completedTransactions: completedTransactions.slice(0, 12), raceFindings, staleWrites, missingEnds, lastAsyncEvents: events.slice(-LIMITS.maxLastEvents), risk, evidence, suggestedOwner, sourceState: traceState || 'absent', timelineTotal: timeline?.total || events.length, warnings: warnings ? { status: warnings.status || 'unknown', total: warnings.total || 0 } : null, bundle: bundle ? { status: bundle.status || 'unknown', filename: bundle.filename || null } : null, limits: LIMITS };
  return snapshot;
}

export function refreshAsyncRaceSnapshot(context = {}) { return buildAsyncRaceSnapshot({ ...context, previous: snapshot }); }
export function clearAsyncRaceSnapshot() { snapshot = neutralSnapshot(); return snapshot; }
export function getAsyncRaceSnapshot() { return snapshot; }
export function copyAsyncRaceJSON() { return JSON.stringify(snapshot, null, 2); }
