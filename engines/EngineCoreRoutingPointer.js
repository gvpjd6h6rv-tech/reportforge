'use strict';

const _pointerRoutingHelpersFactory = (() => {
  if (typeof EngineCoreRoutingPointerHelpers !== 'undefined') return EngineCoreRoutingPointerHelpers.createEngineCoreRoutingPointerHelpers;
  if (typeof globalThis !== 'undefined' && globalThis.EngineCoreRoutingPointerHelpers) return globalThis.EngineCoreRoutingPointerHelpers.createEngineCoreRoutingPointerHelpers;
  if (typeof window !== 'undefined' && window.EngineCoreRoutingPointerHelpers) return window.EngineCoreRoutingPointerHelpers.createEngineCoreRoutingPointerHelpers;
  if (typeof require === 'function') {
    try { return require('./EngineCoreRoutingPointerHelpers.js').createEngineCoreRoutingPointerHelpers; } catch (_err) { return null; }
  }
  return null;
})();

const EngineCoreRoutingPointer = (() => {
  function createEngineCoreRoutingPointer(deps = {}) {
    const factory = _pointerRoutingHelpersFactory;
    if (!factory) throw new Error('EngineCoreRoutingPointer helpers unavailable');
    const helpers = factory(deps);
    function normalizePointerEvent(e, phase) { return helpers.normalizePointerEvent(e, phase); }
    function interactionEngine() { return helpers.interactionEngine(); }
    function routePointer(e, phase) { return helpers.routePointer(e, phase); }
    return { normalizePointerEvent, interactionEngine, routePointer };
  }

  return { createEngineCoreRoutingPointer };
})();

if (typeof module !== 'undefined') {
  module.exports = {
    createEngineCoreRoutingPointer: EngineCoreRoutingPointer.createEngineCoreRoutingPointer,
  };
}

if (typeof globalThis !== 'undefined') {
  globalThis.EngineCoreRoutingPointer = EngineCoreRoutingPointer;
}
