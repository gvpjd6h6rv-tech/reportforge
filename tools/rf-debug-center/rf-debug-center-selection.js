'use strict';

import { clone, safeObject } from './rf-debug-center-state-utils.js';

const LIMITS = Object.freeze({ maxEntries: 24, driftThresholdPx: 4 });
const state = { lastContext: null, snapshot: null };

const nowIso = () => new Date().toISOString();
const clip = (value, limit = 120) => { const text = value == null ? '' : typeof value === 'string' ? value : JSON.stringify(value); return text.length > limit ? `${text.slice(0, limit - 1)}…` : text; };
const rectOf = (node) => { const rect = node?.getBoundingClientRect?.(); return rect ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height, right: rect.right, bottom: rect.bottom } : null; };
const styleOf = (node) => { const style = node?.ownerDocument?.defaultView?.getComputedStyle?.(node); return style ? { display: style.display, visibility: style.visibility, opacity: style.opacity, pointerEvents: style.pointerEvents, transform: style.transform, zIndex: style.zIndex } : null; };
const visible = (node, rect = rectOf(node), style = styleOf(node)) => !!node && !!rect && rect.width > 0 && rect.height > 0 && style?.display !== 'none' && style?.visibility !== 'hidden' && style?.opacity !== '0';
const idsFrom = (ds) => ds?.selection && typeof ds.selection.size === 'number' ? [...ds.selection] : Array.isArray(ds?.selection) ? ds.selection.slice() : [];
const selectedNode = (doc, id, mode) => {
  if (!doc || !id) return null;
  const selectors = mode === 'preview'
    ? [`#preview-content .pv-el.selected[data-origin-id="${id}"]`, `#preview-content .pv-el[data-origin-id="${id}"]`, `.cr-element.selected[data-id="${id}"]`, `.cr-element[data-id="${id}"]`]
    : [`.cr-element.selected[data-id="${id}"]`, `.cr-element[data-id="${id}"]`, `#preview-content .pv-el.selected[data-origin-id="${id}"]`, `#preview-content .pv-el[data-origin-id="${id}"]`];
  for (const selector of selectors) { const node = doc.querySelector?.(selector); if (node) return node; }
  return null;
};
const sectionNode = (doc, id) => (doc && id ? doc.querySelector?.(`.cr-section[data-section-id="${id}"]`) : null);
const rectFromModel = (el, secTop = 0) => el ? { left: Number(el.x) || 0, top: secTop + (Number(el.y) || 0), width: Number(el.w) || 0, height: Number(el.h) || 0 } : null;
const rectFromObject = (obj) => { if (!obj || typeof obj !== 'object') return null; const left = obj.left ?? obj.x ?? obj.modelX ?? null; const top = obj.top ?? obj.y ?? obj.modelY ?? null; const width = obj.width ?? obj.w ?? obj.modelW ?? null; const height = obj.height ?? obj.h ?? obj.modelH ?? null; if ([left, top, width, height].every((v) => v == null)) return null; return { left: Number(left) || 0, top: Number(top) || 0, width: Number(width) || 0, height: Number(height) || 0, right: (Number(left) || 0) + (Number(width) || 0), bottom: (Number(top) || 0) + (Number(height) || 0) }; };
const deltaFrom = (a, b) => a && b ? { dx: (Number(b.left) || 0) - (Number(a.left) || 0), dy: (Number(b.top) || 0) - (Number(a.top) || 0), dw: (Number(b.width) || 0) - (Number(a.width) || 0), dh: (Number(b.height) || 0) - (Number(a.height) || 0) } : null;
const eventList = (timeline) => Array.isArray(timeline?.entries) && timeline.entries.length ? timeline.entries : Array.isArray(timeline?.recent) ? timeline.recent : [];
const lastMatch = (timeline, predicate) => { const items = eventList(timeline); for (let i = items.length - 1; i >= 0; i -= 1) if (predicate(items[i])) return items[i]; return null; };
const eventInfo = (event) => event ? { timestamp: event.timestamp ?? null, source: event.source ?? event.module ?? null, module: event.module ?? event.source ?? null, action: event.action ?? event.event ?? null, eventId: event.eventId ?? null, transactionId: event.transactionId ?? null, writerActual: event.writerActual ?? event.fn ?? null, ownerExpected: event.ownerExpected ?? event.owner ?? null, before: clone(event.before ?? null), after: clone(event.after ?? null) } : null;
const sameRect = (a, b, threshold = LIMITS.driftThresholdPx) => !!a && !!b && Math.abs((a.left || 0) - (b.left || 0)) <= threshold && Math.abs((a.top || 0) - (b.top || 0)) <= threshold && Math.abs((a.width || 0) - (b.width || 0)) <= threshold && Math.abs((a.height || 0) - (b.height || 0)) <= threshold;
const addFinding = (list, seen, finding) => { const key = `${finding.code}|${finding.selector || ''}|${finding.message || ''}`; if (seen.has(key)) return; seen.add(key); list.push(finding); };
function neutralSnapshot() { return { timestamp: null, project: 'reportforge', engine: 'selection', status: 'unknown', mode: 'unknown', selected: { ids: [], id: null, type: null, source: null }, visual: { selectionBoxVisible: null, handlesVisible: null, guidesVisible: null, selectedRect: null, overlayRect: null, computed: {} }, drag: { lastEvent: null, delta: null, modelBefore: null, modelAfter: null, domBefore: null, domAfter: null }, resize: { lastEvent: null, modelBefore: null, modelAfter: null, domBefore: null, domAfter: null }, section: { id: null, rect: null, outOfBounds: null }, findings: [], evidence: [], suggestedOwner: null }; }

