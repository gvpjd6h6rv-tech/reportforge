'use strict';

const RuntimeServicesCore = typeof window !== 'undefined'
  ? (window.RF?.RuntimeServices || null)
  : null;

const EngineRegistry = (() => {
  const _engines = new Map();
  return {
    register(name, instance) {
      _engines.set(name, instance);
      if (RuntimeServicesCore && !RuntimeServicesCore.getExport(name)) {
        RuntimeServicesCore.expose(name, instance);
      } else if (typeof window !== 'undefined' && !window[name]) {
        window[name] = instance;
      }
    },
    get(name) { return _engines.get(name); },
    has(name) { return _engines.has(name); },
    list() { return [..._engines.keys()]; },
    forEach(fn) { _engines.forEach((v, k) => fn(v, k)); },
  };
})();

const _state = {
  initialised: false,
  prevZoom: 1.0,
  ptr: { clientX: 0, clientY: 0, buttons: 0 },
  runtime: {
    debugFlags: null,
    lastWarningKey: null,
    safeMode: {
      active: false,
      reason: null,
      incidentKey: null,
      recoveryAttempted: false,
      recoveryCount: 0,
      lastError: null,
      lastRecoveryAt: null,
    },
    pipeline: {
      lastFrameMeta: null,
      lastFailure: null,
      lastInvariantReport: null,
      lastWarningReport: null,
      lastSnapshotAt: null,
      lastPointerEvent: null,
    },
  },
};

function _E(name) { return EngineRegistry.get(name) || null; }

function _useInteractionRouter() {
  return RuntimeServicesCore ? RuntimeServicesCore.isEngineCoreInteractionEnabled() : true;
}

function _trace(source, event, payload, phase, frame) {
  const channel = (typeof event === 'string' && (event.includes('verify') || event.includes('invariant')))
    ? 'invariants'
    : 'runtime';
  RuntimeServicesCore?.trace(channel, event, {
    frame: typeof frame === 'number' ? frame : (_E('RenderScheduler') ? _E('RenderScheduler').frame : null),
    source,
    phase: phase || null,
    payload: payload || null,
  });
}

function _traceElement(source, event, state) {
  if (typeof event === 'string' && event.toLowerCase().includes('move') && !window.DebugTrace?.isEnabled('move')) return;
  RuntimeServicesCore?.trace('elements', event, {
    source,
    id: state && typeof state.id !== 'undefined' ? state.id : null,
    handle: state && typeof state.handle !== 'undefined' ? state.handle : null,
    state: state || null,
  });
}

function _targetSummary(target) {
  if (!target) return null;
  return {
    tag: target.tagName || null,
    id: target.id || null,
    className: typeof target.className === 'string' ? target.className : null,
    dataset: target.dataset ? {
      id: target.dataset.id || null,
      pos: target.dataset.pos || null,
      handlePos: target.dataset.handlePos || null,
      sectionId: target.dataset.sectionId || null,
    } : null,
  };
}

function _resolveDebugFlags() {
  const globalFlags = RuntimeServicesCore ? RuntimeServicesCore.getDebugFlags() : {};
  return {
    invariants: globalFlags.invariants !== false,
    asserts: globalFlags.asserts !== false,
    trace: globalFlags.trace === true,
    snapshots: globalFlags.snapshots === true,
    safeMode: globalFlags.safeMode !== false,
  };
}

function _cloneSerializable(value) {
  return JSON.parse(JSON.stringify(value));
}

function _emitRuntimeEvent(name, detail) {
  if (typeof document === 'undefined' || typeof CustomEvent === 'undefined') return;
  document.dispatchEvent(new CustomEvent(name, { detail, bubbles: false }));
}

function _finite(value) { return typeof value === 'number' && Number.isFinite(value); }
function _same(a, b, eps = 0.5) { return Math.abs((a || 0) - (b || 0)) <= eps; }
function _parsePx(value) { const n = parseFloat(value || '0'); return Number.isFinite(n) ? n : 0; }
function _contractFailure(kind, source, detail) {
  const message = `${kind} (${source})`;
  if (typeof console !== 'undefined' && console.error) console.error(message, detail || null);
  throw new Error(message);
}

const _contractsFactory = (() => {
  if (typeof globalThis !== 'undefined' && globalThis.EngineCoreContractsFactory) return globalThis.EngineCoreContractsFactory;
  if (typeof window !== 'undefined' && window.EngineCoreContractsFactory) return window.EngineCoreContractsFactory;
  if (typeof require === 'function') {
    try { return require('./EngineCoreContracts.js').createEngineCoreContracts; } catch (_err) { return null; }
  }
  return null;
})();

