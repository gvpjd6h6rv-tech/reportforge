import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDebugBundle } from '../../tools/rf-debug-center/rf-debug-center-bundle.js';
import { buildWarningsSnapshot } from '../../tools/rf-debug-center/rf-debug-center-warnings.js';
import { applyCausalIntelligenceApi } from '../../tools/rf-debug-center/rf-debug-center-api-causal-intelligence.js';
import {
  buildCausalIntelligenceSnapshot,
  clearCausalIntelligenceSnapshot,
  copyCausalIntelligenceJSON,
  getCausalIntelligenceSnapshot,
  refreshCausalIntelligenceSnapshot,
} from '../../tools/rf-debug-center/rf-debug-center-causal-intelligence.js';

const ownership = { tool: 'RF Debug Center', ssot: { loopFreeze: 'tools/rf-debug-center/rf-debug-center-loop-freeze.js', performance: 'tools/rf-debug-center/rf-debug-center-performance.js', asyncRace: 'tools/rf-debug-center/rf-debug-center-async-race.js', network: 'tools/rf-debug-center/rf-debug-center-network.js', renderPreview: 'engines/PreviewEngineRenderer.js', domScanner: 'tools/rf-debug-center/rf-debug-center-dom-scanner.js', selection: 'engines/SelectionOverlay.js', zoom: 'engines/ZoomEngine.js', visualEvidence: 'tools/rf-debug-center/rf-debug-center-visual-evidence.js', warnings: 'tools/rf-debug-center/rf-debug-center-warnings.js' } };
const base = () => ({
  timeline: { sourceState: 'present', total: 24 },
  loopFreeze: { timestamp: '2026-05-22T07:00:00.000Z', status: 'warning', eventStorms: [{ severity: 'warning', message: 'storm', source: 'loopFreeze', evidence: ['storm'], ownerExpected: ownership.ssot.loopFreeze }], possibleLoops: [{ severity: 'warning', message: 'loop', source: 'loopFreeze', evidence: ['loop'], ownerExpected: ownership.ssot.loopFreeze }], evidence: ['loop'], suggestedOwner: ownership.ssot.loopFreeze },
  performance: { timestamp: '2026-05-22T07:00:01.000Z', status: 'warning', eventRate: { windowMs: 5000, total: 90, perSecond: 18, topActions: [] }, slowEvents: [{ label: 'wheel', durationMs: 140, source: 'ZoomEngine', evidence: ['duration=140'] }], slowRequests: [{ label: '/render', durationMs: 1200, source: 'PreviewEngineRenderer', evidence: ['duration=1200'] }], longTasks: [{ label: 'task', durationMs: 80, source: 'performanceobserver', evidence: ['duration=80'] }], frameGaps: [{ label: 'gap', durationMs: 300, source: 'requestAnimationFrame', evidence: ['gap=300'] }], limits: { eventRateThreshold: 12 }, evidence: ['perf'], suggestedOwner: ownership.ssot.performance },
  asyncRace: { timestamp: '2026-05-22T07:00:02.000Z', status: 'warning', raceFindings: [{ ruleId: 'RENDER_AFTER_NEWER_RENDER', severity: 'warning', message: 'render out of order', evidence: ['render-2 after render-3'], suggestedOwner: ownership.ssot.renderPreview, writerActual: 'PreviewEngineRenderer.refresh', renderId: 'render-2' }], staleWrites: [{ ruleId: 'STALE_WRITE_AFTER_MODE_CHANGE', severity: 'warning', message: 'stale write', evidence: ['mode change'], suggestedOwner: ownership.ssot.asyncRace, writerActual: 'GlobalEventHandlers.click' }], missingEnds: [{ ruleId: 'MISSING_END_EVENT', severity: 'info', message: 'missing end', evidence: ['open tx'], suggestedOwner: ownership.ssot.asyncRace, writerActual: 'PreviewEngineRenderer.refresh' }], suggestedOwner: ownership.ssot.asyncRace, evidence: ['async'] },
  network: { timestamp: '2026-05-22T07:00:03.000Z', status: 'warning', failedRequests: [{ method: 'POST', path: '/render', status: 500, error: 'boom', ownerExpected: ownership.ssot.renderPreview, evidence: ['status=500'] }], slowRequests: [{ method: 'POST', path: '/render', durationMs: 1300, ownerExpected: ownership.ssot.renderPreview, evidence: ['duration=1300'] }], observerStatus: 'installed', suggestedOwner: ownership.ssot.network },
  renderPreview: { timestamp: '2026-05-22T07:00:04.000Z', status: 'warning', mode: 'preview', lifecycle: { lastPreviewEvent: { source: 'PreviewEngineMode.show', action: 'show' }, lastRenderEvent: { source: 'PreviewEngineRenderer.refresh', action: 'refresh' }, lastExportEvent: null }, previewDom: { rootExists: true, contentExists: true, visible: true, pageCount: 0, rect: { left: 0, top: 0, width: 100, height: 100 }, transform: 'none', scale: 1, rendererTargetSelector: '#preview-content' }, network: { previewRequests: [{ ok: true, status: 200, path: '/designer-preview' }], renderRequests: [{ ok: true, status: 200, path: '/render' }], auditRequests: [], exportRequests: [], failed: [{ path: '/render', status: 500, error: 'boom', ownerExpected: ownership.ssot.renderPreview }], slow: [{ path: '/render', durationMs: 1200, ownerExpected: ownership.ssot.renderPreview }] }, correlations: { timeline: ['PreviewEngineRenderer.refresh'], performance: ['render slow op'], asyncRace: ['RENDER_AFTER_NEWER_RENDER'] }, findings: [{ code: 'PREVIEW_DOM_EMPTY_AFTER_SUCCESS', severity: 'warning', ownerExpected: ownership.ssot.renderPreview, evidence: ['empty'] }], evidence: ['render preview warning'], suggestedOwner: ownership.ssot.renderPreview },
  domScanner: { timestamp: '2026-05-22T07:00:05.000Z', status: 'warning', summary: { findings: 2, hidden: 1, blocked: 1, duplicates: 0, critical: 1, warnings: 1, targetsScanned: 8 }, findings: [{ ruleId: 'DOM_BLOCKED_BY_OVERLAY', severity: 'warning', selector: '#zw-slider', target: 'zw-slider', evidence: ['overlay'], suggestedOwner: ownership.ssot.zoom }, { ruleId: 'DOM_POINTER_EVENTS_NONE', severity: 'error', selector: '#zw-pct', target: 'zw-pct', evidence: ['pointer-events=none'], suggestedOwner: ownership.ssot.zoom }], suggestedOwner: ownership.ssot.domScanner },
  selection: { timestamp: '2026-05-22T07:00:06.000Z', status: 'warning', findings: [{ code: 'MODEL_DOM_POSITION_DRIFT', severity: 'warning', ownerExpected: ownership.ssot.selection, evidence: 'drift' }], suggestedOwner: ownership.ssot.selection },
  zoom: { timestamp: '2026-05-22T07:00:07.000Z', status: 'warning', divergences: ['slider-mismatch'], suggestedOwner: ownership.ssot.zoom, evidence: ['slider mismatch'] },
  visualEvidence: { status: 'active', lastCaptureAt: '2026-05-22T07:00:08.000Z', records: [{ status: 'failed', reason: 'VISUAL_CAPTURE_FAILED', target: 'preview', selector: '#preview-content' }], capabilities: { canCapture: false } },
  warnings: { status: 'warning', total: 2, warnings: [{ ruleId: 'DOM_SCANNER_RISK', severity: 'warning', source: 'domScanner', message: 'dom', evidence: ['overlay'] }, { ruleId: 'RENDER_PREVIEW_RISK', severity: 'warning', source: 'renderPreview', message: 'render', evidence: ['preview'] }] },
  ownership,
});

