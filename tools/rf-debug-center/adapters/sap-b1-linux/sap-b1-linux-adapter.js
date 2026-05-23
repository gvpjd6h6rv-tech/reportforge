'use strict';
// SAP1 — sap_b1_linux Adapter v1
// Read-only sidecar adapter. Never mutates DocumentModel, __CAUSAL_LOG__, DOM, or network.

import { validateAdapter, normalizeEventShape } from '../debug-center-adapter-contract.js';
import { SAP_B1_LINUX_METADATA as META, SAP_B1_LINUX_UDF_FIELDS, SAP_B1_LINUX_DOM_SELECTORS, SAP_B1_LINUX_NETWORK_PATHS, SAP_B1_LINUX_OWNERSHIP_MAP } from './sap-b1-linux-adapter-metadata.js';

function getMetadata() { return META; }

function getTraceSource(win = (typeof window !== 'undefined' ? window : null)) {
  const log = win?.__CAUSAL_LOG__;
  if (!log) return { status: 'absent', getEntries: () => [], snapshot: () => null };
  if (typeof log.getAll !== 'function') return { status: 'invalid', getEntries: () => [], snapshot: () => null, error: 'missing getAll()' };
  const getEntries = () => { try { return log.getAll() ?? []; } catch (_) { return []; } };
  return { status: 'present', getEntries, snapshot: () => { const e = getEntries(); return e.length ? e[e.length - 1] : null; } };
}

function _resolveMode(m) {
  if (!m) return 'unknown';
  if (m.isFindMode) return 'find';
  if (Number(m.DocEntry) > 0) return 'view';
  return 'create';
}

function getEnvironment(win = (typeof window !== 'undefined' ? window : null), doc = (typeof document !== 'undefined' ? document : null)) {
  const m = win?.DocumentModel ?? win?.Facade?.state?.getDocumentModel?.() ?? null;
  return {
    url: win?.location?.href ?? null,
    mode: _resolveMode(m),
    docEntry: m?.DocEntry ?? null,
    docNum: m?.DocNum ?? null,
    cardCode: m?.CardCode ?? null,
    writeBlocked: win?.Facade?._state?.writeBlocked ?? null,
    readyForWrites: win?.Facade?._state?.readyForWrites ?? null,
    isFindMode: m?.isFindMode ?? null,
  };
}

function getStateSnapshot(win = (typeof window !== 'undefined' ? window : null)) {
  const m = win?.DocumentModel ?? win?.Facade?.state?.getDocumentModel?.() ?? null;
  if (!m) return { docEntry: null, docNum: null, cardCode: null, isFindMode: null, udf: {} };
  const udf = m.udf ?? {};
  return {
    docEntry: m.DocEntry ?? null,
    docNum: m.DocNum ?? null,
    cardCode: m.CardCode ?? null,
    isFindMode: m.isFindMode ?? null,
    udf: Object.fromEntries(SAP_B1_LINUX_UDF_FIELDS.map((k) => [k, udf[k] ?? m[k] ?? null])),
  };
}

function _readTarget(doc, selector) {
  const el = doc?.querySelector?.(selector);
  if (!el) return { exists: false, selector };
  const style = doc?.defaultView?.getComputedStyle?.(el);
  const rect = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
  return {
    exists: true,
    selector,
    value: el.value ?? null,
    text: el.textContent?.trim() ?? null,
    visible: !!rect && rect.width > 0 && rect.height > 0 && style?.display !== 'none' && style?.visibility !== 'hidden',
    disabled: !!el.disabled,
    readOnly: !!el.readOnly,
    rect: rect ? { w: rect.width, h: rect.height } : null,
  };
}

function getDomTargets(doc = (typeof document !== 'undefined' ? document : null)) {
  const s = SAP_B1_LINUX_DOM_SELECTORS;
  return {
    feContainer: _readTarget(doc, s.feContainer),
    uTransporte: _readTarget(doc, s.uTransporte),
    uTransportista: _readTarget(doc, s.uTransportista),
    uPlaca: _readTarget(doc, s.uPlaca),
    uTransportistaName: _readTarget(doc, s.uTransportistaName),
    uTransportistaRuc: _readTarget(doc, s.uTransportistaRuc),
    docNum: _readTarget(doc, s.docNum),
    btnCreate: _readTarget(doc, s.btnCreate),
    btnFind: _readTarget(doc, s.btnFind),
    mainTable: _readTarget(doc, s.mainTable),
  };
}

function getNetworkConfig() { return { paths: SAP_B1_LINUX_NETWORK_PATHS }; }

function getOwnershipMap() { return SAP_B1_LINUX_OWNERSHIP_MAP; }

function normalizeEvent(raw = {}) {
  return {
    ...normalizeEventShape({
      timestamp: raw?.ts ?? raw?.timestamp,
      source: raw?.writer ?? raw?.source ?? 'unknown',
      action: raw?.action ?? 'unknown',
      severity: raw?.severity ?? (raw?.category === 'error' ? 'error' : 'info'),
      module: raw?.category ?? null,
      ownerExpected: raw?.expectedOwner ?? null,
      writerActual: raw?.writer ?? null,
      before: raw?.before ?? null,
      after: raw?.after ?? null,
      state: raw?.model ?? null,
    }),
    project: META.project,
    raw: raw ?? null,
  };
}

function dispose() {}

export const sapB1LinuxAdapter = Object.freeze({
  id: META.id,
  name: META.name,
  project: META.project,
  version: META.version,
  adapterSchema: META.adapterSchema,
  description: META.description,
  capabilities: META.capabilities,
  invariants: META.invariants,
  getMetadata,
  getTraceSource,
  getEnvironment,
  getStateSnapshot,
  getDomTargets,
  getNetworkConfig,
  getOwnershipMap,
  normalizeEvent,
  dispose,
});

export function validateSapB1LinuxAdapter() { return validateAdapter(sapB1LinuxAdapter); }
