'use strict';
import { reportforgeAdapter } from './adapters/reportforge/reportforge-adapter.js';

const LIMITS = Object.freeze({ maxTargets: 80, maxFindings: 80, maxEvidence: 12, maxAncestors: 6 });
const state = { lastContext: null, snapshot: null, paused: false };
const nowIso = () => new Date().toISOString();
const text = (value) => (value == null ? null : String(value));
const num = (value) => { const n = Number(value); return Number.isFinite(n) ? n : null; };
const clip = (value, limit = 120) => { const t = value == null ? '' : typeof value === 'string' ? value : JSON.stringify(value); return t.length > limit ? `${t.slice(0, limit - 1)}…` : t; };
const rectOf = (node) => { const r = node?.getBoundingClientRect?.(); return r ? { x: r.x, y: r.y, left: r.left, top: r.top, width: r.width, height: r.height, right: r.right, bottom: r.bottom } : null; };
const styleOf = (node, view) => { if (!node || !view?.getComputedStyle) return null; const s = view.getComputedStyle(node); return { display: s.display, visibility: s.visibility, opacity: s.opacity, pointerEvents: s.pointerEvents, position: s.position, zIndex: s.zIndex, overflow: s.overflow, overflowX: s.overflowX, overflowY: s.overflowY }; };
const selectorOf = (node) => { if (!node) return null; if (node.id) return `#${node.id}`; const cls = typeof node.className === 'string' ? node.className.trim().split(/\s+/)[0] : ''; return cls ? `.${cls}` : text(node.tagName || node.tag); };
const isInteractiveNode = (node, spec = {}) => spec.interactive || /^(BUTTON|INPUT|SELECT|TEXTAREA|A)$/.test(node?.tagName || '') || !!node?.onclick || !!node?.onpointerdown || !!node?.onmousedown || !!node?.onmouseup || !!node?.onchange || node?.isContentEditable || node?.getAttribute?.('role') === 'button';
const isVisible = (node, rect, style) => !!node && !!rect && rect.width > 0 && rect.height > 0 && style?.display !== 'none' && style?.visibility !== 'hidden' && style?.opacity !== '0';
const evidenceKey = (finding) => `${finding.ruleId}|${finding.selector || ''}|${(finding.evidence || []).join('|')}`;
const neutralSnapshot = () => ({ timestamp: null, project: 'reportforge', engine: 'dom-scanner', status: 'unknown', summary: { targetsScanned: 0, findings: 0, critical: 0, warnings: 0, duplicates: 0, blocked: 0, hidden: 0 }, targets: [], findings: [], evidence: [], suggestedOwner: null, limits: LIMITS });
const BASE_TARGETS = Object.freeze([
  { id: 'debug-center-root', selector: '#rf-debug-center-root', label: 'debug center root', required: 'always', ownerExpected: 'tools/rf-debug-center/rf-debug-center.js', unique: true },
  { id: 'workspace', selector: '#workspace', label: 'workspace', required: 'always', ownerExpected: 'designer/crystal-reports-designer-v4.html', unique: true },
  { id: 'canvas-layer', selector: '#canvas-layer', label: 'canvas layer', required: 'design', ownerExpected: 'engines/PreviewEngineRenderer.js', containerSelector: '#workspace', unique: true },
  { id: 'preview-layer', selector: '#preview-layer', label: 'preview layer', required: 'preview', ownerExpected: 'engines/PreviewEngineRenderer.js', containerSelector: '#workspace', unique: true },
  { id: 'preview-content', selector: '#preview-content', label: 'preview content', required: 'preview', ownerExpected: 'engines/PreviewEngineRenderer.js', containerSelector: '#preview-layer', unique: true },
  { id: 'tb-zoom', selector: '#tb-zoom', label: 'zoom toolbar', required: 'always', interactive: true, ownerExpected: 'engines/ZoomEngine.js', unique: true },
  { id: 'zw-slider', selector: '#zw-slider', label: 'zoom slider', required: 'always', interactive: true, ownerExpected: 'engines/ZoomEngine.js', containerSelector: '#tb-zoom', unique: true },
  { id: 'zw-pct', selector: '#zw-pct', label: 'zoom percent', required: 'always', ownerExpected: 'engines/ZoomEngine.js', containerSelector: '#tb-zoom', unique: true },
  { id: 'selection-box', selector: '#handles-layer .sel-box', label: 'selection box', required: 'active', ownerExpected: 'engines/SelectionOverlay.js', containerSelector: '#handles-layer', unique: true },
  { id: 'selection-handles', selector: '#handles-layer .sel-handle', label: 'selection handles', required: 'active', interactive: true, ownerExpected: 'engines/SelectionOverlay.js', containerSelector: '#handles-layer', unique: true },
  { id: 'selection-guides', selector: '#handles-layer .selection-guide', label: 'selection guides', required: 'active', ownerExpected: 'engines/SelectionOverlay.js', containerSelector: '#handles-layer', unique: true },
]);

