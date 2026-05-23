'use strict';
import { LIMITS, addSignals, now, ownerFor, owners, registry, sourceMeta, uniq } from './rf-debug-center-causal-intelligence-kit.js';

const neutralSnapshot = () => ({ timestamp: null, project: 'reportforge', engine: 'causal-intelligence', status: 'unknown', summary: { bugsSuspected: 0, critical: 0, warnings: 0, unknown: 0, evidenceChains: 0 }, diagnoses: [], invariants: [], evidenceChains: [], ownershipViolations: [], unknowns: [], confidence: { overall: 'unknown', reason: 'no data' }, recommendations: [], limits: LIMITS });
const state = { lastContext: null, snapshot: neutralSnapshot() };
function collectSignals(ctx) {
  const signals = [];
  addSignals(signals, 'loopFreeze', 'loop', 'frontend-state', ctx.loopFreeze?.eventStorms, (item) => ({ ruleId: 'LOOP_EVENT_STORM', severity: item.severity || 'warning', message: item.message || 'Event storm', ownerExpected: ownerFor('loopFreeze', item.ownerExpected || ctx.loopFreeze?.suggestedOwner, ctx.ownership), writerActual: item.writerActual || null, evidence: item.evidence || ctx.loopFreeze?.evidence || [], target: item.source || 'loopFreeze', selector: item.source || 'loopFreeze', eventId: item.eventId || null, timestamp: ctx.loopFreeze?.timestamp || null }));
  addSignals(signals, 'loopFreeze', 'loop', 'frontend-state', ctx.loopFreeze?.possibleLoops, (item) => ({ ruleId: 'LOOP_PATTERN', severity: item.severity || 'warning', message: item.message || 'Possible loop pattern', ownerExpected: ownerFor('loopFreeze', item.ownerExpected || ctx.loopFreeze?.suggestedOwner, ctx.ownership), writerActual: item.writerActual || null, evidence: item.evidence || ctx.loopFreeze?.evidence || [], target: item.source || 'loopFreeze', selector: item.source || 'loopFreeze', timestamp: ctx.loopFreeze?.timestamp || null }));
  addSignals(signals, 'performance', 'performance', 'frontend-state', ctx.performance?.frameGaps, (item) => ({ ruleId: 'FRAME_GAP', severity: item.severity || 'warning', message: item.label || 'Frame gap', ownerExpected: ownerFor('performance', ctx.performance?.suggestedOwner, ctx.ownership), writerActual: item.writerActual || null, evidence: item.evidence || ctx.performance?.evidence || [], target: item.source || 'performance', selector: item.path || 'performance', timestamp: item.timestamp || ctx.performance?.timestamp || null }));
  addSignals(signals, 'performance', 'performance', 'frontend-state', ctx.performance?.slowEvents, (item) => ({ ruleId: 'SLOW_EVENT', severity: item.severity || 'warning', message: item.label || 'Slow event', ownerExpected: ownerFor('performance', ctx.performance?.suggestedOwner, ctx.ownership), writerActual: item.writerActual || null, evidence: item.evidence || ctx.performance?.evidence || [], target: item.source || 'performance', selector: item.path || 'performance', requestId: item.requestId || null, renderId: item.renderId || null, transactionId: item.transactionId || null, timestamp: item.timestamp || ctx.performance?.timestamp || null }));
  addSignals(signals, 'performance', 'performance', 'frontend-state', ctx.performance?.slowRequests, (item) => ({ ruleId: 'SLOW_REQUEST', severity: item.severity || 'warning', message: item.label || 'Slow request', ownerExpected: ownerFor('network', ctx.performance?.suggestedOwner, ctx.ownership), writerActual: item.writerActual || null, evidence: item.evidence || ctx.performance?.evidence || [], target: item.path || item.url || 'network', selector: item.path || item.url || 'network', requestId: item.requestId || null, timestamp: item.timestamp || ctx.performance?.timestamp || null }));
  addSignals(signals, 'asyncRace', 'async-race', 'frontend-state', ctx.asyncRace?.raceFindings, (item) => ({ ruleId: item.ruleId || 'ASYNC_RACE', severity: item.severity || 'warning', message: item.message || 'Async/race finding', ownerExpected: ownerFor('asyncRace', item.suggestedOwner || ctx.asyncRace?.suggestedOwner, ctx.ownership), writerActual: item.writerActual || null, evidence: item.evidence || ctx.asyncRace?.evidence || [], target: item.renderId || item.requestId || 'async', selector: item.renderId || item.requestId || item.transactionId || 'async', requestId: item.requestId || null, renderId: item.renderId || null, transactionId: item.transactionId || null, timestamp: item.timestamp || ctx.asyncRace?.timestamp || null }));
  addSignals(signals, 'asyncRace', 'async-race', 'frontend-state', ctx.asyncRace?.staleWrites, (item) => ({ ruleId: item.ruleId || 'STALE_WRITE', severity: item.severity || 'warning', message: item.message || 'Stale write', ownerExpected: ownerFor('asyncRace', item.suggestedOwner || ctx.asyncRace?.suggestedOwner, ctx.ownership), writerActual: item.writerActual || null, evidence: item.evidence || ctx.asyncRace?.evidence || [], target: item.renderId || item.requestId || 'async', selector: item.renderId || item.requestId || item.transactionId || 'async', requestId: item.requestId || null, renderId: item.renderId || null, transactionId: item.transactionId || null, timestamp: item.timestamp || ctx.asyncRace?.timestamp || null }));
  addSignals(signals, 'asyncRace', 'async-race', 'frontend-state', ctx.asyncRace?.missingEnds, (item) => ({ ruleId: item.ruleId || 'MISSING_END', severity: item.severity || 'info', message: item.message || 'Missing end event', ownerExpected: ownerFor('asyncRace', item.suggestedOwner || ctx.asyncRace?.suggestedOwner, ctx.ownership), writerActual: item.writerActual || null, evidence: item.evidence || ctx.asyncRace?.evidence || [], target: item.renderId || item.requestId || 'async', selector: item.renderId || item.requestId || item.transactionId || 'async', requestId: item.requestId || null, renderId: item.renderId || null, transactionId: item.transactionId || null, timestamp: item.timestamp || ctx.asyncRace?.timestamp || null }));
  addSignals(signals, 'network', 'backend', 'network', ctx.network?.failedRequests, (item) => ({ ruleId: 'NETWORK_FAILED', severity: (item.status || 0) >= 500 || item.error ? 'error' : 'warning', message: 'Network request failed', ownerExpected: ownerFor('network', item.ownerExpected || ctx.network?.suggestedOwner, ctx.ownership), writerActual: item.writerActual || null, evidence: [`${item.method || 'GET'} ${item.path || item.url || 'unknown'}`, `status=${item.status ?? 'error'}`, item.error || null].filter(Boolean), target: item.path || item.url || 'network', selector: item.path || item.url || 'network', requestId: item.requestId || null, timestamp: item.timestamp || ctx.network?.timestamp || null }));
  addSignals(signals, 'network', 'backend', 'network', ctx.network?.slowRequests, (item) => ({ ruleId: 'NETWORK_SLOW', severity: 'warning', message: 'Network request slow', ownerExpected: ownerFor('network', item.ownerExpected || ctx.network?.suggestedOwner, ctx.ownership), writerActual: item.writerActual || null, evidence: item.evidence || [`duration=${item.durationMs ?? item.ageMs ?? 0}`], target: item.path || item.url || 'network', selector: item.path || item.url || 'network', requestId: item.requestId || null, timestamp: item.timestamp || ctx.network?.timestamp || null }));
  addSignals(signals, 'renderPreview', 'ui-visual', 'render', ctx.renderPreview?.findings, (item) => ({ ruleId: item.code || 'RENDER_PREVIEW', severity: item.severity || 'warning', message: item.message || 'Render/preview finding', ownerExpected: ownerFor('renderPreview', item.ownerExpected || ctx.renderPreview?.suggestedOwner, ctx.ownership), writerActual: item.writerActual || null, evidence: item.evidence || [], target: item.node || item.selector || 'preview', selector: item.selector || item.node || 'preview', path: item.selector || null, timestamp: ctx.renderPreview?.timestamp || null }));
  addSignals(signals, 'domScanner', 'dom', 'dom', ctx.domScanner?.findings, (item) => ({ ruleId: item.ruleId || item.code || 'DOM_FINDING', severity: item.severity || 'warning', message: item.message || item.title || 'DOM finding', ownerExpected: ownerFor('domScanner', item.suggestedOwner || item.ownerExpected || ctx.domScanner?.suggestedOwner, ctx.ownership), writerActual: item.writerActual || null, evidence: item.evidence || [], target: item.target || item.selector || 'dom', selector: item.selector || item.target || 'dom', timestamp: ctx.domScanner?.timestamp || null }));
  addSignals(signals, 'selection', 'selection', 'dom', ctx.selection?.findings, (item) => ({ ruleId: item.code || 'SELECTION_FINDING', severity: item.severity || 'warning', message: item.message || 'Selection finding', ownerExpected: ownerFor('selection', item.ownerExpected || ctx.selection?.suggestedOwner, ctx.ownership), writerActual: item.writerActual || null, evidence: item.evidence ? [item.evidence] : [], target: item.node || item.selector || 'selection', selector: item.selector || item.node || 'selection', timestamp: ctx.selection?.timestamp || null }));
  addSignals(signals, 'zoom', 'logic', 'frontend-state', ctx.zoom?.divergences, (item) => ({ ruleId: item || 'ZOOM_DIVERGENCE', severity: ctx.zoom?.status === 'error' ? 'error' : 'warning', message: 'Zoom divergence', ownerExpected: ownerFor('zoom', ctx.zoom?.suggestedOwner, ctx.ownership), evidence: ctx.zoom?.evidence || [], target: ctx.zoom?.dom?.targetSelector || 'zoom', selector: ctx.zoom?.dom?.targetSelector || 'zoom', timestamp: ctx.zoom?.timestamp || null }));
  addSignals(signals, 'visualEvidence', 'ui-visual', 'dom', ctx.visualEvidence?.records?.filter?.((item) => ['failed', 'skipped'].includes(item.status)), (item) => ({ ruleId: item.reason || 'VISUAL_EVIDENCE', severity: item.status === 'failed' ? 'error' : 'warning', message: item.reason || 'Visual evidence issue', ownerExpected: ownerFor('visualEvidence', ctx.visualEvidence?.suggestedOwner, ctx.ownership), evidence: [item.reason, item.selector, item.target].filter(Boolean), target: item.target || 'visual', selector: item.selector || item.target || 'visual', timestamp: item.timestamp || ctx.visualEvidence?.lastCaptureAt || null }));
  addSignals(signals, 'warnings', 'logic', 'state', ctx.warnings?.warnings, (item) => ({ ruleId: item.ruleId || item.code || 'WARNING', severity: item.severity || 'info', message: item.message || item.title || 'Warning', ownerExpected: ownerFor('warnings', item.suggestedOwner || null, ctx.ownership), writerActual: item.writerActual || null, evidence: item.evidence || [], target: item.source || 'warnings', selector: item.source || item.ruleId || 'warnings', timestamp: item.timestamp || ctx.warnings?.timestamp || null }));
  return signals.filter((item) => item.ruleId);
}
function scoreConfidence(signals, corroborated = false) {
  const sources = new Set(signals.map((item) => item.source).filter(Boolean));
  if (!signals.length) return 'unknown';
  if (sources.size >= 2 && corroborated) return 'high';
  if (sources.size >= 2) return 'medium';
  return 'low';
}
function diagnosis(id, family, severity, title, message, signals, invariant, nextAction, ctx, extras = {}) {
  const ownerExpected = extras.ownerExpected || signals.find((item) => item.ownerExpected)?.ownerExpected || null;
  const writerActual = extras.writerActual || signals.find((item) => item.writerActual)?.writerActual || null;
  const evidence = uniq(signals.flatMap((item) => item.evidence || []).concat(extras.evidence || [])).slice(0, LIMITS.maxEvidencePerDiagnosis);
  return { id, timestamp: ctx.timestamp || now(), bugFamily: family, severity, title, message, causalChain: signals.map((item) => item.id), evidence, layer: extras.layer || signals[0]?.layer || 'unknown', ownerExpected, writerActual, invariant, confidence: scoreConfidence(signals, extras.corroborated), nextAction, doNotPatchYet: true };
}
function chain(name, signals, ctx, result = 'suspected') {
  const sources = uniq(signals.map((item) => item.source));
  const ids = uniq(signals.map((item) => item.id));
  return { id: `chain:${name}:${ids.join(':') || 'empty'}`, name, events: signals.map((item) => ({ id: item.id, source: item.source, ruleId: item.ruleId, severity: item.severity, selector: item.selector, path: item.path, requestId: item.requestId, transactionId: item.transactionId, renderId: item.renderId, eventId: item.eventId, ownerExpected: item.ownerExpected, writerActual: item.writerActual })), snapshots: sources.map((source) => sourceMeta(source, ctx[source])), result, confidence: scoreConfidence(signals, result === 'confirmed') };
}
function invariantRecord(def, ctx, evidence, violated = true) { return { id: def.id, project: def.project, description: def.description, appliesWhen: def.appliesWhen, severity: def.severity, ownerExpected: def.ownerExpected, evidenceRequired: def.evidenceRequired, violated, evidence: evidence.slice(0, LIMITS.maxEvidencePerDiagnosis), result: violated ? 'violated' : 'ok' }; }
function evaluateInvariants(ctx, signals) {
  const out = [];
  const hasPreviewSuccess = !!ctx.renderPreview?.network?.previewRequests?.some((item) => (item.ok ?? true) && (item.status == null || (item.status >= 200 && item.status < 400)));
  const emptyPreview = (ctx.renderPreview?.previewDom?.pageCount ?? 0) === 0 && !!ctx.renderPreview?.previewDom?.contentExists;
  const blockedControl = signals.some((item) => ['DOM_BLOCKED_BY_OVERLAY', 'DOM_POINTER_EVENTS_NONE'].includes(item.ruleId));
  const selectionDrift = signals.some((item) => ['MODEL_DOM_POSITION_DRIFT', 'MODEL_DOM_SIZE_DRIFT'].includes(item.ruleId));
  const asyncOutOfOrder = signals.some((item) => ['RENDER_AFTER_NEWER_RENDER', 'OUT_OF_ORDER_RESPONSE', 'STATE_REVISION_REGRESSION', 'STALE_WRITE', 'STALE_WRITE_AFTER_MODE_CHANGE'].includes(item.ruleId));
  const highEventGap = !!ctx.performance?.frameGaps?.length && ((ctx.performance?.eventRate?.perSecond || 0) > (ctx.performance?.limits?.eventRateThreshold || 12) || !!ctx.loopFreeze?.eventStorms?.length);
  const backendFailed = !!ctx.network?.failedRequests?.length && (emptyPreview || !!ctx.renderPreview?.findings?.length || !!ctx.domScanner?.findings?.length);
  const warningCluster = (ctx.warnings?.warnings || []).length >= 2 && new Set((ctx.warnings?.warnings || []).map((item) => item.source || item.ruleId)).size >= 2;
  const ownerMissing = signals.some((item) => item.ownerExpected && !item.writerActual);
  if (hasPreviewSuccess && emptyPreview) out.push(invariantRecord(registry[0], ctx, ['preview request ok', 'preview page count 0'], true));
  if (blockedControl) out.push(invariantRecord(registry[1], ctx, signals.filter((item) => ['DOM_BLOCKED_BY_OVERLAY', 'DOM_POINTER_EVENTS_NONE'].includes(item.ruleId)).flatMap((item) => item.evidence), true));
  if (asyncOutOfOrder) out.push(invariantRecord(registry[2], ctx, signals.filter((item) => ['RENDER_AFTER_NEWER_RENDER', 'OUT_OF_ORDER_RESPONSE', 'STATE_REVISION_REGRESSION', 'STALE_WRITE', 'STALE_WRITE_AFTER_MODE_CHANGE'].includes(item.ruleId)).flatMap((item) => item.evidence), true));
  if (highEventGap) out.push(invariantRecord(registry[3], ctx, uniq([ctx.performance?.eventRate?.perSecond ? `perSecond=${ctx.performance.eventRate.perSecond}` : null, ...(ctx.performance?.frameGaps || []).slice(0, 1).flatMap((item) => item.evidence || []), ...(ctx.loopFreeze?.eventStorms || []).slice(0, 1).flatMap((item) => item.evidence || [])]), true));
  if (backendFailed) out.push(invariantRecord(registry[4], ctx, uniq([...(ctx.network?.failedRequests || []).slice(0, 2).flatMap((item) => item.evidence || []), ...(ctx.renderPreview?.findings || []).slice(0, 2).flatMap((item) => item.evidence || []), ...(ctx.domScanner?.findings || []).slice(0, 2).flatMap((item) => item.evidence || [])]), true));
  if (selectionDrift) out.push(invariantRecord(registry[5], ctx, signals.filter((item) => ['MODEL_DOM_POSITION_DRIFT', 'MODEL_DOM_SIZE_DRIFT'].includes(item.ruleId)).flatMap((item) => item.evidence), true));
  if (hasPreviewSuccess && emptyPreview) out.push(invariantRecord(registry[6], ctx, ['preview request ok', 'preview page count 0'], true));
  if (warningCluster) out.push(invariantRecord(registry[7], ctx, (ctx.warnings?.warnings || []).slice(0, 4).flatMap((item) => item.evidence || []), true));
  if (ownerMissing) out.push(invariantRecord(registry[8], ctx, signals.filter((item) => item.ownerExpected && !item.writerActual).flatMap((item) => [item.ownerExpected, item.writerActual, ...item.evidence]), true));
  if (signals.length && !out.length) out.push({ ...invariantRecord(registry[9], ctx, ['signals present', 'corroboration insufficient'], true), severity: 'info' });
  return out.slice(0, LIMITS.maxDiagnoses);
}
function buildDiagnoses(ctx, signals, invariants) {
  const out = [];
  const loopSignals = signals.filter((item) => item.source === 'loopFreeze' || item.ruleId === 'FRAME_GAP');
  if (ctx.loopFreeze?.eventStorms?.length || ctx.loopFreeze?.possibleLoops?.length || ctx.performance?.frameGaps?.length) out.push(diagnosis('loop-freeze', 'loop', ctx.loopFreeze?.possibleLoops?.length ? 'error' : 'warning', 'Loop/freeze causal correlation', 'Loop activity correlates with performance frame gaps and repeated events', loopSignals, 'HIGH_EVENT_RATE_WITH_FRAME_GAP', 'Inspect loop storms and frame gaps before patching', ctx, { layer: 'frontend-state', corroborated: new Set(loopSignals.map((item) => item.source)).size >= 2 }));
  const perfSignals = signals.filter((item) => item.source === 'performance' || item.ruleId === 'SLOW_REQUEST' || item.ruleId === 'SLOW_EVENT');
  if (ctx.performance?.slowEvents?.length || ctx.performance?.slowRequests?.length || ctx.performance?.longTasks?.length || ctx.performance?.frameGaps?.length || ctx.network?.slowRequests?.length) out.push(diagnosis('performance', 'performance', (ctx.performance?.slowEvents?.length || ctx.performance?.slowRequests?.length || ctx.performance?.longTasks?.length || ctx.performance?.frameGaps?.length) > 0 ? 'warning' : 'info', 'Performance causal correlation', 'Slow operations and frame gaps indicate performance pressure', perfSignals, 'HIGH_EVENT_RATE_WITH_FRAME_GAP', 'Profile slow operations before any patch', ctx, { layer: 'frontend-state', corroborated: new Set(perfSignals.map((item) => item.source)).size >= 2 }));
  const asyncSignals = signals.filter((item) => item.source === 'asyncRace');
  if (ctx.asyncRace?.raceFindings?.length || ctx.asyncRace?.staleWrites?.length || ctx.asyncRace?.missingEnds?.length) out.push(diagnosis('async-race', 'async-race', ctx.asyncRace?.raceFindings?.some((item) => item.severity === 'error') ? 'error' : 'warning', 'Async race causal correlation', 'Out-of-order writes or missing ends indicate async race risk', asyncSignals, 'ASYNC_OUT_OF_ORDER_WRITES', 'Confirm request/render ordering before patching', ctx, { layer: 'frontend-state', corroborated: new Set(asyncSignals.map((item) => item.source)).size >= 2 }));
  const backendSignals = signals.filter((item) => item.source === 'network' || item.source === 'renderPreview');
  if (ctx.network?.failedRequests?.length || ctx.renderPreview?.network?.failed?.length) out.push(diagnosis('backend', 'backend', (ctx.network?.failedRequests || []).some((item) => (item.status || 0) >= 500 || item.error) ? 'error' : 'warning', 'Backend payload causal correlation', 'Failed or slow backend payloads correlate with stale UI state', backendSignals, 'BACKEND_FAILED_AND_UI_STALE', 'Verify backend payloads and UI staleness before patching', ctx, { layer: 'network', corroborated: new Set(backendSignals.map((item) => item.source)).size >= 2 }));
  const domSignals = signals.filter((item) => item.source === 'domScanner' || item.source === 'selection' || item.source === 'renderPreview' || item.source === 'visualEvidence');
  if (ctx.domScanner?.findings?.length || ctx.selection?.findings?.length || ctx.renderPreview?.findings?.length || (ctx.visualEvidence?.records || []).some((item) => ['failed', 'skipped'].includes(item.status))) out.push(diagnosis('ui-dom', 'ui-visual', 'warning', 'UI/DOM causal correlation', 'DOM, selection, render, and visual evidence point to UI mismatch', domSignals, 'DOM_BLOCKED_BUT_CONTROL_INTERACTIVE', 'Inspect UI/DOM evidence bundle before patching', ctx, { layer: 'dom', corroborated: new Set(domSignals.map((item) => item.source)).size >= 2 }));
  const logicSignals = signals.filter((item) => item.source === 'zoom' || item.source === 'selection' || item.source === 'renderPreview');
  if (ctx.zoom?.status && ctx.zoom.status !== 'synced' || ctx.selection?.findings?.length || ctx.renderPreview?.findings?.some((item) => ['PREVIEW_DOM_EMPTY_AFTER_SUCCESS', 'RENDER_OUT_OF_ORDER'].includes(item.code))) out.push(diagnosis('logic', 'logic', 'warning', 'Logic invariant causal correlation', 'Cross-snapshot state mismatches violate core invariants', logicSignals, 'OWNERSHIP_EXPECTED_WRITER_MISSING', 'Check invariant registry before patching', ctx, { layer: 'frontend-state', corroborated: new Set(logicSignals.map((item) => item.source)).size >= 2 }));
  const ownershipSignals = signals.filter((item) => item.ownerExpected && (!item.writerActual || item.ownerExpected !== item.writerActual));
  if (ownershipSignals.length) out.push(diagnosis('ownership', 'logic', 'warning', 'Ownership causal correlation', 'Expected writer and actual writer do not match on critical evidence', ownershipSignals, 'OWNERSHIP_EXPECTED_WRITER_MISSING', 'Fix ownership evidence first, not the symptom', ctx, { layer: 'adapter', ownerExpected: ownershipSignals[0].ownerExpected, writerActual: ownershipSignals[0].writerActual }));
  const staleSignals = signals.filter((item) => item.ruleId === 'STALE_WRITE' || item.ruleId === 'STALE_WRITE_AFTER_MODE_CHANGE' || item.ruleId === 'STATE_REVISION_REGRESSION' || item.ruleId === 'MODEL_DOM_POSITION_DRIFT' || item.ruleId === 'MODEL_DOM_SIZE_DRIFT');
  if (staleSignals.length) out.push(diagnosis('stale-state', 'logic', staleSignals.some((item) => item.severity === 'error') ? 'error' : 'warning', 'Stale state causal correlation', 'State and DOM snapshots diverge after a newer update', staleSignals, 'ASYNC_OUT_OF_ORDER_WRITES', 'Confirm the most recent writer before patching', ctx, { layer: 'frontend-state', corroborated: new Set(staleSignals.map((item) => item.source)).size >= 2 }));
  const dirtySignals = signals.filter((item) => item.source === 'domScanner' || item.ruleId === 'SELECTED_ELEMENT_HIDDEN' || item.ruleId === 'PREVIEW_NOT_VISIBLE' || item.ruleId === 'VISUAL_EVIDENCE');
  if (ctx.domScanner?.findings?.length || ctx.renderPreview?.previewDom?.visible === false || ctx.selection?.findings?.some((item) => /HIDDEN|MISSING/.test(item.code || ''))) out.push(diagnosis('dirty-dom', 'ui-visual', 'warning', 'Dirty DOM causal correlation', 'Visible DOM signals are dirty or blocked after the latest state transition', dirtySignals, 'DOM_BLOCKED_BUT_CONTROL_INTERACTIVE', 'Reconcile DOM after confirming the owning writer', ctx, { layer: 'dom', corroborated: new Set(dirtySignals.map((item) => item.source)).size >= 2 }));
  if (!out.length && signals.length) out.push(diagnosis('unknown-suspicious', 'unknown', 'info', 'Unknown suspicious state', 'UNKNOWN / INSUFFICIENT_EVIDENCE: signals exist but causal confirmation is incomplete', signals.slice(0, 3), 'UNKNOWN_EVIDENCE_GAP', 'Gather the missing evidence before any patch', ctx, { layer: 'unknown', corroborated: false }));
  return dedupeDiagnoses(out).slice(0, LIMITS.maxDiagnoses);
}
function dedupeDiagnoses(list) {
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const key = [item.bugFamily, item.invariant, item.ownerExpected, item.writerActual, item.message, item.evidence.join('|')].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}
function buildChains(signals, diagnoses, ctx) {
  const out = [];
  for (const diag of diagnoses) {
    const related = signals.filter((item) => diag.causalChain.includes(item.id));
    const sources = new Set(related.map((item) => item.source));
    const result = sources.size >= 2 ? 'confirmed' : related.length ? 'suspected' : 'unknown';
    out.push(chain(diag.id, related, ctx, result));
  }
  return dedupeChains(out).slice(0, LIMITS.maxChains);
}
function dedupeChains(list) {
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const key = [item.name, item.result, item.events.map((event) => event.id).join('|')].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}
function buildUnknowns(ctx, signals, diagnoses, invariants) {
  const out = [];
  if (!signals.length && (ctx.loopFreeze || ctx.performance || ctx.asyncRace || ctx.network || ctx.renderPreview || ctx.domScanner || ctx.selection || ctx.visualEvidence)) out.push({ id: 'unknown:no-correlated-signals', message: 'UNKNOWN / INSUFFICIENT_EVIDENCE: source snapshots exist but there is not enough causal overlap to confirm a bug', missing: ['independent corroboration'], evidence: ['no correlated signals'], sourceCount: 0, confidence: 'unknown' });
  if (diagnoses.some((item) => item.confidence === 'low') && !invariants.some((item) => item.result === 'violated' && item.id !== 'UNKNOWN_EVIDENCE_GAP')) out.push({ id: 'unknown:low-confidence', message: 'UNKNOWN / INSUFFICIENT_EVIDENCE: only one evidence source supports the current diagnosis', missing: ['2+ independent sources'], evidence: uniq(diagnoses.flatMap((item) => item.evidence).slice(0, 4)), sourceCount: 1, confidence: 'unknown' });
  return out;
}
function buildRecommendations(diagnoses, invariants, unknowns) {
  const top = diagnoses[0];
  if (top) return [{ title: top.title, action: top.nextAction, doNotPatchYet: true, ownerExpected: top.ownerExpected || null, confidence: top.confidence }];
  if (unknowns.length) return [{ title: 'Gather evidence', action: 'Capture the missing independent evidence before patching', doNotPatchYet: true, ownerExpected: null, confidence: 'unknown' }];
  return [];
}
function overallConfidence(diagnoses, chains, unknowns) {
  const best = diagnoses.find((item) => item.confidence === 'high') ? 'high' : diagnoses.find((item) => item.confidence === 'medium') ? 'medium' : diagnoses.find((item) => item.confidence === 'low') ? 'low' : unknowns.length ? 'unknown' : 'unknown';
  const reason = best === 'high' ? 'multiple independent sources corroborate at least one diagnosis' : best === 'medium' ? 'at least two sources support the same causal path' : best === 'low' ? 'symptoms exist but only one source supports them' : 'insufficient evidence';
  return { overall: best, reason };
}

