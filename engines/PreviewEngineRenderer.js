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

  global.PreviewEngineRenderer = { refresh, getMetrics };
})(window);
