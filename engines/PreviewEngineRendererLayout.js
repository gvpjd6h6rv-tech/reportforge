'use strict';

(function initPreviewEngineRendererLayout(global) {
  const PREVIEW_STYLE_ID = 'preview-render-style';

  function _ensureLayer(content, className) {
    let layer = content.querySelector(`.${className}`);
    if (!layer) {
      layer = document.createElement('div');
      layer.className = className;
      content.appendChild(layer);
    }
    return layer;
  }

  function _previewPageWidth() {
    const pageW = Number(CFG?.PAGE_W);
    return Number.isFinite(pageW) && pageW > 0 ? pageW : 754;
  }

  function _previewPageHeight(pageW = _previewPageWidth()) {
    // RF-GEOMETRY-UNIFY-1: page height comes from the layout (via CFG.PAGE_H,
    // synced from layout.pageHeight on load) with the server's 1123 default as
    // the ONLY fallback. Never pageW*sqrt(2): that assumes pageW is the true A4
    // width and clips custom-width layouts (e.g. factura 671 -> 949 vs 1123),
    // which cut the last page-1 row while the PDF (server page_h=1123) kept it.
    const pageH = Number(CFG?.PAGE_H);
    if (Number.isFinite(pageH) && pageH > 0) return pageH;
    return 1123;
  }

  function _workspaceViewportWidth() {
    const workspace = document.getElementById('workspace');
    if (!workspace) return _previewPageWidth();
    const rect = workspace.getBoundingClientRect();
    const width = Number(rect.width || workspace.clientWidth || 0);
    return Number.isFinite(width) && width > 0 ? width : _previewPageWidth();
  }

  function _previewStageHeight(content) {
    const pageH = _previewPageHeight(_previewPageWidth());
    const contentStyle = content ? getComputedStyle(content) : null;
    const paddingTop = Number.parseFloat(contentStyle?.paddingTop || '0') || 0;
    const paddingBottom = Number.parseFloat(contentStyle?.paddingBottom || '0') || 0;
    return Math.ceil(pageH + paddingTop + paddingBottom);
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
    if (!firstPage) {
      hitLayer.style.transform = '';
      return;
    }

    const pageW = _previewPageWidth();
    const pageH = _previewPageHeight(pageW);
    firstPage.style.width = `${pageW}px`;
    firstPage.style.height = `${pageH}px`;
    firstPage.style.minHeight = `${pageH}px`;
    firstPage.style.boxSizing = 'border-box';
    firstPage.style.backgroundColor = '#fff';

    _centerPreviewPageInWorkspace(content, firstPage);

    const contentRect = content.getBoundingClientRect();
    const pageRect = firstPage.getBoundingClientRect();
    const zoom = _previewLayerZoom();
    const offsetX = (pageRect.left - contentRect.left) / zoom;
    const offsetY = (pageRect.top - contentRect.top) / zoom;

    hitLayer.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
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
