'use strict';

(function initPreviewEngineRenderer(global) {
  const C = global.PreviewEngineContracts;
  const PREVIEW_STYLE_ID = 'preview-render-style';
  let _renderToken = 0;

  function _uiSnapshot(focus = null) {
    if (typeof window.RF_UI_TRACE?.snapshot !== 'function') return null;
    return window.RF_UI_TRACE.snapshot({ focus });
  }

  function _uiTrace(event, detail = {}) {
    if (typeof window.RF_UI_TRACE !== 'function') return null;
    return window.RF_UI_TRACE(event, detail);
  }

  function _cloneSerializable(value) {
    if (typeof structuredClone === 'function') {
      try {
        return structuredClone(value);
      } catch (_err) {
        // Fall back to JSON clone for layout/data payloads.
      }
    }
    return JSON.parse(JSON.stringify(value ?? {}));
  }

  function _buildPayload() {
    const DM = typeof DS !== 'undefined' ? DS : null;
    let layout = {};
    if (global.CommandRuntimeFile && typeof global.CommandRuntimeFile.toJSON === 'function') {
      try {
        layout = JSON.parse(global.CommandRuntimeFile.toJSON());
      } catch (_err) {
        layout = {};
      }
    } else if (DM && typeof DM.layout === 'object' && DM.layout) {
      layout = _cloneSerializable(DM.layout);
    }
    const sampleData = (DM && DM._sampleData) || (typeof SAMPLE_DATA !== 'undefined' ? SAMPLE_DATA : {});
    return {
      layout,
      data: sampleData,
      params: Array.isArray(layout.parameters)
        ? Object.fromEntries(layout.parameters.map((p) => [p.name, p.defaultValue]))
        : {},
    };
  }

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
    const pageH = Number(CFG?.PAGE_H);
    if (Number.isFinite(pageH) && pageH > 0) return pageH;
    return Math.round(pageW * Math.SQRT2);
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

  function _resetPreviewStageWidth() {
    for (const id of ['canvas-layer', 'preview-layer']) {
      const layer = document.getElementById(id);
      if (!layer) continue;
      layer.style.width = '';
      layer.style.minHeight = '';
      layer.style.height = '';
      layer.style.maxWidth = '';
      layer.style.overflow = '';
      layer.style.backgroundColor = '';
    }
  }

  function _centerPreviewPageInWorkspace(content, firstPage) {
    const workspace = document.getElementById('workspace');
    const stage = document.getElementById('preview-layer') || document.getElementById('canvas-layer');
    if (!workspace || !stage || !content || !firstPage) return;

    _preparePreviewStageWidth(content);

    const workspaceRect = workspace.getBoundingClientRect();
    const stageRect = stage.getBoundingClientRect();
    const pageRect = firstPage.getBoundingClientRect();
    const contentStyle = getComputedStyle(content);
    const paddingLeft = Number.parseFloat(contentStyle.paddingLeft) || 0;

    const targetPageLeftInWorkspace = Math.max(0, (workspaceRect.width - pageRect.width) / 2);
    const stageLeftInWorkspace = stageRect.left - workspaceRect.left;
    const contentMarginLeft = Math.max(0, targetPageLeftInWorkspace - stageLeftInWorkspace - paddingLeft);

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
    styleEl.textContent = styles;
    if (!styleEl.isConnected) document.head.appendChild(styleEl);

    const renderLayer = _ensureLayer(content, 'preview-render-layer');
    const hitLayer = _ensureLayer(content, 'preview-hit-layer');
    renderLayer.innerHTML = doc.body.innerHTML;
    hitLayer.innerHTML = global.PreviewEngineData.renderWithData(data);

    _preparePreviewLayerGeometry(content, renderLayer, hitLayer);

    const firstPage = renderLayer.querySelector('.rpt-page');
    _alignHitLayerToRenderedPage(content, hitLayer, firstPage);
  }

  function clear() {
    const content = document.getElementById('preview-content');
    if (content) {
      content.replaceChildren();
      content.style.minHeight = '';
      content.style.marginLeft = '';
      content.style.marginRight = '';
      content.style.backgroundColor = '';
    }
    _resetPreviewStageWidth();
    document.getElementById(PREVIEW_STYLE_ID)?.remove();
  }

  async function refresh() {
    C.assertSelectionState('PreviewEngineV19.refresh.selection');
    C.assertZoomContract(DS.zoom, 'PreviewEngineV19.refresh.zoom');
    C.assertPreviewDomContract();
    const content = document.getElementById('preview-content');
    if (!content) return;
    const beforeUI = _uiSnapshot('#preview-content');
    const payload = _buildPayload();
    const scaledW = _previewPageWidth();
    content.style.width = scaledW + 'px';
    content.style.minHeight = _previewPageHeight(scaledW) + 'px';
    content.style.maxWidth = 'none';
    content.style.backgroundColor = 'transparent';
    _preparePreviewStageWidth(content);
    content.replaceChildren();
    const loading = document.createElement('div');
    loading.className = 'preview-loading';
    loading.textContent = 'Rendering preview…';
    content.appendChild(loading);

    const token = ++_renderToken;
    try {
      const response = await fetch('/designer-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const html = await response.text();
      if (token !== _renderToken || !global.PreviewEngineMode.isActive()) return;
      content.replaceChildren();
      _applyCleanHtml(html, content, payload.data);
      _uiTrace('preview', {
        phase: 'after',
        before: beforeUI,
        after: _uiSnapshot('#preview-content .preview-render-layer .rpt-page'),
        source: 'PreviewEngineRenderer.refresh',
        event: 'preview-refresh',
        previewMode: !!DS.previewMode,
        focus: '#preview-content .preview-render-layer .rpt-page',
      });
    } catch (err) {
      if (token !== _renderToken || !global.PreviewEngineMode.isActive()) return;
      content.replaceChildren();
      const error = document.createElement('div');
      error.className = 'preview-loading preview-loading--error';
      error.textContent = `Preview unavailable (${err.message || err})`;
      content.appendChild(error);
      const fallback = document.createElement('div');
      fallback.className = 'preview-hit-layer';
      fallback.innerHTML = global.PreviewEngineData.renderWithData(payload.data);
      content.appendChild(fallback);
      _uiTrace('preview', {
        phase: 'error',
        before: beforeUI,
        after: _uiSnapshot('#preview-content'),
        source: 'PreviewEngineRenderer.refresh',
        event: 'preview-error',
        previewMode: !!DS.previewMode,
        error: err?.message || String(err),
        focus: '#preview-content',
      });
    }
    if (typeof SelectionEngine !== 'undefined' && typeof SelectionEngine.renderHandles === 'function') {
      SelectionEngine.renderHandles();
    }
  }

  function getMetrics() {
    const content = document.getElementById('preview-content');
    const pages = content ? content.querySelectorAll('.preview-render-layer .rpt-page').length : 0;
    return {
      active: global.PreviewEngineMode.isActive(),
      scaledW: CFG.PAGE_W,
      scaledH: typeof DS !== 'undefined' ? DS.getTotalHeight() : 0,
      contentW: content ? parseFloat(content.style.width) : 0,
      pages,
    };
  }

  function _pages() {
    return [...document.querySelectorAll('#preview-content .preview-render-layer .rpt-page')];
  }

  function goToPage(n) {
    const pages = _pages();
    if (!pages.length) return;
    const idx = Math.max(0, Math.min(n - 1, pages.length - 1));
    pages[idx].scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function pageFirst() { goToPage(1); }
  function pageLast()  { goToPage(_pages().length); }

  function pagePrev() {
    const pages = _pages();
    if (!pages.length) return;
    const scroller = document.getElementById('preview-content')?.parentElement;
    const scrollTop = scroller ? scroller.scrollTop : 0;
    for (let i = pages.length - 1; i >= 0; i--) {
      if (pages[i].offsetTop < scrollTop - 10) { goToPage(i + 1); return; }
    }
    goToPage(1);
  }

  function pageNext() {
    const pages = _pages();
    if (!pages.length) return;
    const scroller = document.getElementById('preview-content')?.parentElement;
    const scrollTop = scroller ? scroller.scrollTop : 0;
    for (let i = 0; i < pages.length; i++) {
      if (pages[i].offsetTop > scrollTop + 10) { goToPage(i + 1); return; }
    }
    goToPage(pages.length);
  }

  global.PreviewEngineRenderer = { refresh, clear, getMetrics, pageFirst, pagePrev, pageNext, pageLast };
})(window);
