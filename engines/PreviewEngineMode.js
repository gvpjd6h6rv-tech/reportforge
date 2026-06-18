'use strict';

(function initPreviewEngineMode(global) {
  let _sc = { x: 0, y: 0 };
  let _active = false;
  let _selectionVisible = false;
  let _selectionFrozen = false;
  let _hiding = false;

  function enableSelectionOverlay() {
    _selectionFrozen = false;
    _selectionVisible = true;
  }

  function resetSelectionOverlay() {
    _selectionVisible = false;
  }

  function isSelectionOverlayVisible() {
    return _selectionVisible && !_selectionFrozen;
  }

  function isSelectionOverlayFrozen() {
    return _selectionFrozen;
  }

  function isSelectionOverlayTransitioningOut() {
    return _hiding;
  }

  function freezeSelectionOverlay() {
    _selectionFrozen = true;
    _selectionVisible = false;
  }

  function show() {
    const t0 = performance.now();
    _hiding = false;
    const ws = document.getElementById('workspace');
    if (ws) _sc = { x: ws.scrollLeft, y: ws.scrollTop };
    const applyPreviewChrome = () => {
      const cl = document.getElementById('canvas-layer');
      if (cl) cl.classList.add('preview-mode');
      DS.setZoomDesign(DS.zoom, 'PreviewEngineMode.show');
      document.body.setAttribute('data-render-mode', 'preview');
      document.getElementById('tab-preview')?.classList.add('active');
      document.getElementById('tab-design')?.classList.remove('active');
      DS.setPreviewMode(true, 'PreviewEngineMode.show');
    };
    if (typeof RenderScheduler !== 'undefined') {
      RenderScheduler.flushSync(applyPreviewChrome, 'PreviewEngineV19.show');
    } else {
      applyPreviewChrome();
    }
    _active = true;
    freezeSelectionOverlay();
    global.PreviewEngineRenderer.clear?.();
    global.PreviewEngineRenderer.refresh();
    if (typeof PreviewZoomEngine !== 'undefined') PreviewZoomEngine.set(DS.previewZoom || 1.0);
    if (typeof ZoomWidget !== 'undefined') ZoomWidget.sync();
    console.debug(`[PreviewEngineV19] ON in ${(performance.now() - t0).toFixed(1)}ms`);
  }

  function hide() {
    const t0 = performance.now();
    _hiding = true;
    _active = false;
    const capturedPreviewZoom = DS.zoom; // capture preview zoom BEFORE DesignZoomEngine.set overwrites DS.zoom
    const applyDesignChrome = () => {
      const cl = document.getElementById('canvas-layer');
      if (cl) cl.classList.remove('preview-mode');
      DS.setZoomPreview(capturedPreviewZoom, 'PreviewEngineMode.hide');
      document.body.removeAttribute('data-render-mode');
      document.getElementById('tab-design')?.classList.add('active');
      document.getElementById('tab-preview')?.classList.remove('active');
      const ws = document.getElementById('workspace');
      if (ws) { ws.scrollLeft = _sc.x; ws.scrollTop = _sc.y; }
      DS.setPreviewMode(false, 'PreviewEngineMode.hide');
    };
    if (typeof DesignZoomEngine !== 'undefined') DesignZoomEngine.set(DS.zoomDesign);
    if (typeof RenderScheduler !== 'undefined') {
      RenderScheduler.flushSync(applyDesignChrome, 'PreviewEngineV19.hide');
    } else {
      applyDesignChrome();
    }
    global.PreviewEngineRenderer.clear?.();
    resetSelectionOverlay();
    if (typeof ZoomWidget !== 'undefined') ZoomWidget.sync();
    if (typeof OverlayEngine !== 'undefined') OverlayEngine.render();
    _selectionFrozen = false;
    _hiding = false;
    console.debug(`[PreviewEngineV19] OFF in ${(performance.now() - t0).toFixed(1)}ms`);
  }

  function toggle() { _active ? hide() : show(); }

  global.PreviewEngineMode = {
    show,
    hide,
    toggle,
    isActive: () => _active,
    enableSelectionOverlay,
    resetSelectionOverlay,
    isSelectionOverlayVisible,
    isSelectionOverlayFrozen,
    isSelectionOverlayTransitioningOut,
  };
})(window);
