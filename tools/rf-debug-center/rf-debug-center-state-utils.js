'use strict';

export function stringify(value) {
  if (value == null) return '—';
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value); } catch (_) { return String(value); }
}

export function clone(value) {
  if (value == null || typeof value !== 'object') return value;
  try { return JSON.parse(JSON.stringify(value)); } catch (_) { return Array.isArray(value) ? value.slice() : { ...value }; }
}

export function summarizeElement(node) {
  if (!node) return null;
  return { tag: node.tag || node.tagName || null, id: node.id || null, className: node.className || null, datasetId: node.datasetId || node.dataset?.id || null, datasetOriginId: node.datasetOriginId || node.dataset?.originId || null, datasetPos: node.datasetPos || node.dataset?.pos || null };
}

export function normalizeSnapshot(snapshot) {
  if (!snapshot) return null;
  return { dsZoom: snapshot.dsZoom ?? null, sliderValue: snapshot.sliderValue ?? null, pctText: snapshot.pctText ?? null, sliderRect: snapshot.sliderRect ?? null, sliderStyle: snapshot.sliderStyle ?? null, pctStyle: snapshot.pctStyle ?? null, focusRect: snapshot.focusRect ?? null, focusStyle: snapshot.focusStyle ?? null, visibleElement: summarizeElement(snapshot.visibleElement) };
}

export function compareSnapshots(before, eventDom, live) {
  if (!eventDom && !live) return { ok: true, mismatches: [], summary: 'idle' };
  const keys = ['dsZoom', 'sliderValue', 'pctText'];
  const mismatches = [];
  for (const key of keys) if (stringify(eventDom?.[key]) !== stringify(live?.[key])) mismatches.push(key);
  return { ok: mismatches.length === 0, mismatches, summary: mismatches.length ? `diverged: ${mismatches.join(', ')}` : 'synced', before: normalizeSnapshot(before), after: normalizeSnapshot(eventDom), live: normalizeSnapshot(live) };
}

export function normalizeSeverity(value) {
  const severity = String(value || 'info').toLowerCase();
  return ['debug', 'info', 'warning', 'error'].includes(severity) ? severity : 'info';
}

export function safeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? clone(value) : null;
}
