'use strict';

function num(value) { const n = Number(value); return Number.isFinite(n) ? n : null; }
function text(value) { return value == null ? null : String(value); }
function readStyle(node, view) { if (!node || !view?.getComputedStyle) return null; const s = view.getComputedStyle(node); return { display: s.display, visibility: s.visibility, opacity: s.opacity, transform: s.transform, zIndex: s.zIndex, pointerEvents: s.pointerEvents }; }
function readRect(node) { if (!node?.getBoundingClientRect) return null; const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, left: r.left, top: r.top, width: r.width, height: r.height, right: r.right, bottom: r.bottom }; }
function readVisible(node, doc, view) { const rect = readRect(node); const style = readStyle(node, view); const visible = !!node && !!rect && rect.width > 0 && rect.height > 0 && style?.display !== 'none' && style?.visibility !== 'hidden' && style?.opacity !== '0'; const cx = rect ? rect.left + rect.width / 2 : 0; const cy = rect ? rect.top + rect.height / 2 : 0; const visibleElement = rect && doc?.elementFromPoint ? doc.elementFromPoint(cx, cy) : null; return { rect, style, visible, visibleElement: visibleElement ? { tag: visibleElement.tagName || null, id: visibleElement.id || null, className: typeof visibleElement.className === 'string' ? visibleElement.className : null, datasetId: visibleElement.dataset?.id || null, datasetOriginId: visibleElement.dataset?.originId || null } : null }; }
function parseScale(transform) { if (!transform || transform === 'none') return null; const matrix = /^matrix\(([^)]+)\)$/.exec(transform); if (matrix) { const parts = matrix[1].split(',').map(Number); return num(parts[0]); } const matrix3d = /^matrix3d\(([^)]+)\)$/.exec(transform); if (matrix3d) { const parts = matrix3d[1].split(',').map(Number); return num(parts[0]); } const scale = /^scale\(([^)]+)\)$/.exec(transform); if (scale) { const parts = scale[1].split(',').map(Number); return num(parts[0]); } return null; }
function inspectTraceApi(traceApi) { if (!traceApi) return { state: 'absent', count: 0, entries: [] }; if (typeof traceApi.getEntries !== 'function') return { state: 'invalid', count: 0, entries: [] }; try { const entries = traceApi.getEntries(); if (!Array.isArray(entries)) return { state: 'invalid', count: 0, entries: [] }; return { state: entries.length ? 'present' : 'empty', count: entries.length, entries }; } catch (_) { return { state: 'invalid', count: 0, entries: [] }; } }
function readEntries({ traceApi, timeline }) { if (Array.isArray(timeline?.entries)) return timeline.entries; if (Array.isArray(timeline?.recent) && timeline.recent.length) return timeline.recent; const inspected = inspectTraceApi(traceApi); return inspected.entries; }
function readMode(ds, doc) { if (!ds) return 'unknown'; if (ds.previewMode === true) return 'preview'; const canvas = doc?.getElementById?.('canvas-layer'); if (canvas?.classList?.contains('preview-mode')) return 'preview'; return 'design'; }
function readControls(doc) {
  const slider = doc?.getElementById?.('zw-slider');
  const pct = doc?.getElementById?.('zw-pct');
  const tb = doc?.getElementById?.('tb-zoom');
  const sliderStyle = readStyle(slider, doc?.defaultView || doc?.ownerDocument?.defaultView || null);
  const pctStyle = readStyle(pct, doc?.defaultView || doc?.ownerDocument?.defaultView || null);
  const tbStyle = readStyle(tb, doc?.defaultView || doc?.ownerDocument?.defaultView || null);
  return {
    sliderValue: slider?.value ?? null,
    sliderMin: slider?.min ?? null,
    sliderMax: slider?.max ?? null,
    sliderStep: slider?.step ?? null,
    pctText: pct?.textContent ?? null,
    tbZoomValue: tb?.value ?? null,
    tbZoomText: tb?.selectedOptions?.[0]?.textContent ?? tb?.textContent ?? null,
    sliderVisible: !!slider && sliderStyle?.display !== 'none' && sliderStyle?.visibility !== 'hidden' && sliderStyle?.opacity !== '0',
    pctVisible: !!pct && pctStyle?.display !== 'none' && pctStyle?.visibility !== 'hidden' && pctStyle?.opacity !== '0',
    tbZoomVisible: !!tb && tbStyle?.display !== 'none' && tbStyle?.visibility !== 'hidden' && tbStyle?.opacity !== '0',
  };
}
function readZoomTarget(doc) { return doc?.getElementById?.('canvas-layer') || doc?.getElementById?.('preview-content') || null; }
function readDom(doc, mode) {
  const target = readZoomTarget(doc);
  const view = doc?.defaultView || doc?.ownerDocument?.defaultView || null;
  const snap = readVisible(target, doc, view);
  return { targetSelector: target?.id ? `#${target.id}` : null, transform: snap.style?.transform ?? null, scale: parseScale(snap.style?.transform), rect: snap.rect, visible: snap.visible, visibleElement: snap.visibleElement, modeHint: mode };
}
function firstNumber(...values) { for (const value of values) { const n = num(value); if (n != null) return n; } return null; }
function expectedPct(zoomValue) { return zoomValue == null ? null : `${Math.round(zoomValue * 100)}%`; }
function normalizeEvent(entry) { if (!entry) return null; return { timestamp: entry.timestamp ?? null, source: entry.source ?? entry.module ?? null, module: entry.module ?? entry.source ?? null, action: entry.action ?? entry.event ?? null, fn: entry.fn ?? null, severity: entry.severity ?? 'info', eventId: entry.eventId ?? entry.id ?? null, transactionId: entry.transactionId ?? null, phase: entry.phase ?? null, before: entry.before ?? null, after: entry.after ?? null, state: entry.state ?? null, dom: entry.dom ?? null, durationMs: num(entry.durationMs), ownerExpected: entry.ownerExpected ?? null, writerActual: entry.writerActual ?? entry.fn ?? null, result: entry.result ?? null, error: entry.error ?? null, raw: entry }; }
function findLastZoomEvent(entries) { const list = Array.isArray(entries) ? entries : []; for (let i = list.length - 1; i >= 0; i -= 1) { const entry = list[i]; const haystack = `${entry?.source || ''} ${entry?.module || ''} ${entry?.action || ''} ${entry?.event || ''}`.toLowerCase(); if (/zoom|wheel|slider|\bplus\b|\bminus\b|\breset\b|\bprogrammatic\b/.test(haystack)) return normalizeEvent(entry); } return null; }
function addIssue(divergences, evidence, key, message) { divergences.push(key); evidence.push(message); }
export function buildZoomDiagnostics({ ds = null, traceApi = null, timeline = null, doc = null } = {}) {
  const mode = readMode(ds, doc);
  const controls = readControls(doc);
  const dom = readDom(doc, mode);
  const traceState = timeline?.sourceState || inspectTraceApi(traceApi).state;
  const entries = readEntries({ traceApi, timeline });
  const lastZoomEvent = findLastZoomEvent(entries);
  const zoom = {
    dsZoom: ds?.zoom ?? null,
    dsZoomDesign: ds?.zoomDesign ?? null,
    dsZoomPreview: ds?.zoomPreview ?? ds?.previewZoom ?? null,
    effectiveZoom: mode === 'preview'
      ? firstNumber(ds?.previewZoom, ds?.zoomPreview, ds?.zoom, ds?.zoomDesign)
      : firstNumber(ds?.zoom, ds?.zoomDesign, ds?.previewZoom, ds?.zoomPreview),
  };
  const divergences = [];
  const evidence = [];
  let status = 'synced';
  let suggestedOwner = null;
  if (!ds) { status = 'unknown'; addIssue(divergences, evidence, 'ds-missing', 'DS unavailable'); }
  if (traceState === 'absent') { if (status === 'synced') status = 'unknown'; addIssue(divergences, evidence, 'trace-absent', 'RF_UI_TRACE absent'); }
  if (traceState === 'invalid') { status = 'unknown'; addIssue(divergences, evidence, 'trace-invalid', 'RF_UI_TRACE invalid/no compatible'); }
  if (traceState === 'empty') { if (status === 'synced') status = 'warning'; addIssue(divergences, evidence, 'trace-empty', 'RF_UI_TRACE empty'); }
  if (!controls.sliderVisible) { if (status === 'synced') status = 'unknown'; addIssue(divergences, evidence, 'slider-missing', 'zoom slider not visible'); }
  if (!controls.pctVisible) { if (status === 'synced') status = 'unknown'; addIssue(divergences, evidence, 'pct-missing', 'zoom percentage not visible'); }
  if (!dom.visible) { if (status === 'synced') status = 'warning'; addIssue(divergences, evidence, 'target-not-visible', `${dom.targetSelector || 'zoom target'} not visible`); }
  const zoomPct = zoom.effectiveZoom == null ? null : Math.round(zoom.effectiveZoom * 100);
  if (zoomPct != null && controls.sliderValue != null && String(zoomPct) !== String(controls.sliderValue)) { status = 'error'; addIssue(divergences, evidence, 'slider-mismatch', `slider ${controls.sliderValue} != zoom ${zoomPct}`); suggestedOwner ||= 'engines/ZoomEngine.js'; }
  if (controls.sliderValue != null && controls.pctText != null && controls.pctText !== `${controls.sliderValue}%`) { status = 'error'; addIssue(divergences, evidence, 'pct-mismatch', `pct ${controls.pctText} != slider ${controls.sliderValue}`); suggestedOwner ||= 'engines/ZoomEngine.js'; }
  if (zoom.effectiveZoom != null && dom.scale != null && Math.abs(dom.scale - zoom.effectiveZoom) > 0.01) { status = 'error'; addIssue(divergences, evidence, 'dom-mismatch', `dom scale ${dom.scale} != zoom ${zoom.effectiveZoom}`); suggestedOwner ||= 'engines/ZoomEngine.js'; }
  if (controls.sliderStep != null && zoomPct != null && Number.isFinite(Number(controls.sliderStep)) && zoomPct % Number(controls.sliderStep) !== 0) { if (status === 'synced') status = 'warning'; addIssue(divergences, evidence, 'step-incompatible', `step ${controls.sliderStep} cannot represent ${zoomPct}`); suggestedOwner ||= 'engines/ZoomEngine.js'; }
  const eventSource = `${lastZoomEvent?.source || lastZoomEvent?.raw?.source || ''}`;
  const eventWriter = `${lastZoomEvent?.writerActual || lastZoomEvent?.raw?.writerActual || lastZoomEvent?.raw?.fn || ''}`;
  const previewBridge = mode === 'preview' && /DesignZoomEngine/i.test(eventSource);
  if (previewBridge) {
    evidence.push(`preview bridge ${eventSource || '—'} via ${eventWriter || '—'}`);
    suggestedOwner ||= 'engines/GlobalEventHandlers.js';
  }
  if (!lastZoomEvent) { if (status === 'synced') status = traceState === 'present' ? 'warning' : 'unknown'; addIssue(divergences, evidence, 'zoom-event-missing', 'no zoom event found in RF_UI_TRACE'); }
  evidence.push(`mode ${mode} · trace ${traceState} · target ${dom.targetSelector || '—'}`);
  if (dom.transform || dom.scale != null) evidence.push(`transform ${dom.transform || 'none'} · scale ${dom.scale ?? '—'}`);
  if (lastZoomEvent) evidence.push(`last ${lastZoomEvent.source || '—'} / ${lastZoomEvent.action || '—'}`);
  return {
    timestamp: new Date().toISOString(),
    project: 'reportforge',
    engine: 'zoom',
    mode,
    status,
    traceState,
    traceCount: Array.isArray(entries) ? entries.length : 0,
    zoom,
    controls,
    dom,
    lastZoomEvent,
    divergences,
    evidence,
    suggestedOwner,
  };
}
