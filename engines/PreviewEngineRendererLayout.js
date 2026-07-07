'use strict';

(function initPreviewEngineRendererLayout(global) {
  const PREVIEW_STYLE_ID = 'preview-render-style';
  // Preview page/stage measurement lives in PreviewEngineRendererMetrics.js —
  // extracted to stay under this file's governance line-count threshold.
  const M = global.PreviewEngineRendererMetrics;
  const _previewPageWidth = M.previewPageWidth;
  const _previewPageHeight = M.previewPageHeight;
  const _workspaceViewportWidth = M.workspaceViewportWidth;
  const _previewStageHeight = M.previewStageHeight;

  function _ensureLayer(content, className) {
    let layer = content.querySelector(`.${className}`);
    if (!layer) {
      layer = document.createElement('div');
      layer.className = className;
      content.appendChild(layer);
    }
    return layer;
  }

  function _preparePreviewStageWidth(content = null) {
    const stageW = Math.max(_previewPageWidth(), _workspaceViewportWidth());
    const stageH = _previewStageHeight(content);
    for (const id of ['canvas-layer', 'preview-layer']) {
      const layer = document.getElementById(id);
      if (!layer) continue;
      layer.style.width = `${stageW}px`;
      layer.style.minHeight = `${stageH}px`;
      layer.style.height = `${stageH}px`;
      layer.style.maxWidth = 'none';
      layer.style.overflow = 'visible';
      layer.style.backgroundColor = 'transparent';
    }
  }

  function _restoreCanvasLayerDesignGeometry(source) {
    if (!global.CanvasLayoutSize || typeof global.CanvasLayoutSize.restoreDesignGeometry !== 'function') {
      throw new Error('CanvasLayoutSize.restoreDesignGeometry missing');
    }
    global.CanvasLayoutSize.restoreDesignGeometry(source);
  }

  function _resetPreviewStageWidth() {
    const previewLayer = document.getElementById('preview-layer');
    if (previewLayer) {
      previewLayer.style.width = '';
      previewLayer.style.minHeight = '';
      previewLayer.style.height = '';
      previewLayer.style.maxWidth = '';
      previewLayer.style.overflow = '';
      previewLayer.style.backgroundColor = '';
    }
    _restoreCanvasLayerDesignGeometry('PreviewEngineRenderer._resetPreviewStageWidth');
  }

  // Was: stageRect.left - workspaceRect.left — a screen-space read that
  // shifts by -scrollLeft as the user scrolls, baked into the persistent
  // marginLeft below; every refresh() while scrolled right widened
  // #preview-content (and #workspace.scrollWidth) more. Model-space
  // widths only — never the live scroll offset or a post-transform rect.
  function _centerPreviewPageInWorkspace(content, firstPage) {
    const workspace = document.getElementById('workspace');
    const stage = document.getElementById('preview-layer') || document.getElementById('canvas-layer');
    if (!workspace || !stage || !content || !firstPage) return;

    _preparePreviewStageWidth(content);

    const zoom = _previewLayerZoom();
    const workspaceModelWidth = workspace.clientWidth / zoom;
    const pageModelWidth = firstPage.getBoundingClientRect().width / zoom;
    const contentStyle = getComputedStyle(content);
    const paddingLeft = Number.parseFloat(contentStyle.paddingLeft) || 0;

    const targetPageLeftModel = Math.max(0, (workspaceModelWidth - pageModelWidth) / 2);
    const contentMarginLeft = Math.max(0, targetPageLeftModel - paddingLeft);

    content.style.marginLeft = `${Math.round(contentMarginLeft * 100) / 100}px`;
    content.style.marginRight = '0px';
    content.style.backgroundColor = 'transparent';
  }

  function _preparePreviewLayerGeometry(content, renderLayer, hitLayer) {
    _preparePreviewStageWidth(content);

    content.style.position = 'relative';

    renderLayer.style.position = 'relative';
    renderLayer.style.zIndex = '1';

    hitLayer.style.position = 'absolute';
    hitLayer.style.left = '0px';
    hitLayer.style.top = '0px';
    hitLayer.style.width = '100%';
    hitLayer.style.height = '0px';
    hitLayer.style.overflow = 'visible';
    hitLayer.style.pointerEvents = 'auto';
    hitLayer.style.zIndex = '2';
    hitLayer.style.transformOrigin = 'top left';
  }

  function _previewLayerZoom() {
    if (typeof RF !== 'undefined' && RF.Geometry && typeof RF.Geometry.zoom === 'function') {
      const z = Number(RF.Geometry.zoom());
      if (Number.isFinite(z) && z > 0) return z;
    }
    if (typeof DS !== 'undefined') {
      const z = Number(DS.zoom);
      if (Number.isFinite(z) && z > 0) return z;
    }
    return 1;
  }

  function _alignHitLayerToRenderedPage(content, hitLayer, firstPage) {
    // no whole-layer transform: each pv-page is placed on its own render page
    hitLayer.style.transform = '';
    if (!firstPage) return;

    _centerPreviewPageInWorkspace(content, firstPage);

    // RF-PREVIEW-OVERLAY-PAGINATE-1: align EACH hit-layer .pv-page onto its
    // matching rendered .rpt-page (the paginated content box), instead of
    // translating the whole hit layer to page 1 only. The hit layer's own
    // vertical stacking (content-height pv-pages, no A4 sheet sizing / no
    // inter-page gap) diverges from the render sheets (page_h + margins + 14px
    // gap) by page 2+, which drifted a footer element's (Resumen) selection
    // bbox onto the wrong page. Per-page absolute placement, recomputed from
    // the LIVE render rects on every render, keeps every page glued and is
    // inherently zoom/scroll invariant (rects are read post-transform).
    const contentRect = content.getBoundingClientRect();
    const zoom = _previewLayerZoom();
    const renderPages = [...content.querySelectorAll('.preview-render-layer .rpt-page')];
    const hitPages = [...hitLayer.querySelectorAll('.pv-page')];
    hitLayer.querySelectorAll('.pv-page-break').forEach((b) => { b.style.display = 'none'; });
    hitPages.forEach((pv, i) => {
      pv.style.position = 'absolute';
      const rp = renderPages[i];
      if (!rp) { pv.style.display = 'none'; return; }
      pv.style.display = '';
      const r = rp.getBoundingClientRect();
      pv.style.left = `${(r.left - contentRect.left) / zoom}px`;
      pv.style.top = `${(r.top - contentRect.top) / zoom}px`;
      pv.style.width = `${r.width / zoom}px`;
    });
  }

  function _applyCleanHtml(html, content, data) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const styles = [...doc.head.querySelectorAll('style')].map((node) => node.textContent || '').join('\n');
    const styleEl = document.getElementById(PREVIEW_STYLE_ID) || document.createElement('style');
    styleEl.id = PREVIEW_STYLE_ID;
    // RF-CR-PARITY-MENU-TABS-1: server CSS for a standalone preview doc
    // (advanced_engine.py:_css) includes an unscoped `*{margin:0;
    // padding:0}` reset. Injected bare (no @layer) it always beats
    // @layer-declared rules regardless of specificity, overriding
    // .menu-item padding and .sub-tabs alignment in the main app shell
    // (proven live). @scope confines it to #preview-content.
    styleEl.textContent = `@scope (#preview-content) {\n${styles}\n}`;
    if (!styleEl.isConnected) document.head.appendChild(styleEl);

    const renderLayer = _ensureLayer(content, 'preview-render-layer');
    const hitLayer = _ensureLayer(content, 'preview-hit-layer');
    renderLayer.innerHTML = doc.body.innerHTML;
    hitLayer.innerHTML = global.PreviewEngineData.renderWithData(data);

    _preparePreviewLayerGeometry(content, renderLayer, hitLayer);

    const firstPage = renderLayer.querySelector('.rpt-page');
    _alignHitLayerToRenderedPage(content, hitLayer, firstPage);

    if (typeof global.RulerEngine?.renderSync === 'function') {
      global.RulerEngine.renderSync();
    }
  }

  global.PreviewEngineRendererLayout = {
    _previewPageWidth,
    _previewPageHeight,
    _preparePreviewStageWidth,
    _resetPreviewStageWidth,
    _applyCleanHtml,
    PREVIEW_STYLE_ID,
  };
})(window);
