'use strict';

/* PreviewEngineRendererMetrics — preview page/stage measurement helpers for
 * PreviewEngineRendererLayout.js. Extracted verbatim (no behavior change) to
 * keep that file under its governance line-count threshold. Re-exported by
 * PreviewEngineRendererLayout.js under the same `_previewPageWidth` /
 * `_previewPageHeight` names, so PreviewEngineRenderer.js's existing
 * `L._previewPageWidth()` / `L._previewPageHeight()` calls keep working.
 */
(function initPreviewEngineRendererMetrics(global) {
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

  global.PreviewEngineRendererMetrics = {
    previewPageWidth: _previewPageWidth,
    previewPageHeight: _previewPageHeight,
    workspaceViewportWidth: _workspaceViewportWidth,
    previewStageHeight: _previewStageHeight,
  };
})(window);