function normalizeTarget(spec) {
  return { id: spec.id || spec.selector || spec.label, selector: spec.selector, label: spec.label || spec.id || spec.selector, required: spec.required || 'optional', interactive: !!spec.interactive, ownerExpected: spec.ownerExpected || null, containerSelector: spec.containerSelector || null, unique: spec.unique !== false };
}

function resolveTargets(adapter = reportforgeAdapter) {
  const source = typeof adapter?.getDomTargets === 'function' ? adapter.getDomTargets() : null;
  const list = Array.isArray(source) && source.length ? source : BASE_TARGETS;
  const dedup = new Map();
  for (const spec of list) {
    const target = normalizeTarget(spec);
    if (!dedup.has(target.selector)) dedup.set(target.selector, target);
  }
  return [...dedup.values()].slice(0, LIMITS.maxTargets);
}

function readMode(ds, doc) {
  if (ds?.previewMode === true) return 'preview';
  if (ds?.previewMode === false) return 'design';
  if (doc?.querySelector?.('#preview-content') && doc?.querySelector?.('#preview-content')?.classList?.contains('preview-mode')) return 'preview';
  if (doc?.querySelector?.('#canvas-layer') || doc?.querySelector?.('#workspace')) return 'design';
  return 'unknown';
}

function targetRequired(spec, mode, doc) {
  if (spec.required === 'always') return true;
  if (spec.required === 'preview') return mode === 'preview';
  if (spec.required === 'design') return mode === 'design';
  if (spec.required === 'active') return !!doc?.querySelector?.('#handles-layer');
  return false;
}

function readTarget(doc, spec, view, mode) {
  const node = doc?.querySelector?.(spec.selector) || null;
  const rect = rectOf(node);
  const style = styleOf(node, view);
  const hit = rect && doc?.elementFromPoint ? doc.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2) : null;
  const issues = [];
  return {
    id: spec.id,
    selector: spec.selector,
    label: spec.label,
    exists: !!node,
    visible: isVisible(node, rect, style),
    interactive: !!isInteractiveNode(node, spec),
    rect,
    computed: { display: style?.display ?? 'unknown', visibility: style?.visibility ?? 'unknown', opacity: style?.opacity ?? 'unknown', pointerEvents: style?.pointerEvents ?? 'unknown', position: style?.position ?? 'unknown', zIndex: style?.zIndex ?? 'auto', overflow: style?.overflow ?? 'visible' },
    elementFromPoint: { centerHit: !!(node && hit && (hit === node || node.contains?.(hit))), hitSelector: selectorOf(hit), hitTag: text(hit?.tagName) },
    issues,
    __node: node,
    __style: style,
    __spec: spec,
    __mode: mode,
  };
}

function collectDuplicateIds(doc) {
  const seen = new Map();
  const nodes = Array.from(doc?.querySelectorAll?.('[id]') || []).slice(0, LIMITS.maxTargets * 4);
  for (const node of nodes) {
    const id = node?.id;
    if (!id) continue;
    const list = seen.get(id) || [];
    list.push(node);
    seen.set(id, list);
  }
  return [...seen.entries()].filter(([, list]) => list.length > 1);
}

function ancestors(node, limit = LIMITS.maxAncestors) {
  const list = [];
  let current = node?.parentElement || null;
  while (current && list.length < limit) {
    list.push(current);
    current = current.parentElement || null;
  }
  return list;
}

