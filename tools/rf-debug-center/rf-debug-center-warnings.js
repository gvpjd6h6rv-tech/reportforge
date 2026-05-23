'use strict';
const MAX_ACTIVE = 24;
const FINGERPRINT_RE = /[^\w.-]+/g;
function now() { return new Date().toISOString(); }
function fingerprint(parts) { return parts.filter(Boolean).join('|').replace(FINGERPRINT_RE, '_').slice(0, 180); }
function issue(ruleId, severity, title, message, evidence = [], suggestedOwner = null, source = 'rf-debug-center') { return { id: `${ruleId}:${fingerprint([title, message, evidence.join(' ')])}`, timestamp: now(), engine: 'warnings', ruleId, severity, title, message, evidence: evidence.slice(0, 8).map((item) => (typeof item === 'string' ? item : JSON.stringify(item))).slice(0, 8), suggestedOwner, source, status: 'active' }; }
function dedupeWarnings(warnings) {
  const dedup = new Map();
  for (const warning of warnings) {
    const key = fingerprint([warning.ruleId, warning.source, warning.message, warning.evidence.join(' ')]);
    if (!dedup.has(key)) dedup.set(key, warning);
  }
  return [...dedup.values()];
}
function buildWarningsSnapshot({ traceState = 'absent', timeline = null, loopFreeze = null, asyncRace = null, zoom = null, renderPreview = null, dom = null, domScanner = null, network = null, performance = null, selection = null, visualEvidence = null, bundle = null, ownership = null, active = true } = {}) {
  const warnings = [];
  const push = (...args) => warnings.push(issue(...args));
  const first = (items) => (Array.isArray(items) && items.length ? items[0] : null);
  const sourceState = timeline?.sourceState || traceState || 'absent';
  if (sourceState === 'absent') push('RF_UI_TRACE_ABSENT', 'warning', 'RF_UI_TRACE absent', 'RF_UI_TRACE is not available', ['sourceStatus absent'], 'engines/RFAudit.js');
  else if (sourceState === 'invalid') push('RF_UI_TRACE_INVALID', 'error', 'RF_UI_TRACE invalid', 'RF_UI_TRACE exists but API is invalid', ['sourceStatus invalid'], 'engines/RFAudit.js');
  if (active && sourceState === 'present' && (timeline?.total || 0) === 0) push('TIMELINE_EMPTY_WHILE_ACTIVE', 'warning', 'Timeline empty while active', 'Debug Center is live but timeline has no events', ['timeline.total=0', `traceState=${sourceState}`], 'tools/rf-debug-center/rf-debug-center-store.js');
  if (zoom?.status && zoom.status !== 'synced') push('ZOOM_DIVERGENCE', zoom.status === 'error' ? 'error' : 'warning', 'Zoom divergence', 'Zoom diagnostics reports divergence', zoom.divergences?.length ? zoom.divergences : ['zoom.status!=' + zoom.status], zoom.suggestedOwner || 'engines/ZoomEngine.js');
  if (asyncRace?.status && ['warning', 'error'].includes(asyncRace.status)) push('ASYNC_RACE_RISK', asyncRace.status === 'error' ? 'error' : 'warning', 'Async/race risk', 'Async/Race diagnostics report elevated risk', asyncRace.evidence?.length ? asyncRace.evidence.slice(0, 4) : ['asyncRace risk'], asyncRace.suggestedOwner || 'tools/rf-debug-center/rf-debug-center-async-race.js');
  if (loopFreeze?.status && ['warning', 'error'].includes(loopFreeze.status)) push('LOOP_FREEZE_RISK', loopFreeze.status === 'error' ? 'error' : 'warning', 'Loop/freeze risk', 'Loop & Freeze diagnostics report elevated risk', loopFreeze.evidence?.length ? loopFreeze.evidence.slice(0, 4) : ['loopFreeze risk'], loopFreeze.suggestedOwner || 'tools/rf-debug-center/rf-debug-center-loop-freeze.js');
  if (dom?.status && dom.status !== 'synced') push('DOM_DIVERGENCE', dom.status === 'error' ? 'error' : 'warning', 'DOM divergence', 'DOM diagnostics reports divergence', (dom.findings || []).slice(0, 4).map((f) => f.code || f.selector || 'issue'), (dom.owners && dom.owners[0]) || 'designer/crystal-reports-designer-v4.html');
  if (domScanner?.status && ['warning', 'error'].includes(domScanner.status)) push('DOM_SCANNER_RISK', domScanner.status === 'error' ? 'error' : 'warning', 'DOM scanner risk', 'DOM scanner reports structural or interaction risk', (domScanner.findings || []).slice(0, 4).map((item) => item.ruleId || item.selector || 'issue'), domScanner.suggestedOwner || (domScanner.findings && domScanner.findings[0] && domScanner.findings[0].suggestedOwner) || 'tools/rf-debug-center/rf-debug-center-dom-scanner.js');
  if (selection?.status && ['warning', 'error'].includes(selection.status)) push('SELECTION_RISK', selection.status === 'error' ? 'error' : 'warning', 'Selection risk', 'Selection diagnostics report drift or missing nodes', (selection.findings || []).slice(0, 4).map((f) => f.code || f.selector || 'issue'), selection.suggestedOwner || (selection.findings && selection.findings[0] && selection.findings[0].ownerExpected) || 'engines/SelectionOverlay.js');
  if (renderPreview?.status && ['warning', 'error'].includes(renderPreview.status)) push('RENDER_PREVIEW_RISK', renderPreview.status === 'error' ? 'error' : 'warning', 'Render/preview risk', 'Render/preview diagnostics report divergence', (renderPreview.findings || []).slice(0, 4).map((f) => f.code || f.selector || 'issue'), renderPreview.suggestedOwner || (renderPreview.findings && renderPreview.findings[0] && renderPreview.findings[0].ownerExpected) || 'engines/PreviewEngineRenderer.js');
  if (performance?.status && ['warning', 'error'].includes(performance.status)) push('PERFORMANCE_RISK', performance.status === 'error' ? 'error' : 'warning', 'Performance risk', 'Performance diagnostics report elevated risk', performance.evidence?.length ? performance.evidence.slice(0, 4) : ['performance risk'], performance.suggestedOwner || 'tools/rf-debug-center/rf-debug-center-performance.js');
  if (performance?.eventRate && performance.eventRate.perSecond > performance.limits?.eventRateThreshold) push('EVENT_RATE_HIGH', 'warning', 'High event rate', 'Timeline event rate exceeds the performance threshold', [`perSecond=${performance.eventRate.perSecond}`, `windowMs=${performance.eventRate.windowMs}`], 'tools/rf-debug-center/rf-debug-center-performance.js');
  if (performance?.slowEvents?.length) push('SLOW_EVENT', 'warning', 'Slow event', 'An event exceeded the slow threshold', [performance.slowEvents[0].label || 'slow event', `duration=${performance.slowEvents[0].durationMs}`], performance.slowEvents[0].source || 'tools/rf-debug-center/rf-debug-center-performance.js');
  if (performance?.slowRequests?.length) push('SLOW_REQUEST', 'warning', 'Slow request', 'A network request exceeded the slow threshold', [performance.slowRequests[0].label || 'slow request', `duration=${performance.slowRequests[0].durationMs}`], performance.slowRequests[0].source || 'tools/rf-debug-center/rf-debug-center-network.js');
  if (performance?.longTasks?.length) push('LONG_TASK', 'warning', 'Long task', 'The browser reported a long task', [performance.longTasks[0].label || 'long task', `duration=${performance.longTasks[0].durationMs}`], 'tools/rf-debug-center/rf-debug-center-performance.js');
  if (performance?.frameGaps?.length) push('FRAME_GAP', 'warning', 'Frame gap', 'A large animation frame gap was observed', [performance.frameGaps[0].label || 'frame gap', `gap=${performance.frameGaps[0].durationMs}`], 'tools/rf-debug-center/rf-debug-center-performance.js');
  const networkIssue = first(network?.failedRequests);
  if (networkIssue) push('NETWORK_REQUEST_FAILED', (networkIssue.status || 0) >= 500 || networkIssue.error ? 'error' : 'warning', 'Network request failed', 'A network request failed or returned an error status', [networkIssue.method, networkIssue.path, `status=${networkIssue.status ?? 'error'}`], networkIssue.ownerExpected || 'tools/rf-debug-center/rf-debug-center-network.js');
  const networkSlow = first(network?.slowRequests);
  if (networkSlow) push('NETWORK_REQUEST_SLOW', 'warning', 'Network request slow', 'A network request exceeded the slow threshold', [networkSlow.method, networkSlow.path, `duration=${networkSlow.durationMs ?? networkSlow.ageMs ?? 0}`], networkSlow.ownerExpected || 'tools/rf-debug-center/rf-debug-center-network.js');
  const activeLeak = (network?.activeRequests || []).find((item) => (item.ageMs || 0) >= 15_000);
  if (activeLeak) push('NETWORK_ACTIVE_LEAK', 'warning', 'Active network leak', 'A network request stayed active for too long', [activeLeak.method, activeLeak.path, `age=${activeLeak.ageMs}`], activeLeak.ownerExpected || 'tools/rf-debug-center/rf-debug-center-network.js');
  if ((network?.redactions || 0) > 0) push('NETWORK_REDACTION_APPLIED', 'info', 'Network redaction applied', 'Sensitive network fields were redacted', [`redactions=${network.redactions}`], 'tools/rf-debug-center/rf-debug-center-network.js');
  if (active && network && network.observerStatus !== 'installed' && network.status === 'unknown') push('NETWORK_OBSERVER_DISABLED', 'info', 'Network observer disabled', 'Network observer was not installed or is partially available', [`observer=${network.observerStatus || 'disabled'}`], 'tools/rf-debug-center/rf-debug-center-network.js');
  if (visualEvidence?.records?.some((r) => r.status === 'failed')) push('VISUAL_EVIDENCE_RISK', 'warning', 'Visual evidence risk', 'One or more visual evidence captures failed', (visualEvidence.records.filter((r) => r.status === 'failed').slice(0, 2).map((r) => r.reason || 'VISUAL_CAPTURE_FAILED')), 'tools/rf-debug-center/rf-debug-center-visual-evidence.js');
  if (!ownership) push('OWNERSHIP_MAP_MISSING', 'error', 'Ownership map missing', 'Ownership map is unavailable', ['ownership map missing'], 'tools/rf-debug-center/ownership-map.json');
  if (bundle?.status === 'error') push('BUNDLE_EXPORT_ERROR', 'error', 'Bundle export error', 'Bundle export state is error', [bundle.message || 'export failed'], 'tools/rf-debug-center/rf-debug-center-bundle.js');
  if (timeline?.paused) push('SOURCE_PAUSED', 'info', 'Timeline paused', 'Timeline ingestion is paused', ['paused true'], 'tools/rf-debug-center/rf-debug-center-store.js');
  const items = dedupeWarnings(warnings).slice(0, MAX_ACTIVE).map((item) => ({ ...item, evidence: item.evidence.slice(0, 6) }));
  const status = items.some((item) => item.severity === 'error') ? 'error' : items.some((item) => item.severity === 'warning') ? 'warning' : items.length ? 'info' : 'unknown';
  return { status, total: items.length, counts: items.reduce((acc, item) => ((acc[item.severity] = (acc[item.severity] || 0) + 1), acc), { info: 0, warning: 0, error: 0 }), warnings: items, sourceState, traceState: sourceState };
}
export { dedupeWarnings, buildWarningsSnapshot };
