'use strict';

const LIMITS = Object.freeze({
  maxEvents: 96,
  maxFindings: 24,
  maxLastEvents: 12,
  stormThreshold: 6,
  repeatThreshold: 5,
  loopRepeatThreshold: 3,
  stormWindowMs: 1000,
  heartbeatGapMs: 1800,
  growthSpikeMs: 1000,
  growthSpikeDelta: 20,
});

let snapshot = neutralSnapshot();

function nowIso() { return new Date().toISOString(); }
function toMs(value) { const time = typeof value === 'number' ? value : Date.parse(value || ''); return Number.isFinite(time) ? time : null; }
function clip(value, limit = 120) {
  if (value == null) return null;
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}
function neutralSnapshot() {
  return { timestamp: null, project: 'reportforge', engine: 'loop-freeze', status: 'unknown', heartbeat: { lastBeatAt: null, gapMs: null, thresholdMs: LIMITS.heartbeatGapMs }, eventStorms: [], repeatedHandlers: [], possibleLoops: [], lastEvents: [], risk: { level: 'none', reason: 'no data' }, evidence: [], suggestedOwner: null, sourceState: 'absent', timelineTotal: 0, limits: LIMITS };
}
function fingerprint(entry) { return [entry?.source, entry?.module, entry?.action].filter(Boolean).join('|') || 'unknown'; }
function normalize(entry, index) {
  return {
    index: index + 1,
    timestamp: entry?.timestamp ?? null,
    source: entry?.source ?? entry?.module ?? 'unknown',
    module: entry?.module ?? entry?.source ?? 'unknown',
    action: entry?.action ?? entry?.event ?? 'ui',
    severity: entry?.severity ?? 'info',
    durationMs: Number.isFinite(Number(entry?.durationMs)) ? Number(entry.durationMs) : null,
    ownerExpected: entry?.ownerExpected ?? entry?.owner ?? null,
    writerActual: entry?.writerActual ?? entry?.writer ?? entry?.fn ?? null,
    summary: clip(`${entry?.source ?? entry?.module ?? 'unknown'} · ${entry?.action ?? entry?.event ?? 'ui'}`),
  };
}
function issue(code, severity, title, message, evidence, ownerExpected, source) {
  return { code, severity, title, message, evidence: (evidence || []).map((item) => clip(item)).filter(Boolean).slice(0, 6), ownerExpected, source, status: 'active' };
}
function dedupe(findings) {
  const seen = new Set();
  const out = [];
  for (const finding of findings) {
    const key = [finding.code, finding.source, finding.message, (finding.evidence || []).join('|')].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(finding);
  }
  return out.slice(0, LIMITS.maxFindings);
}
function detectStorms(events) {
  const storms = [];
  const buckets = new Map();
  for (const event of events) {
    const key = fingerprint(event);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(event);
  }
  for (const [key, list] of buckets) {
    if (list.length < LIMITS.stormThreshold) continue;
    const times = list.map((item) => toMs(item.timestamp)).filter((value) => value != null);
    const span = times.length ? Math.max(...times) - Math.min(...times) : 0;
    if (times.length && span > LIMITS.stormWindowMs) continue;
    const last = list.at(-1) || {};
    storms.push(issue('EVENT_STORM', 'warning', 'Event storm', `${key} repeated ${list.length} times`, [`count=${list.length}`, `windowMs=${times.length ? span : 'n/a'}`], last.ownerExpected || last.writerActual || null, last.source || 'rf-debug-center'));
  }
  return storms;
}
function detectRepeated(events) {
  const tail = [];
  for (let i = events.length - 1; i >= 0 && tail.length < LIMITS.maxLastEvents; i -= 1) {
    tail.unshift(events[i]);
  }
  const last = tail.at(-1);
  if (!last) return [];
  const key = fingerprint(last);
  let run = 0;
  for (let i = tail.length - 1; i >= 0; i -= 1) {
    if (fingerprint(tail[i]) !== key) break;
    run += 1;
  }
  if (run < LIMITS.repeatThreshold) return [];
  return [issue('REPEATED_HANDLER', 'warning', 'Repeated handler', `${key} repeated ${run} times consecutively`, [`run=${run}`, `fingerprint=${key}`], last.ownerExpected || last.writerActual || null, last.source || 'rf-debug-center')];
}
function detectLoops(events) {
  const fps = events.map(fingerprint);
  for (const size of [2, 3, 4]) {
    const needed = size * LIMITS.loopRepeatThreshold;
    if (fps.length < needed) continue;
    const tail = fps.slice(-needed);
    const pattern = tail.slice(0, size);
    let match = true;
    for (let offset = size; offset < tail.length; offset += size) {
      for (let i = 0; i < size; i += 1) {
        if (tail[offset + i] !== pattern[i]) { match = false; break; }
      }
      if (!match) break;
    }
    if (!match) continue;
    const last = events.at(-1) || {};
    return [issue('POSSIBLE_LOOP_PATTERN', 'warning', 'Possible loop pattern', `${pattern.join(' → ')} repeated ${LIMITS.loopRepeatThreshold} times`, [`pattern=${pattern.join(' -> ')}`, `repeats=${LIMITS.loopRepeatThreshold}`], last.ownerExpected || last.writerActual || null, last.source || 'rf-debug-center')];
  }
  return [];
}
function detectGrowth(previous, total, nowMs) {
  const previousTotal = Number(previous?.timelineTotal ?? previous?.lastKnownTotal ?? 0);
  const previousAt = toMs(previous?.timestamp);
  const deltaMs = previousAt != null ? Math.max(0, nowMs - previousAt) : null;
  if (previousTotal === 0 || deltaMs == null || deltaMs > LIMITS.growthSpikeMs) return [];
  const delta = total - previousTotal;
  if (delta < LIMITS.growthSpikeDelta) return [];
  return [issue('TIMELINE_GROWTH_SPIKE', delta > LIMITS.growthSpikeDelta * 2 ? 'warning' : 'info', 'Timeline growth spike', `timeline grew by ${delta} events in ${deltaMs}ms`, [`delta=${delta}`, `deltaMs=${deltaMs}`], null, 'tools/rf-debug-center/rf-debug-center-store.js')];
}
function detectHeartbeat(timeline, traceState, nowMs, previous) {
  const lastBeatAt = timeline?.lastSyncAt || timeline?.lastEvent?.timestamp || previous?.heartbeat?.lastBeatAt || null;
  const beatMs = toMs(lastBeatAt);
  const gapMs = beatMs == null ? null : Math.max(0, nowMs - beatMs);
  const thresholdMs = LIMITS.heartbeatGapMs;
  const findings = [];
  if (gapMs != null && traceState !== 'absent' && traceState !== 'invalid' && gapMs > thresholdMs) {
    findings.push(issue('HEARTBEAT_GAP', gapMs > thresholdMs * 2 ? 'error' : 'warning', 'Heartbeat gap', `last heartbeat gap ${gapMs}ms`, [`lastBeatAt=${lastBeatAt}`, `gapMs=${gapMs}`, `thresholdMs=${thresholdMs}`], null, 'tools/rf-debug-center/rf-debug-center-store.js'));
  }
  return { heartbeat: { lastBeatAt, gapMs, thresholdMs }, findings };
}
export function buildLoopFreezeSnapshot({ timeline = null, traceState = 'absent', bundle = null, warnings = null, previous = snapshot, now = nowIso() } = {}) {
  const nowMs = toMs(now) ?? Date.now();
  const events = Array.isArray(timeline?.entries) ? timeline.entries.slice(-LIMITS.maxEvents).map(normalize) : [];
  const lastEvents = events.slice(-LIMITS.maxLastEvents);
  const stormFindings = detectStorms(events);
  const repeatedFindings = detectRepeated(events);
  const loopFindings = detectLoops(events);
  const growthFindings = detectGrowth(previous, timeline?.total || events.length, nowMs);
  const { heartbeat, findings: heartbeatFindings } = detectHeartbeat(timeline, traceState, nowMs, previous);
  const findings = dedupe([...stormFindings, ...repeatedFindings, ...loopFindings, ...growthFindings, ...heartbeatFindings]);
  const eventStorms = findings.filter((item) => item.code === 'EVENT_STORM');
  const repeatedHandlers = findings.filter((item) => item.code === 'REPEATED_HANDLER');
  const possibleLoops = findings.filter((item) => item.code === 'POSSIBLE_LOOP_PATTERN');
  const evidence = dedupe([...findings, ...(warnings?.warnings || []).slice(0, 4).map((item) => issue(item.ruleId || 'warning', item.severity || 'info', item.title || 'warning', item.message || '', item.evidence || [], item.suggestedOwner || null, item.source || 'rf-debug-center'))]).flatMap((item) => item.evidence).slice(0, 24);
  const risk = possibleLoops.length || (heartbeat.gapMs != null && heartbeat.gapMs > heartbeat.thresholdMs * 2) ? { level: 'high', reason: possibleLoops[0]?.message || 'heartbeat gap exceeded threshold' } : repeatedHandlers.length || eventStorms.length ? { level: 'medium', reason: eventStorms[0]?.message || repeatedHandlers[0]?.message || 'repeated activity detected' } : growthFindings.length ? { level: 'low', reason: growthFindings[0]?.message || 'timeline growth spike' } : { level: findings.length ? 'low' : 'none', reason: findings.length ? 'observed activity without critical loop risk' : 'no data' };
  const status = findings.some((item) => item.severity === 'error') ? 'error' : findings.some((item) => item.severity === 'warning') ? 'warning' : findings.length ? 'info' : (traceState === 'absent' || traceState === 'invalid') ? 'unknown' : 'ok';
  const suggestedOwner = findings.find((item) => item.ownerExpected)?.ownerExpected || lastEvents.at(-1)?.ownerExpected || lastEvents.at(-1)?.writerActual || null;
  snapshot = { timestamp: now, project: 'reportforge', engine: 'loop-freeze', status, heartbeat, eventStorms, repeatedHandlers, possibleLoops, lastEvents, risk, evidence, suggestedOwner, sourceState: traceState || 'absent', timelineTotal: timeline?.total || events.length, warnings: warnings ? { status: warnings.status || 'unknown', total: warnings.total || 0 } : null, bundle: bundle ? { status: bundle.status || 'unknown', filename: bundle.filename || null } : null, limits: LIMITS };
  return snapshot;
}
export function refreshLoopFreezeSnapshot(context = {}) { return buildLoopFreezeSnapshot({ ...context, previous: snapshot }); }
export function clearLoopFreezeSnapshot() { snapshot = neutralSnapshot(); return snapshot; }
export function getLoopFreezeSnapshot() { return snapshot; }
export function copyLoopFreezeJSON() { return JSON.stringify(snapshot, null, 2); }
