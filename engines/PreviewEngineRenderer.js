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
    const firstPage = renderLayer.querySelector('.rpt-page');
    if (firstPage) {
      const contentRect = content.getBoundingClientRect();
      const pageRect = firstPage.getBoundingClientRect();
      const offsetX = pageRect.left - contentRect.left;
      const offsetY = pageRect.top - contentRect.top;
      hitLayer.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
      hitLayer.style.transformOrigin = 'top left';
    } else {
      hitLayer.style.transform = '';
      hitLayer.style.transformOrigin = '';
    }
  }

  function clear() {
    const content = document.getElementById('preview-content');
    if (content) content.replaceChildren();
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
    const scaledW = CFG.PAGE_W;
    content.style.width = scaledW + 'px';
    content.style.maxWidth = 'none';
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