test('x1 tolerates missing snapshots and stays read-only', () => {
  const ds = Object.freeze({ zoom: 1, previewMode: false });
  const traceApi = { getEntries: () => [], snapshot: () => null, clear: () => {} };
  const beforeKeys = new Set(Object.keys(globalThis));
  const snapshot = buildCausalIntelligenceSnapshot({});
  assert.equal(snapshot.status, 'unknown');
  assert.equal(snapshot.summary.bugsSuspected, 0);
  assert.equal(snapshot.confidence.overall, 'unknown');
  assert.equal(JSON.stringify(ds), '{"zoom":1,"previewMode":false}');
  assert.equal(typeof globalThis.RFDebugCenter, 'undefined');
  assert.deepEqual(new Set(Object.keys(globalThis)), beforeKeys);
  assert.doesNotThrow(() => traceApi.clear());
});

test('x1 correlates loop/performance, async, backend, ui-dom, and stale-state evidence', () => {
  const snapshot = buildCausalIntelligenceSnapshot(base());
  const families = snapshot.diagnoses.map((item) => item.bugFamily);
  assert.ok(families.includes('loop'));
  assert.ok(families.includes('performance'));
  assert.ok(families.includes('async-race'));
  assert.ok(families.includes('backend'));
  assert.ok(families.includes('ui-visual'));
  assert.ok(families.includes('logic'));
  assert.ok(snapshot.invariants.some((item) => item.id === 'HIGH_EVENT_RATE_WITH_FRAME_GAP'));
  assert.ok(snapshot.invariants.some((item) => item.id === 'NETWORK_OK_BUT_DOM_EMPTY'));
  assert.ok(snapshot.invariants.some((item) => item.id === 'DOM_BLOCKED_BUT_CONTROL_INTERACTIVE'));
  assert.ok(snapshot.invariants.some((item) => item.id === 'SELECTION_MODEL_DOM_DRIFT'));
  assert.ok(snapshot.invariants.some((item) => item.id === 'PREVIEW_SUCCESS_BUT_EMPTY_DOM'));
  assert.ok(snapshot.invariants.some((item) => item.id === 'WARNING_CLUSTER_ESCALATION'));
  assert.ok(snapshot.summary.evidenceChains <= snapshot.limits.maxChains);
  assert.ok(snapshot.ownershipViolations.length >= 1);
  assert.equal(snapshot.confidence.overall, 'high');
});

