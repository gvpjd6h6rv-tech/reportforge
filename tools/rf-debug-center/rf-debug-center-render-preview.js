'use strict';

const LIMITS = Object.freeze({ maxFindings: 20, maxEvidence: 24, slowRequestMs: 1000 });
const state = { lastContext: null, snapshot: neutralSnapshot() };
const now = () => new Date().toISOString();
const clip = (value, limit = 140) => { const text = value == null ? 'null' : typeof value === 'string' ? value : JSON.stringify(value); return text.length > limit ? `${text.slice(0, limit - 1)}…` : text; };
const eventList = (timeline) => Array.isArray(timeline?.entries) && timeline.entries.length ? timeline.entries : Array.isArray(timeline?.recent) ? timeline.recent : [];
const lastMatch = (items, predicate) => { for (let i = items.length - 1; i >= 0; i -= 1) if (predicate(items[i])) return items[i]; return null; };
const isPreview = (entry) => /PreviewEngineMode\.(show|hide)|PreviewEngineRenderer\.refresh|preview-(refresh|error)|\/designer-preview\b|\/render\b|\/rf-audit\b/i.test([entry?.source, entry?.module, entry?.action, entry?.event].filter(Boolean).join(' '));
const isRender = (entry) => /PreviewEngineRenderer\.refresh|preview-refresh|\/designer-preview\b|\/render\b/i.test([entry?.source, entry?.module, entry?.action, entry?.event].filter(Boolean).join(' '));
const isExport = (entry) => /export|pdf/i.test([entry?.source, entry?.module, entry?.action, entry?.event].filter(Boolean).join(' '));
const rectOf = (node) => { const rect = node?.getBoundingClientRect?.(); return rect ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height, right: rect.right, bottom: rect.bottom } : null; };
const styleOf = (node) => node?.ownerDocument?.defaultView?.getComputedStyle?.(node) || null;
const visible = (node, rect = rectOf(node), style = styleOf(node)) => !!node && !!rect && rect.width > 0 && rect.height > 0 && style?.display !== 'none' && style?.visibility !== 'hidden' && style?.opacity !== '0';
const summary = (r) => r ? { requestId: r.requestId || null, transactionId: r.transactionId || null, method: r.method || null, url: r.url || null, path: r.path || null, status: r.status ?? null, ok: r.ok ?? null, contentType: r.contentType ?? null, durationMs: r.durationMs ?? r.ageMs ?? null, startedAt: r.startedAt ?? null, endedAt: r.endedAt ?? null, requestSummary: r.requestSummary ?? null, responseSummary: r.responseSummary ?? null, error: r.error ?? null, sensitiveFieldsRedacted: r.sensitiveFieldsRedacted || [], ownerExpected: r.ownerExpected || null } : null;
const requestKind = (r) => { const path = String(r?.path || r?.url || '').toLowerCase(); return /designer-preview/.test(path) ? 'preview' : /\/render\b/.test(path) ? 'render' : /rf-audit/.test(path) ? 'audit' : /(?:\/export|pdf)/.test(path) ? 'export' : null; };
const allRequests = (network) => {
  const items = [...(network?.activeRequests || []), ...(network?.completedRequests || []), ...(network?.failedRequests || []), ...(network?.slowRequests || []), ...(network?.lastRequests || [])];
  const seen = new Set();
  return items.map(summary).filter(Boolean).filter((item) => {
    const key = item.requestId || item.transactionId || `${item.method || 'GET'} ${item.path || item.url || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};
const reqs = (network, kind) => allRequests(network).filter((item) => requestKind(item) === kind);
const failed = (network, kind) => reqs(network, kind).filter((r) => (r.status || 0) >= 400 || r.error);
const slow = (network, kind) => reqs(network, kind).filter((r) => Number(r.durationMs || 0) >= LIMITS.slowRequestMs || (r.ageMs || 0) >= LIMITS.slowRequestMs);
const eventInfo = (e) => e ? { timestamp: e.timestamp ?? null, source: e.source ?? e.module ?? null, module: e.module ?? e.source ?? null, action: e.action ?? e.event ?? null, eventId: e.eventId ?? null, transactionId: e.transactionId ?? null, requestId: e.requestId ?? null, renderId: e.renderId ?? null, ownerExpected: e.ownerExpected ?? null, writerActual: e.writerActual ?? null } : null;
const scaleFrom = (transform) => { if (!transform || transform === 'none') return null; const matrix = String(transform).match(/matrix\(([^,]+)/); if (matrix) return Number(matrix[1]) || null; const scale = String(transform).match(/scale\(([^)]+)\)/); return scale ? Number(scale[1].split(',')[0]) || null : null; };
function neutralSnapshot() { return { timestamp: null, project: 'reportforge', engine: 'render-preview', status: 'unknown', mode: 'unknown', lifecycle: { lastPreviewEvent: null, lastRenderEvent: null, lastExportEvent: null }, previewDom: { rootExists: null, contentExists: null, visible: null, pageCount: null, rect: null, transform: null, scale: null, rendererTargetSelector: null }, network: { previewRequests: [], renderRequests: [], auditRequests: [], exportRequests: [], failed: [], slow: [] }, correlations: { timeline: [], performance: [], asyncRace: [] }, findings: [], evidence: [], suggestedOwner: null, sourceState: 'absent', limits: LIMITS }; }

function previewDom(doc) {
  const root = doc?.querySelector?.('#preview-layer') || null;
  const content = doc?.querySelector?.('#preview-content') || null;
  const target = content?.querySelector?.('.preview-render-layer') || content?.querySelector?.('.preview-hit-layer') || content || root;
  const node = root || content;
  const rect = rectOf(node);
  const style = styleOf(node);
  const visibleState = visible(node, rect, style);
  const contentRect = rectOf(content);
  return { rootExists: !!root, contentExists: !!content, visible: visibleState, pageCount: content ? content.querySelectorAll('.preview-render-layer .rpt-page, .preview-hit-layer .pv-page').length : 0, rect: rect || contentRect, transform: style?.transform ?? styleOf(content)?.transform ?? null, scale: scaleFrom(style?.transform ?? styleOf(content)?.transform ?? null), rendererTargetSelector: target?.id ? `#${target.id}` : target?.className ? `.${String(target.className).trim().split(/\s+/).filter(Boolean).join('.')}` : null };
}

function addFinding(list, seen, finding) { const key = `${finding.code}|${finding.selector || ''}|${finding.message || ''}`; if (seen.has(key)) return; seen.add(key); list.push({ ...finding, evidence: (finding.evidence || []).slice(0, 6) }); }

export function buildRenderPreviewSnapshot({ ds = typeof DS !== 'undefined' ? DS : null, doc = typeof document !== 'undefined' ? document : null, timeline = null, network = null, performance = null, asyncRace = null, loopFreeze = null, bundle = null, traceState = timeline?.sourceState || 'absent', active = false } = {}) {
  const events = eventList(timeline).slice(-LIMITS.maxEvidence).map((entry, index) => ({ index: index + 1, ...entry }));
  const previewEvents = events.filter(isPreview);
  const renderEvents = events.filter(isRender);
  const exportEvents = events.filter(isExport);
  const lifecycle = { lastPreviewEvent: eventInfo(lastMatch(events, isPreview)), lastRenderEvent: eventInfo(lastMatch(events, isRender)), lastExportEvent: eventInfo(lastMatch(events, isExport)) };
  const dom = previewDom(doc);
  const previewRequests = reqs(network, 'preview');
  const renderRequests = reqs(network, 'render');
  const auditRequests = reqs(network, 'audit');
  const exportRequests = reqs(network, 'export');
  const failedRequests = [...failed(network, 'preview'), ...failed(network, 'render'), ...failed(network, 'audit'), ...failed(network, 'export')];
  const slowRequests = [...slow(network, 'preview'), ...slow(network, 'render'), ...slow(network, 'audit'), ...slow(network, 'export')];
  const previewSignals = !!ds?.previewMode || previewEvents.length > 0 || renderEvents.length > 0 || previewRequests.length > 0 || renderRequests.length > 0;
  const mode = previewSignals ? 'preview' : ds && ds.previewMode === false ? 'design' : 'unknown';
  const findings = [];
  const seen = new Set();
  const evidence = [];
  const pushE = (...items) => { for (const item of items) if (item != null && evidence.length < LIMITS.maxEvidence) evidence.push(clip(item)); };
  pushE(`mode=${mode}`, `root=${dom.rootExists}`, `content=${dom.contentExists}`, `pages=${dom.pageCount}`);
  if (lifecycle.lastPreviewEvent) pushE(`preview=${lifecycle.lastPreviewEvent.source || lifecycle.lastPreviewEvent.module || lifecycle.lastPreviewEvent.action}`);
  if (lifecycle.lastRenderEvent) pushE(`render=${lifecycle.lastRenderEvent.source || lifecycle.lastRenderEvent.module || lifecycle.lastRenderEvent.action}`);
  if (previewRequests[0]) pushE(`previewRequest=${previewRequests[0].path || previewRequests[0].url}`, `status=${previewRequests[0].status ?? 'n/a'}`);
  if (renderRequests[0]) pushE(`renderRequest=${renderRequests[0].path || renderRequests[0].url}`, `status=${renderRequests[0].status ?? 'n/a'}`);
  if (exportRequests[0]) pushE(`exportRequest=${exportRequests[0].path || exportRequests[0].url}`, `status=${exportRequests[0].status ?? 'n/a'}`);
  if ((mode === 'preview' || previewSignals) && !dom.rootExists) addFinding(findings, seen, { code: 'PREVIEW_ROOT_MISSING', severity: 'error', node: null, selector: '#preview-layer', evidence: ['preview active but root missing'], ownerExpected: 'engines/PreviewEngineRenderer.js', suggestion: 'restore preview root' });
  if (dom.rootExists && !dom.contentExists) addFinding(findings, seen, { code: 'PREVIEW_CONTENT_MISSING', severity: 'error', node: 'preview-layer', selector: '#preview-content', evidence: ['preview root exists but content missing'], ownerExpected: 'engines/PreviewEngineRenderer.js', suggestion: 'restore preview content' });
  if (dom.contentExists && !dom.visible) addFinding(findings, seen, { code: 'PREVIEW_NOT_VISIBLE', severity: 'warning', node: 'preview-content', selector: '#preview-content', evidence: [dom.rect ? `rect=${JSON.stringify(dom.rect)}` : 'rect missing', `transform=${dom.transform || 'none'}`], ownerExpected: 'engines/PreviewEngineRenderer.js', suggestion: 'restore preview visibility' });
  if (failedRequests.length) addFinding(findings, seen, { code: 'PREVIEW_REQUEST_FAILED', severity: failedRequests.some((r) => (r.status || 0) >= 500 || r.error) ? 'error' : 'warning', node: failedRequests[0].path || failedRequests[0].url || 'request', selector: failedRequests[0].path || failedRequests[0].url || null, evidence: failedRequests.slice(0, 2).map((r) => `${r.method || 'GET'} ${r.path || r.url} ${r.status ?? 'error'}`), ownerExpected: failedRequests[0].ownerExpected || 'engines/PreviewEngineRenderer.js', suggestion: 'inspect preview render request' });
  if (slowRequests.length) addFinding(findings, seen, { code: 'PREVIEW_REQUEST_SLOW', severity: 'warning', node: slowRequests[0].path || slowRequests[0].url || 'request', selector: slowRequests[0].path || slowRequests[0].url || null, evidence: slowRequests.slice(0, 2).map((r) => `${r.method || 'GET'} ${r.path || r.url} ${r.durationMs ?? r.ageMs ?? 0}ms`), ownerExpected: slowRequests[0].ownerExpected || 'engines/PreviewEngineRenderer.js', suggestion: 'inspect preview render latency' });
  const renderOutOfOrder = asyncRace?.raceFindings?.find?.((f) => f.ruleId === 'RENDER_AFTER_NEWER_RENDER');
  if (renderOutOfOrder) addFinding(findings, seen, { code: 'RENDER_OUT_OF_ORDER', severity: renderOutOfOrder.severity || 'warning', node: renderOutOfOrder.renderId || renderOutOfOrder.transactionId || null, selector: null, evidence: renderOutOfOrder.evidence || ['async race render order'], ownerExpected: renderOutOfOrder.suggestedOwner || 'engines/PreviewEngineRenderer.js', suggestion: 'serialize preview render completion' });
  const missingRenderEnd = asyncRace?.missingEnds?.find?.((f) => /render/i.test(`${f.ruleId || ''} ${f.message || ''}`));
  if (missingRenderEnd) addFinding(findings, seen, { code: 'RENDER_MISSING_END', severity: missingRenderEnd.severity || 'warning', node: missingRenderEnd.renderId || missingRenderEnd.transactionId || null, selector: null, evidence: missingRenderEnd.evidence || ['render missing end'], ownerExpected: missingRenderEnd.suggestedOwner || 'engines/PreviewEngineRenderer.js', suggestion: 'close render transaction' });
  if (dom.contentExists && (dom.pageCount || 0) === 0 && previewRequests.some((r) => (r.ok ?? true) && (r.status == null || (r.status >= 200 && r.status < 400)))) addFinding(findings, seen, { code: 'PREVIEW_DOM_EMPTY_AFTER_SUCCESS', severity: 'warning', node: 'preview-content', selector: '#preview-content', evidence: ['successful preview request but no pages', `requests=${previewRequests.length}`], ownerExpected: 'engines/PreviewEngineRenderer.js', suggestion: 'ensure preview HTML is rendered into preview content' });
  if (dom.contentExists && doc?.querySelector?.('#preview-content .cr-element, #preview-content .cr-section, #preview-content #canvas-layer')) addFinding(findings, seen, { code: 'PREVIEW_USES_DESIGN_CANVAS_SUSPECTED', severity: 'warning', node: 'preview-content', selector: '#preview-content', evidence: ['design canvas nodes leaked into preview content'], ownerExpected: 'engines/PreviewEngineRenderer.js', suggestion: 'use renderer output instead of design canvas DOM' });
  const exportFailed = failedRequests.find((r) => requestKind(r) === 'export');
  if (exportFailed) addFinding(findings, seen, { code: 'EXPORT_PDF_REQUEST_FAILED', severity: (exportFailed.status || 0) >= 500 || exportFailed.error ? 'error' : 'warning', node: exportFailed.path || exportFailed.url || 'export', selector: exportFailed.path || exportFailed.url || null, evidence: [`${exportFailed.method || 'POST'} ${exportFailed.path || exportFailed.url}`, `status=${exportFailed.status ?? 'error'}`], ownerExpected: exportFailed.ownerExpected || 'engines/PreviewEngineRenderer.js', suggestion: 'inspect export/pdf request' });
  const status = findings.some((item) => item.severity === 'error') ? 'error' : findings.some((item) => item.severity === 'warning') ? 'warning' : previewSignals ? 'info' : 'ok';
  const perfHits = (performance?.topSlowOperations || []).filter((item) => /preview|render|pdf/i.test([item.label, item.source, item.module, item.action, item.path].filter(Boolean).join(' '))).slice(0, 4);
  const timelineCorr = [lifecycle.lastPreviewEvent, lifecycle.lastRenderEvent, lifecycle.lastExportEvent].filter(Boolean).map((item) => `${item.source || item.module || 'unknown'} · ${item.action || 'event'}`).slice(0, 4);
  const asyncCorr = (asyncRace?.raceFindings || []).filter((item) => /render|preview/i.test([item.ruleId, item.message].filter(Boolean).join(' '))).slice(0, 4).map((item) => item.ruleId);
  const evidenceSet = [...new Set([...evidence, ...findings.flatMap((item) => item.evidence || []), ...timelineCorr, ...perfHits.map((item) => item.label || item.source || 'slow op'), ...asyncCorr, ...(loopFreeze?.evidence?.slice?.(0, 2) || [])].filter(Boolean).map((item) => clip(item)))];
  const suggestedOwner = findings.find((item) => item.ownerExpected)?.ownerExpected || previewRequests[0]?.ownerExpected || renderRequests[0]?.ownerExpected || exportRequests[0]?.ownerExpected || null;
  const risk = findings.some((item) => item.severity === 'error') ? { level: 'high', reason: findings[0]?.message || 'preview/render error' } : findings.some((item) => item.severity === 'warning') ? { level: 'medium', reason: findings[0]?.message || 'preview/render divergence' } : previewSignals ? { level: 'low', reason: 'preview visible without findings' } : { level: 'none', reason: 'no preview signals' };
  state.snapshot = { timestamp: now(), project: 'reportforge', engine: 'render-preview', status, mode, lifecycle, previewDom: dom, network: { previewRequests, renderRequests, auditRequests, exportRequests, failed: failedRequests, slow: slowRequests }, correlations: { timeline: timelineCorr, performance: perfHits.map((item) => item.label || item.source || 'slow op'), asyncRace: asyncCorr }, findings: findings.slice(0, LIMITS.maxFindings), evidence: evidenceSet.slice(0, LIMITS.maxEvidence), suggestedOwner, sourceState: traceState || 'absent', limits: LIMITS, risk, bundle: bundle ? { status: bundle.status || 'unknown', filename: bundle.filename || null } : null, active: !!active };
  return state.snapshot;
}

export function refreshRenderPreviewSnapshot(context = {}) { state.lastContext = context; state.snapshot = buildRenderPreviewSnapshot(context); return state.snapshot; }
export function clearRenderPreviewSnapshot() { state.lastContext = {}; state.snapshot = neutralSnapshot(); return state.snapshot; }
export function getRenderPreviewSnapshot() { return state.snapshot; }
export function copyRenderPreviewJSON() { return JSON.stringify(state.snapshot, null, 2); }