export function buildSelectionSnapshot({ ds = typeof DS !== 'undefined' ? DS : null, doc = typeof document !== 'undefined' ? document : null, timeline = null, traceState = timeline?.sourceState || 'absent', bundle = null, ownership = null } = {}) {
  const ids = idsFrom(ds);
  const mode = ds?.previewMode ? 'preview' : ds ? 'design' : 'unknown';
  const primaryId = ids[0] || null;
  const element = primaryId && ds?.getElementById ? ds.getElementById(primaryId) : null;
  const selectionNode = selectedNode(doc, primaryId, mode);
  const overlayBox = doc?.querySelector?.('#handles-layer .sel-box') || null;
  const handles = Array.from(doc?.querySelectorAll?.('#handles-layer .sel-handle') || []);
  const guides = Array.from(doc?.querySelectorAll?.('#handles-layer .selection-guide') || []);
  const section = element?.sectionId ? sectionNode(doc, element.sectionId) : null;
  const selectedRect = rectOf(selectionNode);
  const overlayRect = rectOf(overlayBox);
  const sectionRect = rectOf(section);
  const selectedVisible = visible(selectionNode, selectedRect);
  const overlayVisible = visible(overlayBox, overlayRect);
  const handlesVisible = handles.some((node) => visible(node));
  const guidesVisible = guides.some((node) => visible(node));
  const modelRect = element ? rectFromModel(element, ds?.getSectionTop?.(element.sectionId) || 0) : null;
  const selectionEvent = lastMatch(timeline, (entry) => /SelectionOverlay|SelectionInteraction|DragEngine/i.test(String(entry?.source || entry?.module || '')) && /(select|drag|move|resize)/i.test(String(entry?.action || entry?.event || '')));
  const dragEvent = lastMatch(timeline, (entry) => /SelectionInteraction|DragEngine/i.test(String(entry?.source || entry?.module || '')) && /(move|drag)/i.test(String(entry?.action || entry?.event || '')));
  const resizeEvent = lastMatch(timeline, (entry) => /SelectionInteraction|DragEngine/i.test(String(entry?.source || entry?.module || '')) && /resize/i.test(String(entry?.action || entry?.event || '')));
  const findings = [];
  const seen = new Set();
  const evidence = [];
  const pushEvidence = (value) => { if (value != null && evidence.length < LIMITS.maxEntries) evidence.push(clip(value, 140)); };
  if (primaryId) pushEvidence(`selected=${primaryId}`);
  pushEvidence(`mode=${mode}`);
  pushEvidence(`box=${overlayVisible}`);
  pushEvidence(`handles=${handlesVisible}`);
  pushEvidence(`guides=${guidesVisible}`);
  if (selectionEvent) pushEvidence(`source=${selectionEvent.source || selectionEvent.module || 'unknown'}`);
  if (!ids.length) {
    if (!ds) pushEvidence('selection source absent');
  } else {
    if (!selectionNode) addFinding(findings, seen, { code: 'SELECTED_ELEMENT_MISSING', severity: 'error', node: primaryId, selector: primaryId ? `#${primaryId}` : null, evidence: 'selected id has no visible DOM node', ownerExpected: 'engines/SelectionOverlay.js', suggestion: 'restore selected DOM node' });
    if (!overlayVisible) addFinding(findings, seen, { code: 'SELECTION_BOX_MISSING', severity: 'warning', node: primaryId, selector: '#handles-layer .sel-box', evidence: 'selection box not visible', ownerExpected: 'engines/SelectionOverlay.js', suggestion: 'render selection box' });
    if (ids.length === 1 && !handlesVisible) addFinding(findings, seen, { code: 'HANDLES_MISSING', severity: 'warning', node: primaryId, selector: '#handles-layer .sel-handle', evidence: 'single selection without visible handles', ownerExpected: 'engines/SelectionOverlay.js', suggestion: 'render resize handles' });
    if (selectionNode && !selectedVisible) addFinding(findings, seen, { code: 'SELECTED_ELEMENT_HIDDEN', severity: 'warning', node: selectionNode.id || primaryId, selector: primaryId ? `#${primaryId}` : null, evidence: `style ${JSON.stringify(styleOf(selectionNode))}`, ownerExpected: mode === 'preview' ? 'engines/PreviewEngineRenderer.js' : 'engines/CanvasLayoutEngine.js', suggestion: 'restore visibility of selected node' });
    if (selectedRect && overlayRect && !sameRect(selectedRect, overlayRect)) addFinding(findings, seen, { code: 'MODEL_DOM_POSITION_DRIFT', severity: 'warning', node: primaryId, selector: '#handles-layer .sel-box', evidence: [`selected=${JSON.stringify(selectedRect)}`, `overlay=${JSON.stringify(overlayRect)}`], ownerExpected: 'engines/SelectionOverlay.js', suggestion: 'align selection box to selected model' });
    if (selectedRect && overlayRect && (Math.abs((selectedRect.width || 0) - (overlayRect.width || 0)) > LIMITS.driftThresholdPx || Math.abs((selectedRect.height || 0) - (overlayRect.height || 0)) > LIMITS.driftThresholdPx)) addFinding(findings, seen, { code: 'MODEL_DOM_SIZE_DRIFT', severity: 'warning', node: primaryId, selector: '#handles-layer .sel-box', evidence: [`selected=${JSON.stringify(selectedRect)}`, `overlay=${JSON.stringify(overlayRect)}`], ownerExpected: 'engines/SelectionOverlay.js', suggestion: 'align selection size to model' });
    if (selectedRect && sectionRect && (selectedRect.left < sectionRect.left - LIMITS.driftThresholdPx || selectedRect.top < sectionRect.top - LIMITS.driftThresholdPx || selectedRect.right > sectionRect.right + LIMITS.driftThresholdPx || selectedRect.bottom > sectionRect.bottom + LIMITS.driftThresholdPx)) addFinding(findings, seen, { code: 'ELEMENT_OUT_OF_SECTION', severity: 'warning', node: primaryId, selector: section ? `.cr-section[data-section-id="${element.sectionId}"]` : null, evidence: [`element=${JSON.stringify(selectedRect)}`, `section=${JSON.stringify(sectionRect)}`], ownerExpected: 'engines/SelectionInteraction.js', suggestion: 'clamp selection inside section bounds' });
  }
  const dragBefore = rectFromObject(dragEvent?.before);
  const dragAfter = rectFromObject(dragEvent?.after);
  const dragDomBefore = rectFromObject(dragEvent?.before?.dom);
  const dragDomAfter = rectFromObject(dragEvent?.after?.dom);
  const resizeBefore = rectFromObject(resizeEvent?.before);
  const resizeAfter = rectFromObject(resizeEvent?.after);
  const resizeDomBefore = rectFromObject(resizeEvent?.before?.dom);
  const resizeDomAfter = rectFromObject(resizeEvent?.after?.dom);
  if (dragEvent) {
    pushEvidence(`drag=${dragEvent.source || dragEvent.module || dragEvent.action || 'event'}`);
    if (dragBefore && dragAfter && sameRect(dragBefore, dragAfter)) addFinding(findings, seen, { code: 'DRAG_WITHOUT_MODEL_UPDATE', severity: 'warning', node: primaryId, selector: '#handles-layer .sel-box', evidence: [`before=${JSON.stringify(dragBefore)}`, `after=${JSON.stringify(dragAfter)}`], ownerExpected: 'engines/SelectionInteraction.js', suggestion: 'write model updates during drag' });
  }
  if (resizeEvent) {
    pushEvidence(`resize=${resizeEvent.source || resizeEvent.module || resizeEvent.action || 'event'}`);
    if (resizeDomBefore && resizeDomAfter && sameRect(resizeDomBefore, resizeDomAfter)) addFinding(findings, seen, { code: 'RESIZE_WITHOUT_DOM_UPDATE', severity: 'warning', node: primaryId, selector: '#handles-layer .sel-box', evidence: [`before=${JSON.stringify(resizeDomBefore)}`, `after=${JSON.stringify(resizeDomAfter)}`], ownerExpected: 'engines/SelectionInteraction.js', suggestion: 'write DOM updates during resize' });
  }
  const status = !ids.length ? (ds ? 'ok' : 'unknown') : findings.some((f) => f.severity === 'error') ? 'error' : findings.some((f) => f.severity === 'warning') ? 'warning' : findings.some((f) => f.severity === 'info') ? 'info' : 'ok';
  const selected = { ids, id: primaryId, type: element?.type ?? null, source: selectionEvent?.source || selectionEvent?.writerActual || null };
  const visual = { selectionBoxVisible: overlayVisible, handlesVisible, guidesVisible, selectedRect, overlayRect, computed: { selected: styleOf(selectionNode), overlay: styleOf(overlayBox), hit: selectedRect && doc?.elementFromPoint ? (() => { const hit = doc.elementFromPoint(selectedRect.left + selectedRect.width / 2, selectedRect.top + selectedRect.height / 2); return hit ? { tag: hit.tagName || null, id: hit.id || null, className: typeof hit.className === 'string' ? hit.className : null } : null; })() : null } };
  const drag = { lastEvent: eventInfo(dragEvent), delta: dragBefore && dragAfter ? deltaFrom(dragBefore, dragAfter) : null, modelBefore: dragBefore, modelAfter: dragAfter, domBefore: dragDomBefore, domAfter: dragDomAfter };
  const resize = { lastEvent: eventInfo(resizeEvent), modelBefore: resizeBefore, modelAfter: resizeAfter, domBefore: resizeDomBefore, domAfter: resizeDomAfter };
  const sectionOut = !!(selectedRect && sectionRect && (selectedRect.left < sectionRect.left - LIMITS.driftThresholdPx || selectedRect.top < sectionRect.top - LIMITS.driftThresholdPx || selectedRect.right > sectionRect.right + LIMITS.driftThresholdPx || selectedRect.bottom > sectionRect.bottom + LIMITS.driftThresholdPx));
  if (sectionOut) pushEvidence('section bounds exceeded');
  const suggestedOwner = findings[0]?.ownerExpected || null;
  return { timestamp: nowIso(), project: 'reportforge', engine: 'selection', status, mode, selected, visual, drag, resize, section: { id: element?.sectionId ?? null, rect: sectionRect, outOfBounds: sectionRect && selectedRect ? sectionOut : null }, findings: findings.slice(0, LIMITS.maxEntries), evidence: evidence.slice(0, LIMITS.maxEntries), suggestedOwner };
}

export function refreshSelectionSnapshot(context = {}) { state.lastContext = context; state.snapshot = buildSelectionSnapshot(context); return state.snapshot; }
export function clearSelectionSnapshot() { state.lastContext = {}; state.snapshot = neutralSnapshot(); return state.snapshot; }
export function getSelectionSnapshot() { return state.snapshot || buildSelectionSnapshot(state.lastContext || {}); }
export function copySelectionJSON() { return JSON.stringify(getSelectionSnapshot(), null, 2); }
