'use strict';

(function initPreviewEngineRenderer(global) {
  const C = global.PreviewEngineContracts;
  let _renderToken = 0;

  function _uiSnap(focus) { return typeof window.RF_UI_TRACE?.snapshot === 'function' ? window.RF_UI_TRACE.snapshot({ focus }) : null; }
  function _uiTrace(ev, d) { return typeof window.RF_UI_TRACE === 'function' ? window.RF_UI_TRACE(ev, d) : null; }

  function _buildPayload() {
    const DM = typeof DS !== 'undefined' ? DS : null;
    let layout = {};
    if (global.CommandRuntimeFile && typeof global.CommandRuntimeFile.toJSON === 'function') {
      try { layout = JSON.parse(global.CommandRuntimeFile.toJSON()); } catch (_) { layout = {}; }
    } else if (DM && typeof DM.layout === 'object' && DM.layout) {
      layout = typeof structuredClone === 'function' ? structuredClone(DM.layout) : JSON.parse(JSON.stringify(DM.layout ?? {}));
    }
    const sampleData = (DM && DM._sampleData) || (typeof SAMPLE_DATA !== 'undefined' ? SAMPLE_DATA : {});
    return { layout, data: sampleData, params: Array.isArray(layout.parameters) ? Object.fromEntries(layout.parameters.map((p) => [p.name, p.defaultValue])) : {} };
  }

  function clear() {
    const L = global.PreviewEngineRendererLayout;
    const content = document.getElementById('preview-content');
    if (content) { content.replaceChildren(); content.style.minHeight = ''; content.style.marginLeft = ''; content.style.marginRight = ''; content.style.backgroundColor = ''; }
    L._resetPreviewStageWidth();
    document.getElementById(L.PREVIEW_STYLE_ID)?.remove();
  }

  async function refresh() {
    const L = global.PreviewEngineRendererLayout;
    C.assertSelectionState('PreviewEngineV19.refresh.selection');
    C.assertZoomContract(DS.zoom, 'PreviewEngineV19.refresh.zoom');
    C.assertPreviewDomContract();
    const content = document.getElementById('preview-content');
    if (!content) return;
    const beforeUI = _uiSnap('#preview-content');
    const payload = _buildPayload();
    const scaledW = L._previewPageWidth();
    content.style.width = scaledW + 'px';
    content.style.minHeight = L._previewPageHeight(scaledW) + 'px';
    content.style.maxWidth = 'none';
    content.style.backgroundColor = 'transparent';
    L._preparePreviewStageWidth(content);
    // RF-DESIGN-KEYBOARD-FLICKER-1: only blank+placeholder on first render;
    // later refreshes keep old content until the fetch resolves (no flash).
    if (!content.children.length) {
      content.replaceChildren();
      const loading = document.createElement('div');
      loading.className = 'preview-loading';
      loading.textContent = 'Rendering preview…';
      content.appendChild(loading);
    }
    const token = ++_renderToken;
    try {
      const resp = await fetch('/designer-preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const html = await resp.text();
      if (token !== _renderToken || !global.PreviewEngineMode.isActive()) return;
      content.replaceChildren();
      L._applyCleanHtml(html, content, payload.data);
      _uiTrace('preview', { phase: 'after', before: beforeUI, after: _uiSnap('#preview-content .preview-render-layer .rpt-page'), source: 'PreviewEngineRenderer.refresh', event: 'preview-refresh', previewMode: !!DS.previewMode, focus: '#preview-content .preview-render-layer .rpt-page' });
    } catch (err) {
      if (token !== _renderToken || !global.PreviewEngineMode.isActive()) return;
      content.replaceChildren();
      const el = document.createElement('div');
      el.className = 'preview-loading preview-loading--error';
      el.textContent = `Preview unavailable (${err.message || err})`;
      content.appendChild(el);
      const fb = document.createElement('div');
      fb.className = 'preview-hit-layer';
      fb.innerHTML = global.PreviewEngineData.renderWithData(payload.data);
      content.appendChild(fb);
      _uiTrace('preview', { phase: 'error', before: beforeUI, after: _uiSnap('#preview-content'), source: 'PreviewEngineRenderer.refresh', event: 'preview-error', previewMode: !!DS.previewMode, error: err?.message || String(err), focus: '#preview-content' });
    }
    if (typeof document !== 'undefined' && typeof document.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
      document.dispatchEvent(new CustomEvent('rf-preview-rendered', {
        detail: {
          source: 'PreviewEngineRenderer.refresh',
          previewMode: !!DS.previewMode,
        },
      }));
    }
  }

  function getMetrics() {
    const content = document.getElementById('preview-content');
    const pages = content ? content.querySelectorAll('.preview-render-layer .rpt-page').length : 0;
    return { active: global.PreviewEngineMode.isActive(), scaledW: CFG.PAGE_W, scaledH: typeof DS !== 'undefined' ? DS.getTotalHeight() : 0, contentW: content ? parseFloat(content.style.width) : 0, pages };
  }

  function _pages() { return [...document.querySelectorAll('#preview-content .preview-render-layer .rpt-page')]; }
  function _scrollTop() { const s = document.getElementById('preview-content')?.parentElement; return s ? s.scrollTop : 0; }

  function goToPage(n) { const p = _pages(); if (p.length) p[Math.max(0, Math.min(n - 1, p.length - 1))].scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  function pageFirst() { goToPage(1); }
  function pageLast() { goToPage(_pages().length); }
  function pagePrev() { const p = _pages(), st = _scrollTop(); for (let i = p.length - 1; i >= 0; i--) { if (p[i].offsetTop < st - 10) { goToPage(i + 1); return; } } goToPage(1); }
  function pageNext() { const p = _pages(), st = _scrollTop(); for (let i = 0; i < p.length; i++) { if (p[i].offsetTop > st + 10) { goToPage(i + 1); return; } } goToPage(p.length); }

  global.PreviewEngineRenderer = { refresh, clear, getMetrics, pageFirst, pagePrev, pageNext, pageLast };
})(window);
