'use strict';

(function initGlobalEventHandlers(global) {
  function registerGlobalEventHandlers() {
    const canvasScroll = document.getElementById('workspace');
    const useEngineCoreInteraction = window.RF_USE_ENGINECORE_INTERACTION !== false;

    canvasScroll.addEventListener('contextmenu', (e) => {
      if (DS.previewMode) return;
      e.preventDefault();
      if (!e.target.closest('.cr-element')) {
        SelectionEngine.clearSelection();
        ContextMenuEngine.show(e.clientX, e.clientY, 'canvas');
      }
    });

    if (!useEngineCoreInteraction) {
      canvasScroll.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        if (e.target.closest('.cr-element')) return;
        if (DS.previewMode) return;
        InsertEngine.onCanvasMouseDown(e);
      });

      let rafMove = null;
      document.addEventListener('pointermove', (e) => {
        if (rafMove) return;
        rafMove = requestAnimationFrame(() => {
          rafMove = null;
          if (SectionResizeEngine._drag) SectionResizeEngine.onMouseMove(e);
          else SelectionEngine.onMouseMove(e);
        });
      });

      document.addEventListener('pointerup', (e) => {
        if (e.button !== 0) return;
        SectionResizeEngine.onMouseUp(e);
        SelectionEngine.onMouseUp(e);
      });

      document.addEventListener('pointerdown', (e) => {
        if (!e.target.closest('#ctx-menu')) ContextMenuEngine.hide();
        if (!e.target.closest('.menu-item') && !e.target.closest('.dropdown')) MenuEngine.closeAll();
      });
    }

    canvasScroll.addEventListener('scroll', () => OverlayEngine.render());

    canvasScroll.addEventListener('wheel', (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const wheelFactor = e.deltaY < 0 ? 1.10 : 1 / 1.10;
      DesignZoomEngine.setFree(DS.zoom * wheelFactor, e.clientX, e.clientY);
    }, { passive: false });

    ZoomWidget.init();
    DesignZoomEngine.set(DS.zoom);
    applyLayout();

    window.addEventListener('resize', () => OverlayEngine.render());
  }

  global.registerGlobalEventHandlers = registerGlobalEventHandlers;
})(window);
