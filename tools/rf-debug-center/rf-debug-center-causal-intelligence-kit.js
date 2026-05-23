'use strict';
export const LIMITS = Object.freeze({ maxDiagnoses: 50, maxEvidencePerDiagnosis: 12, maxChains: 30 });
export const owners = Object.freeze({
  loopFreeze: 'tools/rf-debug-center/rf-debug-center-loop-freeze.js',
  performance: 'tools/rf-debug-center/rf-debug-center-performance.js',
  asyncRace: 'tools/rf-debug-center/rf-debug-center-async-race.js',
  network: 'tools/rf-debug-center/rf-debug-center-network.js',
  renderPreview: 'engines/PreviewEngineRenderer.js',
  domScanner: 'tools/rf-debug-center/rf-debug-center-dom-scanner.js',
  selection: 'engines/SelectionOverlay.js',
  zoom: 'engines/ZoomEngine.js',
  visualEvidence: 'tools/rf-debug-center/rf-debug-center-visual-evidence.js',
  warnings: 'tools/rf-debug-center/rf-debug-center-warnings.js',
});
export const registry = Object.freeze([
  { id: 'NETWORK_OK_BUT_DOM_EMPTY', project: 'reportforge', description: 'Network request succeeded but preview DOM is empty', appliesWhen: 'preview request ok and pageCount is 0', severity: 'warning', ownerExpected: owners.renderPreview, evidenceRequired: ['renderPreview.network.previewRequests', 'renderPreview.previewDom.pageCount'] },
  { id: 'DOM_BLOCKED_BUT_CONTROL_INTERACTIVE', project: 'reportforge', description: 'Interactive control is blocked or pointer-events disabled', appliesWhen: 'DOM scanner reports overlay or pointer-events conflict on an interactive target', severity: 'warning', ownerExpected: owners.domScanner, evidenceRequired: ['domScanner.findings'] },
  { id: 'ASYNC_OUT_OF_ORDER_WRITES', project: 'reportforge', description: 'Writes completed out of order', appliesWhen: 'async race reports stale writes or render/request order reversal', severity: 'error', ownerExpected: owners.asyncRace, evidenceRequired: ['asyncRace.raceFindings', 'asyncRace.staleWrites'] },
  { id: 'HIGH_EVENT_RATE_WITH_FRAME_GAP', project: 'reportforge', description: 'High event rate correlates with frame gaps', appliesWhen: 'timeline rate is high and loop/performance report frame gaps', severity: 'error', ownerExpected: owners.performance, evidenceRequired: ['performance.eventRate', 'performance.frameGaps', 'loopFreeze.eventStorms'] },
  { id: 'BACKEND_FAILED_AND_UI_STALE', project: 'reportforge', description: 'Backend failure leaves stale UI', appliesWhen: 'network failed requests coincide with preview or DOM stale state', severity: 'warning', ownerExpected: owners.network, evidenceRequired: ['network.failedRequests', 'renderPreview.findings', 'domScanner.findings'] },
  { id: 'SELECTION_MODEL_DOM_DRIFT', project: 'reportforge', description: 'Selection model and DOM diverge', appliesWhen: 'selection drift findings exist', severity: 'warning', ownerExpected: owners.selection, evidenceRequired: ['selection.findings'] },
  { id: 'PREVIEW_SUCCESS_BUT_EMPTY_DOM', project: 'reportforge', description: 'Preview request succeeded but DOM stayed empty', appliesWhen: 'successful preview request and zero preview pages', severity: 'warning', ownerExpected: owners.renderPreview, evidenceRequired: ['renderPreview.network.previewRequests', 'renderPreview.previewDom.pageCount'] },
  { id: 'WARNING_CLUSTER_ESCALATION', project: 'reportforge', description: 'Warnings from multiple engines cluster on one target', appliesWhen: 'warnings or findings share a target/source cluster', severity: 'warning', ownerExpected: owners.warnings, evidenceRequired: ['warnings.warnings'] },
  { id: 'OWNERSHIP_EXPECTED_WRITER_MISSING', project: 'reportforge', description: 'Expected owner exists but writer is missing or wrong', appliesWhen: 'writerActual is missing or mismatched on critical evidence', severity: 'warning', ownerExpected: 'ownership-map', evidenceRequired: ['ownerExpected', 'writerActual'] },
  { id: 'UNKNOWN_EVIDENCE_GAP', project: 'reportforge', description: 'Symptoms exist but the evidence base is incomplete', appliesWhen: 'symptoms exist but corroboration is insufficient', severity: 'info', ownerExpected: null, evidenceRequired: ['signals', 'missing sources'] },
]);
export const now = () => new Date().toISOString();
export const clip = (value, limit = 160) => { const text = value == null ? '' : typeof value === 'string' ? value : JSON.stringify(value); return text.length > limit ? `${text.slice(0, limit - 1)}…` : text; };
export const uniq = (items) => [...new Set((items || []).filter(Boolean))];
export const sourceMeta = (name, snap) => ({ source: name, status: snap?.status || 'unknown', summary: snap?.summary || snap?.risk || snap?.findings?.length || 0 });
export const ownershipLookups = (ownership) => { const map = {}; for (const [key, value] of Object.entries(ownership?.ssot || {})) map[key] = value; for (const item of ownership?.subsystems || []) map[item.name] = item.onlyWriter || item.owner || map[item.name] || null; return map; };
export const ownerFor = (source, ownerExpected, ownership) => ownerExpected || ownershipLookups(ownership)[source] || null;
export function signal(source, ruleId, severity, message, extra = {}) { return { id: `${source}:${ruleId}:${extra.key || ruleId}:${extra.index || 0}`, timestamp: extra.timestamp || null, source, ruleId, severity, message, layer: extra.layer || 'unknown', bugFamily: extra.bugFamily || 'unknown', target: extra.target || null, selector: extra.selector || null, path: extra.path || null, requestId: extra.requestId || null, transactionId: extra.transactionId || null, renderId: extra.renderId || null, eventId: extra.eventId || null, ownerExpected: extra.ownerExpected || null, writerActual: extra.writerActual || null, evidence: uniq(extra.evidence || []).map((item) => clip(item)).slice(0, LIMITS.maxEvidencePerDiagnosis) }; }
export function addSignals(list, source, bugFamily, layer, items, make) { for (let i = 0; i < (items || []).length; i += 1) { const shaped = make(items[i], i); list.push(signal(source, shaped.ruleId, shaped.severity, shaped.message, { ...shaped, source, bugFamily, layer, index: i, timestamp: shaped.timestamp || null })); } }