function clippedByOverflow(node, view) {
  const rect = rectOf(node);
  if (!rect) return null;
  for (const ancestor of ancestors(node)) {
    const style = styleOf(ancestor, view);
    if (!style || !['hidden', 'auto', 'scroll', 'clip'].includes(String(style.overflow)) && !['hidden', 'auto', 'scroll', 'clip'].includes(String(style.overflowX)) && !['hidden', 'auto', 'scroll', 'clip'].includes(String(style.overflowY))) continue;
    const ancRect = rectOf(ancestor);
    if (!ancRect) continue;
    if (rect.left < ancRect.left || rect.top < ancRect.top || rect.right > ancRect.right || rect.bottom > ancRect.bottom) return { ancestor, ancRect, style };
  }
  return null;
}

function overlayLike(node, style) {
  const selector = selectorOf(node) || '';
  const zIndex = num(style?.zIndex);
  return /overlay|backdrop|mask|shade|selection|guide|preview-layer|hit-layer/i.test(selector) || ['fixed', 'absolute', 'sticky'].includes(String(style?.position)) || (zIndex != null && zIndex >= 20);
}

function pushFinding(findings, seen, evidence, finding) {
  const key = evidenceKey(finding);
  if (seen.has(key) || findings.length >= LIMITS.maxFindings) return false;
  seen.add(key);
  findings.push(finding);
  if (finding.evidence) {
    for (const item of finding.evidence) {
      const value = clip(item);
      if (value && evidence.length < LIMITS.maxEvidence && !evidence.includes(value)) evidence.push(value);
    }
  }
  return true;
}

function finding(ruleId, severity, title, message, selector, target, evidence, suggestedOwner) {
  return { ruleId, severity, title, message, selector, target, evidence: evidence.map((item) => clip(item)), suggestedOwner };
}

function evidenceForTarget(target) {
  const parts = [];
  parts.push(`${target.selector} exists=${target.exists}`);
  parts.push(`${target.selector} visible=${target.visible}`);
  if (target.rect) parts.push(`${target.selector} rect=${JSON.stringify(target.rect)}`);
  if (target.elementFromPoint) parts.push(`${target.selector} hit=${target.elementFromPoint.hitSelector || 'none'}`);
  return parts;
}

function scanPreview(doc, view, mode, findings, seen, evidence, targetMap) {
  const preview = doc?.querySelector?.('#preview-content') || null;
  const canvas = doc?.querySelector?.('#canvas-layer') || null;
  if (preview && canvas && isVisible(preview, rectOf(preview), styleOf(preview, view)) && isVisible(canvas, rectOf(canvas), styleOf(canvas, view))) {
    pushFinding(findings, seen, evidence, finding('DOM_DESIGN_PREVIEW_OVERLAP', 'warning', 'Design/preview overlap', 'Design canvas and preview content are both visible', '#canvas-layer', 'canvas-layer', ['canvas and preview visible together'], 'engines/PreviewEngineRenderer.js'));
  }
  const visiblePreview = !!preview && isVisible(preview, rectOf(preview), styleOf(preview, view));
  if (!visiblePreview) return;
  const pageCount = Array.from(preview.querySelectorAll?.('.pv-page, .page') || []).slice(0, LIMITS.maxTargets).length;
  if (pageCount === 0) {
    pushFinding(findings, seen, evidence, finding('DOM_PREVIEW_EMPTY_WHILE_VISIBLE', mode === 'preview' ? 'warning' : 'info', 'Preview empty while visible', 'Preview root is visible but contains no pages', '#preview-content', 'preview-content', ['preview content visible', 'preview page count 0'], 'engines/PreviewEngineRenderer.js'));
  }
}

function scanDuplicateSelectors(doc, targets, findings, seen, evidence) {
  for (const target of targets) {
    if (!target.unique) continue;
    const matches = Array.from(doc?.querySelectorAll?.(target.selector) || []).slice(0, 3);
    if (matches.length > 1) pushFinding(findings, seen, evidence, finding('DOM_DUPLICATE_TARGET_SELECTOR', 'warning', 'Duplicate target selector', 'Expected unique selector matched multiple nodes', target.selector, target.id, [`${target.selector} matched ${matches.length} nodes`], target.ownerExpected));
  }
}

