'use strict';
import { bundleLimits as LIMITS, clip, filename, sanitize } from './rf-debug-center-safe-json.js';
const SCHEMA = 'rf-debug-bundle/v1';
function traceState(traceApi) {
  if (!traceApi) return { state: 'absent', count: 0, entries: [] };
  if (typeof traceApi.getEntries !== 'function') return { state: 'invalid', count: 0, entries: [], error: 'missing getEntries()' };
  try {
    const entries = traceApi.getEntries();
    if (!Array.isArray(entries)) return { state: 'invalid', count: 0, entries: [], error: 'getEntries() must return an array' };
    return { state: entries.length ? 'present' : 'empty', count: entries.length, entries: entries.slice(0, LIMITS.maxEvents) };
  } catch (error) {
    return { state: 'invalid', count: 0, entries: [], error: error?.message || String(error) };
  }
}
function traceSummary(traceApi) {
  const source = traceState(traceApi);
  return { state: source.state, count: source.count, recent: sanitize(source.entries.slice(-12)), entries: sanitize(source.entries), error: source.error ?? null };
}
function pick(node, doc) {
  if (!node) return null;
  const view = doc?.defaultView || globalThis;
  const style = view?.getComputedStyle?.(node);
  const rect = node.getBoundingClientRect ? node.getBoundingClientRect() : null;
  const cx = rect ? rect.left + rect.width / 2 : 0;
  const cy = rect ? rect.top + rect.height / 2 : 0;
  const hit = rect && doc?.elementFromPoint ? doc.elementFromPoint(cx, cy) : null;
  return {
    selector: node.id ? `#${node.id}` : null,
    tag: node.tagName || node.tag || null,
    id: node.id || null,
    className: typeof node.className === 'string' ? node.className : null,
    visible: !!node && !!rect && rect.width > 0 && rect.height > 0 && style?.display !== 'none' && style?.visibility !== 'hidden' && style?.opacity !== '0',
    rect: rect ? { x: rect.x, y: rect.y, left: rect.left, top: rect.top, width: rect.width, height: rect.height, right: rect.right, bottom: rect.bottom } : null,
    style: style ? { display: style.display, visibility: style.visibility, opacity: style.opacity, transform: style.transform, zIndex: style.zIndex, pointerEvents: style.pointerEvents } : null,
    hit: hit ? { tag: hit.tagName || null, id: hit.id || null, className: typeof hit.className === 'string' ? hit.className : null } : null,
  };
}
function criticalDom(doc) {
  if (!doc) return { status: 'unknown', summary: {}, findings: [], owners: [] };
  const findings = [];
  const owners = new Set();
  const push = (finding) => { findings.push(finding); if (finding.ownerExpected) owners.add(finding.ownerExpected); };
  const ids = new Map();
  for (const el of doc.querySelectorAll?.('[id]') || []) {
    const count = (ids.get(el.id) || 0) + 1; ids.set(el.id, count);
    if (count === 2) push({ code: 'duplicate-id', severity: 'error', node: el.id, selector: `#${el.id}`, evidence: `duplicate id ${el.id}`, ownerExpected: 'designer/crystal-reports-designer-v4.html', suggestion: 'deduplicate DOM id' });
  }
  const critical = [
    ['#canvas-layer', 'designer/crystal-reports-designer-v4.html'],
    ['#preview-layer', 'engines/PreviewEngineRenderer.js'],
    ['#preview-content', 'engines/PreviewEngineRenderer.js'],
    ['#zw-slider', 'engines/ZoomEngine.js'],
    ['#zw-pct', 'engines/ZoomEngine.js'],
    ['#tb-zoom', 'engines/ZoomEngine.js'],
  ];
  let missing = 0;
  for (const [selector, ownerExpected] of critical) {
    const node = doc.querySelector?.(selector);
    if (!node) { missing += 1; push({ code: 'missing-node', severity: 'error', node: null, selector, evidence: `missing ${selector}`, ownerExpected, suggestion: 'restore expected designer node' }); continue; }
    const snap = pick(node, doc);
    const interactive = /^(BUTTON|INPUT|SELECT|TEXTAREA)$/.test(node.tagName || '') || node.isContentEditable || node.hasAttribute?.('role') || selector === '#zw-slider' || selector === '#zw-pct' || selector === '#tb-zoom';
    if (interactive && !snap.visible) push({ code: 'invisible-control', severity: 'warning', node: node.id || node.tagName || null, selector, evidence: `${selector} not visible`, ownerExpected, suggestion: 'restore control visibility' });
    if (interactive && snap.rect && (snap.rect.width <= 0 || snap.rect.height <= 0)) push({ code: 'zero-size-control', severity: 'error', node: node.id || node.tagName || null, selector, evidence: `${selector} has zero size`, ownerExpected, suggestion: 'restore layout dimensions' });
    if (interactive && snap.style?.pointerEvents === 'none') push({ code: 'pointer-events-conflict', severity: 'warning', node: node.id || node.tagName || null, selector, evidence: `${selector} has pointer-events none`, ownerExpected, suggestion: 'restore pointer interaction' });
    if (selector === '#canvas-layer' && doc.elementFromPoint && snap.rect) {
      const hit = doc.elementFromPoint(snap.rect.left + snap.rect.width / 2, snap.rect.top + snap.rect.height / 2);
      if (hit && hit !== node && !node.contains(hit)) push({ code: 'overlay-blocking', severity: 'warning', node: hit.id || hit.tagName || null, selector, evidence: `hit ${hit.id || hit.tagName || 'node'} blocks ${selector}`, ownerExpected: 'engines/SelectionOverlay.js', suggestion: 'check overlay stacking and hit testing' });
    }
  }
  const canvasCount = (doc.querySelectorAll?.('#canvas-layer, canvas') || []).length;
  if (canvasCount > 1) push({ code: 'duplicate-layer', severity: 'warning', node: 'canvas', selector: '#canvas-layer, canvas', evidence: `found ${canvasCount} canvas layers`, ownerExpected: 'engines/PreviewEngineRenderer.js', suggestion: 'deduplicate canvas/render layers' });
  const previewMode = !!doc.querySelector?.('#canvas-layer.preview-mode') || !!doc.querySelector?.('#preview-content .preview-render-layer');
  if (previewMode && !doc.querySelector?.('#preview-content')) push({ code: 'mode-dom-inconsistency', severity: 'error', node: 'preview-content', selector: '#preview-content', evidence: 'preview mode without preview content', ownerExpected: 'engines/PreviewEngineRenderer.js', suggestion: 'restore preview DOM structure' });
  const status = findings.some((f) => f.severity === 'error') ? 'error' : findings.length ? 'warning' : 'synced';
  return { status, summary: { criticalNodes: critical.length, missing, duplicates: [...ids].filter(([, count]) => count > 1).length, visibleIssues: findings.length }, findings, owners: [...owners] };
}
function flags(win) {
  const search = new URLSearchParams(win?.location?.search || '');
  let local = false;
  try { local = win?.localStorage?.getItem('RF_DEBUG_CENTER') === '1'; } catch (_) {}
  return { query: search.get('rfDebugCenter') === '1' || search.has('rfDebugCenter'), localStorage: local, debugTrace: win?.RF_DEBUG_TRACE === true };
}
function buildGovernance() { return { roadmap: ['H1 LISTO', 'E1 LISTO', 'T1 LISTO', 'Z1 LISTO', 'D1 LISTO', 'B1 LISTO', 'W1 LISTO', 'L1 LISTO', 'P1 LISTO', 'A1 LISTO', 'N1 LISTO', 'S1 LISTO', 'R1 LISTO', 'V1 LISTO', 'F1 LISTO', 'Z2 NOT READY'], backlog: ['Z2 DOM scanner sandbox remains NOT READY until browser validation passes'], roadmapLevels: ['L1', 'P1', 'A1', 'N1', 'S1', 'R1', 'V1', 'F1'] }; }
export function buildDebugBundle({ state = null, traceApi = null, doc = typeof document !== 'undefined' ? document : null, win = typeof window !== 'undefined' ? window : null, ownership = null } = {}) {
  const build = win?.RF_BUILD_INFO || null;
  const zoom = sanitize(state?.zoom || null);
  const timeline = sanitize(state?.timeline || null);
  const selection = sanitize(state?.selection || null);
  const dom = sanitize(state?.dom || criticalDom(doc));
  const trace = traceSummary(traceApi || win?.RF_UI_TRACE || null);
  const ownershipSnapshot = sanitize(ownership || win?.RFDebugCenter?.ownership || null);
  const session = {
    mounted: !!state?.enabled,
    visible: !!state?.enabled,
    paused: !!timeline?.paused,
    theme: state?.theme ?? null,
    sourceState: timeline?.sourceState ?? trace.state,
    flags: flags(win),
  };
  const environment = {
    url: win?.location?.href ?? null,
    path: win?.location?.pathname ?? null,
    search: win?.location?.search ?? null,
    hash: win?.location?.hash ?? null,
    timezone: Intl?.DateTimeFormat?.().resolvedOptions?.().timeZone ?? null,
    width: win?.innerWidth ?? null,
    height: win?.innerHeight ?? null,
    devicePixelRatio: win?.devicePixelRatio ?? null,
    readyState: doc?.readyState ?? null,
    mode: zoom?.mode ?? (state?.zoom?.mode ?? null),
    buildInfo: sanitize(build),
  };
  return {
    schema: SCHEMA,
    generatedAt: new Date().toISOString(),
    project: 'reportforge',
    tool: { name: 'RF Debug Center', version: 1 },
    environment,
    session,
    timeline: { ...trace, snapshot: timeline },
    zoom,
    selection,
    renderPreview: sanitize(state?.renderPreview || null),
    asyncRace: sanitize(state?.asyncRace || null),
    loopFreeze: sanitize(state?.loopFreeze || null),
    network: sanitize(state?.network || null),
    performance: sanitize(state?.performance || null),
    dom,
    warnings: sanitize(state?.warnings || null),
    visualEvidence: sanitize(state?.visualEvidence ? { status: state.visualEvidence.status, total: state.visualEvidence.total, lastCaptureAt: state.visualEvidence.lastCaptureAt, capabilities: state.visualEvidence.capabilities, records: (state.visualEvidence.records || []).map((r) => ({ ...r, dataUrl: null })) } : null),
    ownership: ownershipSnapshot,
    governance: buildGovernance(),
    evidence: { trace: trace.entries || [], recent: trace.recent || [] },
    limits: LIMITS,
  };
}
export function createBundleFilename(date = new Date()) { return filename(date); } export function serializeDebugBundle(bundle) { return JSON.stringify(bundle, null, 2); }
export async function copyDebugBundleJSON(bundle, { win = typeof window !== 'undefined' ? window : null } = {}) { const json = typeof bundle === 'string' ? bundle : serializeDebugBundle(bundle); const clipboard = win?.navigator?.clipboard; if (clipboard?.writeText) { try { await clipboard.writeText(json); return json; } catch (_) {} } return json; }
export function exportDebugBundle(bundle, { doc = typeof document !== 'undefined' ? document : null, win = typeof window !== 'undefined' ? window : null, filename: explicitFilename = null } = {}) {
  const json = typeof bundle === 'string' ? bundle : serializeDebugBundle(bundle);
  const filename = explicitFilename || createBundleFilename(bundle?.generatedAt ? new Date(bundle.generatedAt) : new Date());
  if (!doc || !win?.Blob || !win?.URL?.createObjectURL || !doc.body) return { ok: false, filename, json, error: 'export unavailable' };
  const blob = new win.Blob([json], { type: 'application/json;charset=utf-8' });
  const url = win.URL.createObjectURL(blob);
  const link = doc.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  link.style.display = 'none';
  doc.body.appendChild(link);
  link.click();
  link.remove();
  win.setTimeout(() => win.URL.revokeObjectURL(url), 0);
  return { ok: true, filename, json };
}
