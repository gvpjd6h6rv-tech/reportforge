'use strict';

(function initPreviewEngineMode(global) {
  let _sc = { x: 0, y: 0 };
  let _active = false;

  function show() {
    const t0 = performance.now();
    const ws = document.getElementById('workspace');
    if (ws) _sc = { x: ws.scrollLeft, y: ws.scrollTop };
    const applyPreviewChrome = () => {
      const cl = document.getElementById('canvas-layer');
      if (cl) cl.classList.add('preview-mode');
      DS.zoomDesign = DS.zoom;
      document.body.setAttribute('data-render-mode', 'preview');
      document.getElementById('tab-preview')?.classList.add('active');
      document.getElementById('tab-design')?.classList.remove('active');
      DS.previewMode = true;
    };
    if (typeof RenderScheduler !== 'undefined') {
      RenderScheduler.flushSync(applyPreviewChrome, 'PreviewEngineV19.show');
    } else {
      applyPreviewChrome();
    }
    global.PreviewEngineRenderer.refresh();
    if (typeof PreviewZoomEngine !== 'undefined') PreviewZoomEngine.set(DS.previewZoom || 1.0);
    if (typeof ZoomWidget !== 'undefined') ZoomWidget.sync();
    _active = true;
    console.debug(`[PreviewEngineV19] ON in ${(performance.now() - t0).toFixed(1)}ms`);
  }

  function hide() {
    const t0 = performance.now();
    const applyDesignChrome = () => {
      const cl = document.getElementById('canvas-layer');
      if (cl) cl.classList.remove('preview-mode');
      DS.zoomPreview = DS.zoom;
      document.body.removeAttribute('data-render-mode');
      document.getElementById('tab-design')?.classList.add('active');
      document.getElementById('tab-preview')?.classList.remove('active');
      const ws = document.getElementById('workspace');
      if (ws) { ws.scrollLeft = _sc.x; ws.scrollTop = _sc.y; }
      DS.previewMode = false;
    };
    if (typeof DesignZoomEngine !== 'undefined') DesignZoomEngine.set(DS.zoomDesign);
    if (typeof RenderScheduler !== 'undefined') {
      RenderScheduler.flushSync(applyDesignChrome, 'PreviewEngineV19.hide');
    } else {
      applyDesignChrome();
    }
    if (typeof ZoomWidget !== 'undefined') ZoomWidget.sync();
    if (typeof OverlayEngine !== 'undefined') OverlayEngine.render();
    _active = false;
    console.debug(`[PreviewEngineV19] OFF in ${(performance.now() - t0).toFixed(1)}ms`);
  }

  function toggle() { _active ? hide() : show(); }

  global.PreviewEngineMode = { show, hide, toggle, isActive: () => _active };
})(window);
