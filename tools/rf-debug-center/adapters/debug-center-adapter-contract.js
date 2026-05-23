'use strict';
// PORT0 — Adapter Boundary / Core Contract
// Defines the canonical contract that any debug center adapter must satisfy.
// No ReportForge internals. No globals. No behavior — contract and validation only.

export const ADAPTER_CONTRACT = Object.freeze({
  schemaVersion: '1.0.0',
  requiredFields: Object.freeze(['id', 'name', 'project', 'version']),
  requiredMethods: Object.freeze([
    'getTraceSource',
    'getOwnershipMap',
    'getEnvironment',
    'normalizeEvent',
  ]),
  optionalMethods: Object.freeze([
    'getDomSelectors',
    'getDomTargets',
    'getNetworkPaths',
    'getActivationFlags',
    'dispose',
  ]),
  capabilities: Object.freeze([
    'timeline',
    'zoom',
    'selection',
    'renderPreview',
    'asyncRace',
    'loopFreeze',
    'network',
    'performance',
    'warnings',
    'visualEvidence',
    'bundle',
  ]),
  eventSchema: Object.freeze({
    required: Object.freeze(['timestamp', 'source', 'action', 'severity']),
    optional: Object.freeze([
      'project', 'module', 'engine', 'eventId', 'transactionId',
      'before', 'after', 'state', 'dom', 'request', 'response',
      'durationMs', 'ownerExpected', 'writerActual', 'invariant',
      'result', 'error',
    ]),
    severities: Object.freeze(['debug', 'info', 'warning', 'error']),
  }),
});

/**
 * Validate that an adapter object satisfies the contract.
 * Returns { valid: boolean, errors: string[] }.
 * Does not throw. Does not mutate the adapter.
 */
export function validateAdapter(adapter) {
  const errors = [];
  if (!adapter || typeof adapter !== 'object') {
    return { valid: false, errors: ['adapter must be a non-null object'] };
  }
  for (const field of ADAPTER_CONTRACT.requiredFields) {
    if (adapter[field] === undefined || adapter[field] === null || adapter[field] === '') {
      errors.push(`missing required field: ${field}`);
    }
  }
  for (const method of ADAPTER_CONTRACT.requiredMethods) {
    if (typeof adapter[method] !== 'function') {
      errors.push(`missing required method: ${method}`);
    }
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Produce a canonical event shape from any raw event object.
 * Missing required fields get safe defaults. Unknown fields are passed through.
 * Does not throw. Does not mutate the input.
 */
export function normalizeEventShape(raw = {}) {
  const severity = ADAPTER_CONTRACT.eventSchema.severities.includes(raw?.severity)
    ? raw.severity
    : 'info';
  return {
    timestamp: raw?.timestamp ?? new Date().toISOString(),
    source: raw?.source ?? 'unknown',
    action: raw?.action ?? 'unknown',
    severity,
    project: raw?.project ?? null,
    module: raw?.module ?? null,
    engine: raw?.engine ?? null,
    eventId: raw?.eventId ?? null,
    transactionId: raw?.transactionId ?? null,
    before: raw?.before ?? null,
    after: raw?.after ?? null,
    state: raw?.state ?? null,
    dom: raw?.dom ?? null,
    request: raw?.request ?? null,
    response: raw?.response ?? null,
    durationMs: raw?.durationMs ?? null,
    ownerExpected: raw?.ownerExpected ?? null,
    writerActual: raw?.writerActual ?? null,
    invariant: raw?.invariant ?? null,
    result: raw?.result ?? null,
    error: raw?.error ?? null,
  };
}