test('x1 stays conservative when only one source exists and uses ownership map when provided', () => {
  const single = buildCausalIntelligenceSnapshot({ domScanner: { timestamp: '2026-05-22T07:00:05.000Z', status: 'warning', findings: [{ ruleId: 'DOM_TARGET_HIDDEN', severity: 'warning', selector: '#zw-slider', target: 'zw-slider', evidence: ['display=none'], suggestedOwner: null }], suggestedOwner: null } });
  assert.equal(single.diagnoses[0].confidence, 'low');
  assert.notEqual(single.diagnoses[0].ownerExpected, 'invented-owner');
  const withMap = buildCausalIntelligenceSnapshot({ domScanner: { timestamp: '2026-05-22T07:00:05.000Z', status: 'warning', findings: [{ ruleId: 'DOM_TARGET_HIDDEN', severity: 'warning', selector: '#zw-slider', target: 'zw-slider', evidence: ['display=none'], suggestedOwner: null }], suggestedOwner: null }, ownership });
  assert.equal(withMap.diagnoses[0].ownerExpected, ownership.ssot.domScanner);
  assert.notEqual(withMap.confidence.overall, 'high');
});

test('x1 dedupes diagnoses and bounds chains', () => {
  const snapshot = buildCausalIntelligenceSnapshot({ domScanner: { timestamp: '2026-05-22T07:00:05.000Z', status: 'warning', findings: [{ ruleId: 'DOM_TARGET_HIDDEN', severity: 'warning', selector: '#zw-slider', target: 'zw-slider', evidence: ['display=none'], suggestedOwner: ownership.ssot.domScanner }, { ruleId: 'DOM_TARGET_HIDDEN', severity: 'warning', selector: '#zw-slider', target: 'zw-slider', evidence: ['display=none'], suggestedOwner: ownership.ssot.domScanner }], suggestedOwner: ownership.ssot.domScanner }, selection: base().selection, warnings: base().warnings, ownership });
  assert.equal(new Set(snapshot.diagnoses.map((item) => item.id)).size, snapshot.diagnoses.length);
  assert.ok(snapshot.evidenceChains.length <= snapshot.limits.maxChains);
});

test('x1 clear and copy helpers stay controlled', () => {
  refreshCausalIntelligenceSnapshot(base());
  assert.notEqual(getCausalIntelligenceSnapshot().status, 'unknown');
  const copied = copyCausalIntelligenceJSON();
  assert.doesNotThrow(() => JSON.parse(copied));
  clearCausalIntelligenceSnapshot();
  assert.equal(getCausalIntelligenceSnapshot().status, 'unknown');
});

test('x1 bundle, warnings, and api wiring stay read-only', () => {
  const causal = refreshCausalIntelligenceSnapshot(base());
  const bundle = buildDebugBundle({ state: { enabled: true, causalIntelligence: causal, warnings: { status: 'warning', total: 1 }, timeline: { paused: false, sourceState: 'present', sourceCount: 1, total: 1, counts: { debug: 0, info: 1, warning: 0, error: 0 }, recent: [], entries: [], lastEvent: null }, zoom: { status: 'warning' }, dom: { status: 'synced' } }, traceApi: null, doc: { readyState: 'complete' }, win: { location: { href: 'http://example.test/?rfDebugCenter=1', pathname: '/', search: '?rfDebugCenter=1', hash: '' }, innerWidth: 800, innerHeight: 600, devicePixelRatio: 1, navigator: {}, URL: {}, Blob: null }, ownership });
  assert.equal(bundle.causalIntelligence.status, causal.status);
  const warnings = buildWarningsSnapshot({ traceState: 'present', timeline: { paused: false, total: 1 }, causalIntelligence: causal, ownership });
  assert.ok(warnings.warnings.some((item) => ['CAUSAL_BUG_SUSPECTED', 'CAUSAL_CRITICAL'].includes(item.ruleId)));
  assert.ok(warnings.warnings.some((item) => item.ruleId === 'CAUSAL_CRITICAL'));
  const api = { actions: {} };
  const state = { lastModel: { causalIntelligence: causal }, actions: {} };
  applyCausalIntelligenceApi(api, state, () => ({ causalIntelligence: causal }));
  assert.equal(typeof api.refreshCausalIntelligence, 'function');
  assert.equal(typeof api.clearCausalIntelligence, 'function');
  assert.equal(typeof api.copyCausalIntelligenceJSON, 'function');
  assert.equal(typeof globalThis.RFDebugCenter, 'undefined');
});