function scanIdDuplicates(doc, findings, seen, evidence) {
  for (const [id, list] of collectDuplicateIds(doc)) pushFinding(findings, seen, evidence, finding('DOM_DUPLICATE_ID', 'warning', 'Duplicate DOM id', 'Multiple elements share the same id', `#${id}`, id, [`duplicate id ${id}`, `count ${list.length}`], 'designer/crystal-reports-designer-v4.html'));
}

function scanTargetIssues(doc, view, mode, targets, findings, seen, evidence) {
  for (const spec of targets) {
    const target = readTarget(doc, spec, view, mode);
    if (!target.exists) {
      if (targetRequired(spec, mode, doc)) pushFinding(findings, seen, evidence, finding('DOM_TARGET_MISSING', spec.required === 'always' ? 'warning' : 'info', 'Target missing', 'Expected target selector was not found', spec.selector, spec.id, [`missing ${spec.selector}`], spec.ownerExpected));
      continue;
    }
    if (!target.visible) pushFinding(findings, seen, evidence, finding('DOM_TARGET_HIDDEN', 'warning', 'Target hidden', 'Target exists but is hidden or zero-sized', target.selector, target.id, [`display=${target.computed.display}`, `visibility=${target.computed.visibility}`, `opacity=${target.computed.opacity}`], spec.ownerExpected));
    if (target.interactive && (!target.rect || !target.rect.width || !target.rect.height)) pushFinding(findings, seen, evidence, finding('DOM_ZERO_SIZE_CONTROL', 'error', 'Zero-size control', 'Interactive control has no measurable box', target.selector, target.id, [`rect=${JSON.stringify(target.rect)}`], spec.ownerExpected));
    if (target.interactive && !target.visible) pushFinding(findings, seen, evidence, finding('DOM_INTERACTIVE_HIDDEN', 'error', 'Interactive element hidden', 'Interactive control is hidden or zero-sized', target.selector, target.id, [`interactive ${spec.selector} hidden`], spec.ownerExpected));
    if (target.interactive && target.computed.pointerEvents === 'none') pushFinding(findings, seen, evidence, finding('DOM_POINTER_EVENTS_NONE', 'error', 'Pointer-events disabled', 'Interactive control cannot receive pointer events', target.selector, target.id, [`pointer-events=${target.computed.pointerEvents}`], spec.ownerExpected));
    if (target.visible && target.rect && doc?.elementFromPoint) {
      const hit = target.elementFromPoint;
      if (!hit.centerHit) {
        const hitNode = doc.elementFromPoint(target.rect.left + target.rect.width / 2, target.rect.top + target.rect.height / 2);
        if (hitNode) {
          const hitStyle = styleOf(hitNode, view);
          const blocked = overlayLike(hitNode, hitStyle) && num(hitStyle?.zIndex) != null && (num(hitStyle?.zIndex) ?? 0) >= (num(target.computed.zIndex) ?? 0);
          pushFinding(findings, seen, evidence, finding(blocked ? 'DOM_BLOCKED_BY_OVERLAY' : 'DOM_ELEMENT_FROM_POINT_MISMATCH', blocked ? 'warning' : 'info', blocked ? 'Blocked by overlay' : 'elementFromPoint mismatch', blocked ? 'Another element sits above the target' : 'Center hit does not resolve to the target', target.selector, target.id, [`hit=${selectorOf(hitNode) || hitNode.tagName || 'node'}`, `target=${target.selector}`], blocked ? (spec.ownerExpected || 'engines/SelectionOverlay.js') : spec.ownerExpected));
          if (blocked && target.interactive) pushFinding(findings, seen, evidence, finding('DOM_STACKING_CONTEXT_RISK', 'warning', 'Stacking context risk', 'Target appears under a visible overlay or unsafe stacking context', target.selector, target.id, [`zIndex=${target.computed.zIndex}`, `hit=${selectorOf(hitNode) || hitNode.tagName || 'node'}`], spec.ownerExpected));
        }
      }
    }
    const clip = clippedByOverflow(target.__node, view);
    if (clip) pushFinding(findings, seen, evidence, finding('DOM_CLIPPED_BY_OVERFLOW', 'warning', 'Clipped by overflow', 'Target extends beyond an overflow-clipped ancestor', target.selector, target.id, [`ancestor=${selectorOf(clip.ancestor) || clip.ancestor.tagName || 'node'}`, `targetRect=${JSON.stringify(target.rect)}`, `ancestorRect=${JSON.stringify(clip.ancRect)}`], spec.ownerExpected));
    if (spec.containerSelector) {
      const container = doc?.querySelector?.(spec.containerSelector) || null;
      if (container && !container.contains?.(target.__node)) pushFinding(findings, seen, evidence, finding('DOM_ORPHANED_CONTROL', 'warning', 'Orphaned control', 'Control exists outside its expected container', target.selector, target.id, [`container=${spec.containerSelector}`, `owner=${selectorOf(container) || container.tagName || 'node'}`], spec.ownerExpected));
    }
    if (evidence.length < LIMITS.maxEvidence) evidence.push(...evidenceForTarget(target).slice(0, 2).filter(Boolean));
  }
}