export function buildCausalIntelligenceSnapshot({
  timeline = null,
  zoom = null,
  dom = null,
  domScanner = null,
  warnings = null,
  loopFreeze = null,
  asyncRace = null,
  network = null,
  performance = null,
  selection = null,
  renderPreview = null,
  visualEvidence = null,
  bundle = null,
  ownership = null,
  now: nowValue = now(),
} = {}) {
  const ctx = { timestamp: nowValue, timeline, zoom, dom, domScanner, warnings, loopFreeze, asyncRace, network, performance, selection, renderPreview, visualEvidence, bundle, ownership };
  const signals = collectSignals(ctx);
  const invariants = evaluateInvariants(ctx, signals);
  const diagnoses = buildDiagnoses(ctx, signals, invariants);
  const evidenceChains = buildChains(signals, diagnoses, ctx);
  const ownershipViolations = signals.filter((item) => item.ownerExpected && (!item.writerActual || item.ownerExpected !== item.writerActual)).map((item) => ({ id: `ownership:${item.id}`, source: item.source, ownerExpected: item.ownerExpected, writerActual: item.writerActual || null, evidence: item.evidence.slice(0, LIMITS.maxEvidencePerDiagnosis), confidence: scoreConfidence([item], false) }));
  const unknowns = buildUnknowns(ctx, signals, diagnoses, invariants);
  const summary = { bugsSuspected: diagnoses.length, critical: diagnoses.filter((item) => item.severity === 'error').length, warnings: diagnoses.filter((item) => item.severity === 'warning').length, unknown: unknowns.length, evidenceChains: evidenceChains.length };
  const confidence = overallConfidence(diagnoses, evidenceChains, unknowns);
  const status = summary.critical ? 'error' : summary.warnings ? 'warning' : summary.bugsSuspected || summary.unknown ? 'info' : 'unknown';
  return { timestamp: nowValue, project: 'reportforge', engine: 'causal-intelligence', status, summary, diagnoses, invariants, evidenceChains, ownershipViolations, unknowns, confidence, recommendations: buildRecommendations(diagnoses, invariants, unknowns), limits: LIMITS };
}

export function refreshCausalIntelligenceSnapshot(context = {}) { state.lastContext = context; state.snapshot = buildCausalIntelligenceSnapshot(context); return state.snapshot; }
export function clearCausalIntelligenceSnapshot() { state.lastContext = {}; state.snapshot = neutralSnapshot(); return state.snapshot; }
export function getCausalIntelligenceSnapshot() { return state.snapshot || neutralSnapshot(); }
export function copyCausalIntelligenceJSON() { return JSON.stringify(getCausalIntelligenceSnapshot(), null, 2); }
export { registry as CAUSAL_INVARIANTS };
