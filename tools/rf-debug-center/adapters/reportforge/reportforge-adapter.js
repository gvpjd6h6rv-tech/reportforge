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