const _runtimeFactory = (() => {
  if (typeof globalThis !== 'undefined' && globalThis.EngineCoreRuntimeFactory) return globalThis.EngineCoreRuntimeFactory;
  if (typeof window !== 'undefined' && window.EngineCoreRuntimeFactory) return window.EngineCoreRuntimeFactory;
  if (typeof require === 'function') {
    try { return require('./EngineCoreRuntime.js').createEngineCoreRuntime; } catch (_err) { return null; }
  }
  return null;
})();

const _routingFactory = (() => {
  if (typeof globalThis !== 'undefined' && globalThis.EngineCoreRoutingFactory) return globalThis.EngineCoreRoutingFactory;
  if (typeof window !== 'undefined' && window.EngineCoreRoutingFactory) return window.EngineCoreRoutingFactory;
  if (typeof require === 'function') {
    try { return require('./EngineCoreRouting.js').createEngineCoreRouting; } catch (_err) { return null; }
  }
  return null;
})();

if (!_contractsFactory || !_runtimeFactory || !_routingFactory) {
  throw new Error('EngineCore factories unavailable');
}

_state.runtime.debugFlags = _resolveDebugFlags();

const _contracts = _contractsFactory({
  getEngine: _E,
  runtimeServices: RuntimeServicesCore,
  finite: _finite,
  same: _same,
  parsePx: _parsePx,
  contractFailure: _contractFailure,
});
RuntimeServicesCore?.setContractGuards(_contracts);

const _runtime = _runtimeFactory({
  state: _state,
  getEngine: _E,
  runtimeServices: RuntimeServicesCore,
  cloneSerializable: _cloneSerializable,
  emitRuntimeEvent: _emitRuntimeEvent,
  trace: _trace,
  snapshotSections: _contracts.snapshotSections,
  snapshotElements: _contracts.snapshotElements,
  snapshotContracts: _contracts.snapshotContracts,
  summarizeContracts: _contracts.summarizeContracts,
  validateSectionContract: _contracts.validateSectionContract,
  validateCanvasContract: _contracts.validateCanvasContract,
  validateScrollContract: _contracts.validateScrollContract,
  validateCanonicalRuntime: _contracts.validateCanonicalRuntime,
  assertSelectionState: _contracts.assertSelectionState,
  assertZoomContract: _contracts.assertZoomContract,
  getPointer: () => RF.Geometry.viewToModel(_state.ptr.clientX, _state.ptr.clientY),
});

const _routing = _routingFactory({
  state: _state,
  registry: EngineRegistry,
  getEngine: _E,
  runtimeServices: RuntimeServicesCore,
  cloneSerializable: _cloneSerializable,
  traceElement: _traceElement,
  targetSummary: _targetSummary,
  useInteractionRouter: _useInteractionRouter,
  emitRuntimeEvent: _emitRuntimeEvent,
  assertZoomContract: _contracts.assertZoomContract,
});

const EngineCore = {
  init() {
    if (_state.initialised) return;
    _state.initialised = true;
    _state.prevZoom = (typeof DS !== 'undefined' && DS.zoom) ? DS.zoom : 1.0;
    _routing.registerAllEngines();
    _routing.patchZoomEngine();
    _routing.wireWorkspaceEvents();
    console.log('[EngineCore] Initialised. Registered engines:', EngineRegistry.list().join(', '));
  },
  beginFrame: _runtime.beginFrame,
  completeFrame: _runtime.completeFrame,
  verifyRuntimeInvariants: _runtime.verifyRuntimeInvariants,
  setDebugFlags: _runtime.setDebugFlags,
  getDebugFlags: _runtime.getDebugFlags,
  enterSafeMode: _runtime.enterSafeMode,
  clearSafeMode: _runtime.clearSafeMode,
  getSafeMode: _runtime.getSafeMode,
  exportRuntimeState: _runtime.exportRuntimeState,
  recoverFromPipelineFailure: _runtime.recoverFromPipelineFailure,
  refresh() { _routing.registerAllEngines(); },
  registry: EngineRegistry,
  getPointer() { return RF.Geometry.viewToModel(_state.ptr.clientX, _state.ptr.clientY); },
  contracts: _contracts,
};

if (typeof module !== 'undefined') {
  module.exports = { EngineCore, EngineRegistry, ContractGuards: EngineCore.contracts };
}

if (typeof globalThis !== 'undefined') {
  globalThis.EngineCore = EngineCore;
  globalThis.EngineRegistry = EngineRegistry;
  globalThis.ContractGuards = EngineCore.contracts;
}
