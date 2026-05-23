'use strict';
const MAX_DATA_URL = 512_000;
const MAX_RECORDS = 20;
const TARGETS = ['debug-panel', 'preview', 'document', 'selection', 'toolbar', 'viewport', 'full-page'];
const SELECTORS = {
  'debug-panel': ['#rf-debug-center-root'],
  'preview': ['#preview-layer', '#preview-content'],
  'document': ['#canvas-layer'],
  'selection': ['.selection-overlay', '[data-selection-active]'],
  'toolbar': ['#toolbar', '.toolbar'],
  'viewport': null,
  'full-page': null,
};
const state = { records: [], capabilities: null, lastCaptureAt: null };
const now = () => new Date().toISOString();
const uid = () => `ve-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
function detectCapabilities(win = (typeof window !== 'undefined' ? window : {})) {
  const canBlob = typeof win?.Blob !== 'undefined';
  const canUrl = typeof win?.URL?.createObjectURL === 'function';
  const canClipboardImg = typeof win?.navigator?.clipboard?.write === 'function';
  const canDownload = canBlob && canUrl;
  const html2canvas = typeof win?.html2canvas === 'function';
  return { canBlob, canUrl, canClipboardImg, canDownload, html2canvas, canCapture: html2canvas };
}
function resolveTarget(target, doc) {
  if (!TARGETS.includes(target)) return { found: false, node: null, reason: 'VISUAL_TARGET_MISSING' };
  const list = SELECTORS[target];
  if (list === null) return { found: true, node: null, viewport: true };
  for (const sel of list) { const node = doc?.querySelector?.(sel); if (node) return { found: true, node, selector: sel }; }
  return { found: false, node: null, reason: 'VISUAL_TARGET_MISSING' };
}
function isVisible(node, doc) {
  const rect = node?.getBoundingClientRect?.();
  if (!rect || rect.width <= 0 || rect.height <= 0) return false;
  const s = doc?.defaultView?.getComputedStyle?.(node);
  return !s || (s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0');
}
function hasPassword(node) { return (node?.querySelectorAll?.('input[type=password]') || []).length > 0; }
function mkRecord(target, status, o = {}) {
  return { id: uid(), timestamp: now(), target: TARGETS.includes(target) ? target : 'unknown', status, mimeType: 'image/png', width: o.width ?? 0, height: o.height ?? 0, bytes: o.bytes ?? 0, selector: o.selector ?? null, reason: o.reason ?? null, dataUrl: o.dataUrl ?? null, metadata: o.metadata ?? {}, redactions: o.redactions ?? [] };
}
function push(record) { state.records.unshift(record); if (state.records.length > MAX_RECORDS) state.records.length = MAX_RECORDS; state.lastCaptureAt = record.timestamp; return record; }
export function captureVisualEvidence(target, { doc = (typeof document !== 'undefined' ? document : null), win = (typeof window !== 'undefined' ? window : null) } = {}) {
  const caps = detectCapabilities(win); state.capabilities = caps;
  const res = resolveTarget(target, doc);
  if (!res.found && !res.viewport) return push(mkRecord(target, 'skipped', { reason: 'VISUAL_TARGET_MISSING' }));
  const node = res.node;
  if (node && !isVisible(node, doc)) return push(mkRecord(target, 'skipped', { selector: res.selector, reason: 'VISUAL_TARGET_HIDDEN' }));
  const redactions = hasPassword(node) ? [{ type: 'password-input', reason: 'VISUAL_PASSWORD_INPUT_PRESENT' }] : [];
  const rect = node?.getBoundingClientRect?.();
  const w = Math.round(rect?.width ?? win?.innerWidth ?? 0);
  const h = Math.round(rect?.height ?? win?.innerHeight ?? 0);
  const meta = { url: win?.location?.href ?? null, selector: res.selector ?? null, width: w, height: h, viewport: { width: win?.innerWidth ?? 0, height: win?.innerHeight ?? 0 }, devicePixelRatio: win?.devicePixelRatio ?? 1, redactions: redactions.length };
  if (!caps.canCapture) return push(mkRecord(target, 'metadata-only', { reason: 'VISUAL_CAPTURE_UNSUPPORTED', selector: res.selector, width: w, height: h, metadata: meta, redactions }));
  try {
    const captureNode = node ?? doc?.body;
    if (!captureNode) throw new Error('no capture node');
    win.html2canvas(captureNode, { logging: false }).then((canvas) => {
      const dataUrl = canvas.toDataURL('image/png');
      const bytes = Math.round((dataUrl.length * 3) / 4);
      if (bytes > MAX_DATA_URL) return push(mkRecord(target, 'metadata-only', { reason: 'VISUAL_CAPTURE_TOO_LARGE', selector: res.selector, width: canvas.width, height: canvas.height, bytes, metadata: { ...meta, limitBytes: MAX_DATA_URL }, redactions }));
      return push(mkRecord(target, 'captured', { selector: res.selector, width: canvas.width, height: canvas.height, bytes, dataUrl, metadata: { ...meta, width: canvas.width, height: canvas.height }, redactions }));
    }).catch((err) => push(mkRecord(target, 'failed', { reason: 'VISUAL_CAPTURE_FAILED', selector: res.selector, width: w, height: h, metadata: { ...meta, error: err?.message || String(err) }, redactions })));
    return push(mkRecord(target, 'metadata-only', { reason: 'VISUAL_METADATA_ONLY', selector: res.selector, width: w, height: h, metadata: meta, redactions }));
  } catch (err) { return push(mkRecord(target, 'failed', { reason: 'VISUAL_CAPTURE_FAILED', selector: res.selector, width: w, height: h, metadata: { ...meta, error: err?.message || String(err) }, redactions })); }
}
export function clearVisualEvidence() { state.records = []; state.lastCaptureAt = null; return { cleared: true }; }
export function getVisualEvidenceSnapshot({ includeDataUrl = false } = {}) {
  const caps = state.capabilities ?? detectCapabilities();
  const records = state.records.map((r) => ({ ...r, dataUrl: includeDataUrl ? r.dataUrl : (r.dataUrl ? `[${r.bytes}b]` : null) }));
  return { status: records.length ? 'active' : 'idle', capabilities: caps, total: records.length, lastCaptureAt: state.lastCaptureAt, records };
}
export function copyVisualEvidenceJSON() { return JSON.stringify(getVisualEvidenceSnapshot(), null, 2); }
export function getVisualEvidenceFindings() {
  return state.records.filter((r) => ['failed', 'skipped'].includes(r.status)).map((r) => ({ code: r.reason || 'VISUAL_CAPTURE_FAILED', severity: r.status === 'failed' ? 'error' : 'warning', target: r.target, evidence: [r.reason, r.selector].filter(Boolean) }));
}
export function refreshVisualEvidenceSnapshot() { state.capabilities = detectCapabilities(); return getVisualEvidenceSnapshot(); }
