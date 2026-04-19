'use strict';

const EngineCoreRoutingZoom = (() => {
  function createEngineCoreRoutingZoom(deps = {}) {
    const state = deps.state || {};
    const getEngine = typeof deps.getEngine === 'function' ? deps.getEngine : () => null;

    function onZoomWillChange(newZoom) {
      const prev = state.prevZoom;
      const scroll = getEngine('WorkspaceScrollEngine');
      if (scroll && typeof scroll.adjustForZoom === 'function') {
        scroll.adjustForZoom(prev, newZoom);
      }
      state.prevZoom = newZoom;
    }

    function onZoomDidChange(newZoom) {
      if (typeof deps.assertZoomContract === 'function') {
        deps.assertZoomContract(newZoom, 'EngineCore.onZoomDidChange');
      }
      RenderScheduler.layout(() => {
        if (getEngine('CanvasLayoutEngine')) getEngine('CanvasLayoutEngine').updateSync();
        if (getEngine('SectionLayoutEngine')) getEngine('SectionLayoutEngine').updateSync();
        if (getEngine('ElementLayoutEngine')) getEngine('ElementLayoutEngine').updateSync();
      }, 'zoom_layout');

      RenderScheduler.visual(() => {
        if (getEngine('GridEngine')) getEngine('GridEngine').updateSync();
        if (getEngine('OverlayEngine')) getEngine('OverlayEngine').render();
      }, 'zoom_visual');

      RenderScheduler.handles(() => {
        if (getEngine('HandlesEngine')) getEngine('HandlesEngine').render();
      }, 'zoom_handles');

      RenderScheduler.post(() => {
        if (typeof DS !== 'undefined' && DS.previewMode) {
          if (typeof PreviewEngineV19 === 'undefined') {
            const message = 'PREVIEW OWNER MISSING IN CANONICAL RUNTIME (zoom_post.refresh)';
            console.error(message);
            throw new Error(message);
          }
          PreviewEngineV19.refresh();
        }
        if (getEngine('WorkspaceScrollEngine')) getEngine('WorkspaceScrollEngine').updateSync();
      }, 'zoom_post');
    }

    return { onZoomWillChange, onZoomDidChange };
  }

  return { createEngineCoreRoutingZoom };
})();

if (typeof module !== 'undefined') {
  module.exports = { createEngineCoreRoutingZoom: EngineCoreRoutingZoom.createEngineCoreRoutingZoom };
}

if (typeof globalThis !== 'undefined') {
  globalThis.EngineCoreRoutingZoom = EngineCoreRoutingZoom;
}