export function buildDomScanner({ doc = typeof document !== 'undefined' ? document : null, ds = typeof DS !== 'undefined' ? DS : null, adapter = reportforgeAdapter } = {}) {
  if (!doc) return neutralSnapshot();
  const view = doc.defaultView || globalThis;
  const mode = readMode(ds, doc);
  const targets = resolveTargets(adapter).map((spec) => readTarget(doc, spec, view, mode)).slice(0, LIMITS.maxTargets);
  const findings = [];
  const seen = new Set();
  const evidence = [];
  const targetMap = new Map(targets.map((target) => [target.id, target]));
  scanIdDuplicates(doc, findings, seen, evidence);
  scanDuplicateSelectors(doc, resolveTargets(adapter), findings, seen, evidence);
  scanTargetIssues(doc, view, mode, resolveTargets(adapter), findings, seen, evidence);
  scanPreview(doc, view, mode, findings, seen, evidence, targetMap);
  for (const finding of findings) {
    const target = targetMap.get(finding.target);
    if (target && Array.isArray(target.issues) && !target.issues.includes(finding.ruleId)) target.issues.push(finding.ruleId);
  }
  const summary = {
    targetsScanned: targets.length,
    findings: findings.length,
    critical: findings.filter((item) => item.severity === 'error').length,
    warnings: findings.filter((item) => item.severity === 'warning').length,
    duplicates: findings.filter((item) => item.ruleId === 'DOM_DUPLICATE_ID' || item.ruleId === 'DOM_DUPLICATE_TARGET_SELECTOR').length,
    blocked: findings.filter((item) => ['DOM_BLOCKED_BY_OVERLAY', 'DOM_POINTER_EVENTS_NONE', 'DOM_STACKING_CONTEXT_RISK'].includes(item.ruleId)).length,
    hidden: targets.filter((item) => item.exists && !item.visible).length,
  };
  const status = summary.critical ? 'error' : summary.findings ? 'warning' : mode === 'unknown' ? 'info' : 'ok';
  const suggestedOwner = findings[0]?.suggestedOwner || null;
  return { timestamp: nowIso(), project: 'reportforge', engine: 'dom-scanner', status, summary, targets: targets.map(({ __node, __style, __spec, __mode, ...item }) => item), findings, evidence: evidence.slice(0, LIMITS.maxEvidence), suggestedOwner, limits: LIMITS };
}

export function refreshDomScannerSnapshot(context = {}) {
  state.paused = false;
  state.lastContext = context;
  state.snapshot = buildDomScanner(context);
  return state.snapshot;
}

export function clearDomScannerSnapshot() {
  state.paused = true;
  state.lastContext = null;
  state.snapshot = neutralSnapshot();
  return state.snapshot;
}

export function isDomScannerPaused() { return state.paused; }
export function getDomScannerSnapshot() { return state.snapshot || neutralSnapshot(); }
export function copyDomScannerJSON() { return JSON.stringify(getDomScannerSnapshot(), null, 2); }
