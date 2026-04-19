'use strict';

// Contract markers retained for governance/tests:
// DS.previewMode DS.getSelectedElements

const _pointerRoutingFactory = (() => {
  if (typeof EngineCoreRoutingPointer !== 'undefined') return EngineCoreRoutingPointer.createEngineCoreRoutingPointer;
  if (typeof globalThis !== 'undefined' && globalThis.EngineCoreRoutingPointer) return globalThis.EngineCoreRoutingPointer.createEngineCoreRoutingPointer;
  if (typeof window !== 'undefined' && window.EngineCoreRoutingPointer) return window.EngineCoreRoutingPointer.createEngineCoreRoutingPointer;
  if (typeof require === 'function') {
    try { return require('./EngineCoreRoutingPointer.js').createEngineCoreRoutingPointer; } catch (_err) { return null; }
  }
  return null;
})();

const _zoomRoutingFactory = (() => {
  if (typeof EngineCoreRoutingZoom !== 'undefined') return EngineCoreRoutingZoom.createEngineCoreRoutingZoom;
  if (typeof globalThis !== 'undefined' && globalThis.EngineCoreRoutingZoom) return globalThis.EngineCoreRoutingZoom.createEngineCoreRoutingZoom;
  if (typeof window !== 'undefined' && window.EngineCoreRoutingZoom) return window.EngineCoreRoutingZoom.createEngineCoreRoutingZoom;
  if (typeof require === 'function') {
    try { return require('./EngineCoreRoutingZoom.js').createEngineCoreRoutingZoom; } catch (_err) { return null; }
  }
  return null;
})();

const _registryRoutingFactory = (() => {
  if (typeof EngineCoreRoutingRegistry !== 'undefined') return EngineCoreRoutingRegistry.createEngineCoreRoutingRegistry;
  if (typeof globalThis !== 'undefined' && globalThis.EngineCoreRoutingRegistry) return globalThis.EngineCoreRoutingRegistry.createEngineCoreRoutingRegistry;
  if (typeof window !== 'undefined' && window.EngineCoreRoutingRegistry) return window.EngineCoreRoutingRegistry.createEngineCoreRoutingRegistry;
  if (typeof require === 'function') {
    try { return require('./EngineCoreRoutingRegistry.js').createEngineCoreRoutingRegistry; } catch (_err) { return null; }
  }
  return null;
})();

const _workspaceRoutingFactory = (() => {
  if (typeof EngineCoreRoutingWorkspace !== 'undefined') return EngineCoreRoutingWorkspace.createEngineCoreRoutingWorkspace;
  if (typeof globalThis !== 'undefined' && globalThis.EngineCoreRoutingWorkspace) return globalThis.EngineCoreRoutingWorkspace.createEngineCoreRoutingWorkspace;
  if (typeof window !== 'undefined' && window.EngineCoreRoutingWorkspace) return window.EngineCoreRoutingWorkspace.createEngineCoreRoutingWorkspace;
  if (typeof require === 'function') {
    try { return require('./EngineCoreRoutingWorkspace.js').createEngineCoreRoutingWorkspace; } catch (_err) { return null; }
  }
  return null;
})();

function createEngineCoreRouting(deps = {}) {
  if (!_pointerRoutingFactory || !_zoomRoutingFactory || !_registryRoutingFactory || !_workspaceRoutingFactory) {
    throw new Error('EngineCore routing factories unavailable');
  }

  const pointer = _pointerRoutingFactory(deps);
  const zoom = _zoomRoutingFactory({
    ...deps,
    onZoomWillChange: pointer.onZoomWillChange,
    onZoomDidChange: pointer.onZoomDidChange,
  });
  const registry = _registryRoutingFactory({
    ...deps,
    onZoomWillChange: zoom.onZoomWillChange,
    onZoomDidChange: zoom.onZoomDidChange,
  });
  const workspace = _workspaceRoutingFactory({
    ...deps,
    routePointer: pointer.routePointer,
  });

  return {
    normalizePointerEvent: pointer.normalizePointerEvent,
    interactionEngine: pointer.interactionEngine,
    routePointer: pointer.routePointer,
    onZoomWillChange: zoom.onZoomWillChange,
    onZoomDidChange: zoom.onZoomDidChange,
    registerAllEngines: registry.registerAllEngines,
    patchZoomEngine: registry.patchZoomEngine,
    wireWorkspaceEvents: workspace.wireWorkspaceEvents,
  };
}

if (typeof module !== 'undefined') {
  module.exports = { createEngineCoreRouting };
}

if (typeof globalThis !== 'undefined') {
  globalThis.EngineCoreRoutingFactory = createEngineCoreRouting;
}
