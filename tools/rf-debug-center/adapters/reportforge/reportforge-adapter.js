'use strict';
// PORT0 — ReportForge Adapter v1
// Implements the canonical adapter contract for the ReportForge project.
// This is the only file allowed to reference ReportForge-specific internals
// (RF_UI_TRACE, DS, ownership map, DOM selectors) in the adapter boundary.
// No globals. No behavior change. Read-only.

import { validateAdapter, normalizeEventShape } from '../debug-center-adapter-contract.js';
import { REPORTFORGE_ADAPTER_METADATA as META } from './reportforge-adapter-metadata.js';

function getTraceSource(win = (typeof window !== 'undefined' ? window : null)) {
  const trace = win?.RF_UI_TRACE;
  if (!trace) return { state: 'absent', getEntries: () => [], snapshot: () => null };
  if (typeof trace.getEntries !== 'function') return { state: 'invalid', getEntries: () => [], snapshot: () => null, error: 'missing getEntries()' };
  return trace;
}

function getOwnershipMap(win = (typeof window !== 'undefined' ? window : null)) {
  return win?.RFDebugCenter?.ownership ?? null;
}

function getEnvironment(win = (typeof window !== 'undefined' ? window : null), doc = (typeof document !== 'undefined' ? document : null)) {
  return {
    url: win?.location?.href ?? null,
    path: win?.location?.pathname ?? null,
    mode: win?.DS?.mode ?? null,
    zoom: win?.DS?.zoom ?? null,
    readyState: doc?.readyState ?? null,
    width: win?.innerWidth ?? null,
    height: win?.innerHeight ?? null,
    devicePixelRatio: win?.devicePixelRatio ?? null,
    buildInfo: win?.RF_BUILD_INFO ?? null,
  };
}

function getDomSelectors() {
  return META.domSelectors;
}

function target(id, selector, label, required = 'always', interactive = false, ownerExpected = null, containerSelector = null) {
  return { id, selector, label, required, interactive, ownerExpected, containerSelector, unique: true };
}

function getDomTargets() {
  const s = META.domSelectors;
  return [
    target('debug-center-root', s.root, 'debug center root', 'always', false, 'tools/rf-debug-center/rf-debug-center.js'),
    target('workspace', s.workspace, 'workspace', 'always', false, 'designer/crystal-reports-designer-v4.html'),
    target('canvas-layer', s.canvasLayer, 'canvas layer', 'design', false, 'engines/PreviewEngineRenderer.js', s.workspace),
    target('preview-layer', s.previewLayer, 'preview layer', 'preview', false, 'engines/PreviewEngineRenderer.js', s.workspace),
    target('preview-content', s.previewContent, 'preview content', 'preview', false, 'engines/PreviewEngineRenderer.js', s.previewLayer),
    target('tb-zoom', s.zoomToolbar, 'zoom toolbar', 'always', false, 'engines/ZoomEngine.js'),
    target('zw-slider', s.zoomSlider, 'zoom slider', 'always', true, 'engines/ZoomEngine.js', s.zoomToolbar),
    target('zw-pct', s.zoomPercent, 'zoom percent', 'always', false, 'engines/ZoomEngine.js', s.zoomToolbar),
    target('selection-box', s.selectionBox, 'selection box', 'active', false, 'engines/SelectionOverlay.js', s.selectionLayer),
    target('selection-handles', s.selectionHandles, 'selection handles', 'active', true, 'engines/SelectionOverlay.js', s.selectionLayer),
    target('selection-guides', s.selectionGuides, 'selection guides', 'active', false, 'engines/SelectionOverlay.js', s.selectionLayer),
  ];
}

function getNetworkPaths() {
  return META.networkPaths;
}

function getActivationFlags(win = (typeof window !== 'undefined' ? window : null)) {
  const search = new URLSearchParams(win?.location?.search || '');
  let local = false;
  try { local = win?.localStorage?.getItem(META.activationFlags.localStorage) === '1'; } catch (_) {}
  return {
    query: search.get(META.activationFlags.queryParam) === '1' || search.has(META.activationFlags.queryParam),
    localStorage: local,
    debugTrace: win?.[META.activationFlags.windowFlag] === true,
  };
}

function normalizeEvent(raw) {
  return normalizeEventShape({ ...raw, project: META.project });
}

function dispose() {
  // No resources held by this adapter. Provided for contract compliance.
}

export const reportforgeAdapter = Object.freeze({
  id: META.id,
  name: META.name,
  project: META.project,
  version: META.version,
  adapterSchema: META.adapterSchema,
  description: META.description,
  capabilities: META.capabilities,
  invariants: META.invariants,
  getTraceSource,
  getOwnershipMap,
  getEnvironment,
  getDomSelectors,
  getDomTargets,
  getNetworkPaths,
  getActivationFlags,
  normalizeEvent,
  dispose,
});

/**
 * Validate that reportforgeAdapter satisfies the adapter contract.
 * Returns { valid: boolean, errors: string[] }.
 */
export function validateReportforgeAdapter() {
  return validateAdapter(reportforgeAdapter);
}
