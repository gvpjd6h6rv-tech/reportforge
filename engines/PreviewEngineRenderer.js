'use strict';

(function initPreviewEngineRenderer(global) {
  const C = global.PreviewEngineContracts;

  function refresh() {
    C.assertSelectionState('PreviewEngineV19.refresh.selection');
    C.assertZoomContract(DS.zoom, 'PreviewEngineV19.refresh.zoom');
    C.assertPreviewDomContract();
    if (typeof RenderScheduler !== 'undefined' && !RenderScheduler.allowsDomWrite()) {
      RenderScheduler.post(() => refresh(), 'PreviewEngineV19.refresh');
      return;
    }
    if (typeof RenderScheduler !== 'undefined') {
      RenderScheduler.assertDomWriteAllowed('PreviewEngineV19.refresh');
    }
    const content = document.getElementById('preview-content');
    if (!content) return;
    const scaledW = RF.Geometry.scale(CFG.PAGE_W);
    content.style.width = scaledW + 'px';
    content.style.maxWidth = 'none';
    const data = (typeof DS !== 'undefined' && DS._sampleData) || (typeof SAMPLE_DATA !== 'undefined' ? SAMPLE_DATA : {});
    content.innerHTML = global.PreviewEngineData.renderWithData(data);
    if (typeof SelectionEngine !== 'undefined' && typeof SelectionEngine.renderHandles === 'function') {
      SelectionEngine.renderHandles();
    }
  }

  function getMetrics() {
    const content = document.getElementById('preview-content');
    return {
      active: global.PreviewEngineMode.isActive(),
      scaledW: RF.Geometry.scale(CFG.PAGE_W),
      scaledH: RF.Geometry.scale(typeof DS !== 'undefined' ? DS.getTotalHeight() : 0),
      contentW: content ? parseFloat(content.style.width) : 0,
    };
  }

  function _pages() {
    return [...document.querySelectorAll('#preview-content .pv-page')];
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

  global.PreviewEngineRenderer = { refresh, getMetrics, pageFirst, pagePrev, pageNext, pageLast };
})(window);
