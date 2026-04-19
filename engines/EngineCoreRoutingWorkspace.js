'use strict';

const EngineCoreRoutingWorkspace = (() => {
  function createEngineCoreRoutingWorkspace(deps = {}) {
    const state = deps.state || {};
    const getEngine = typeof deps.getEngine === 'function' ? deps.getEngine : () => null;
    const useInteractionRouter = typeof deps.useInteractionRouter === 'function'
      ? deps.useInteractionRouter
      : () => true;
    const runtimeServices = deps.runtimeServices || null;
    const routePointer = typeof deps.routePointer === 'function' ? deps.routePointer : () => null;

    function wireWorkspaceEvents() {
      if (!useInteractionRouter()) return;
      const ws = typeof document !== 'undefined' ? document.getElementById('workspace') : null;
      if (!ws) return;
      if (runtimeServices && typeof runtimeServices.setFlag === 'function') {
        runtimeServices.setFlag('engineCoreInteraction', true);
      }

      ws.addEventListener('pointerdown', e => {
        state.ptr.clientX = e.clientX; state.ptr.clientY = e.clientY; state.ptr.buttons = e.buttons;
        routePointer(e, 'down');
      }, { capture: true, passive: true });

      document.addEventListener('pointermove', e => {
        state.ptr.clientX = e.clientX; state.ptr.clientY = e.clientY; state.ptr.buttons = e.buttons;
        routePointer(e, 'move');
      }, { passive: true });

      document.addEventListener('pointerup', e => {
        routePointer(e, 'up');
      }, { passive: true });

      document.addEventListener('pointercancel', e => {
        routePointer(e, 'cancel');
      }, { passive: true });

      ws.addEventListener('pointerleave', () => {
        if (getEngine('RulerEngine')) getEngine('RulerEngine').clearCursor();
      }, { passive: true });
    }

    return { wireWorkspaceEvents };
  }

  return { createEngineCoreRoutingWorkspace };
})();

if (typeof module !== 'undefined') {
  module.exports = { createEngineCoreRoutingWorkspace: EngineCoreRoutingWorkspace.createEngineCoreRoutingWorkspace };
}

if (typeof globalThis !== 'undefined') {
  globalThis.EngineCoreRoutingWorkspace = EngineCoreRoutingWorkspace;
}
