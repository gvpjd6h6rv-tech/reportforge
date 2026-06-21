'use strict';

(function initCommandRuntimeHandlersPreview(global) {
  const { dispatchActionMap } = global.CommandRuntimeShared;

  function handlePreviewCommands(action) {
    return dispatchActionMap(action, {
      preview: () => _canonicalPreviewWriter().toggle(),
      'page-first': () => PreviewEngineRenderer.pageFirst(),
      'page-prev': () => PreviewEngineRenderer.pagePrev(),
      'page-next': () => PreviewEngineRenderer.pageNext(),
      'page-last': () => PreviewEngineRenderer.pageLast(),
    });
  }

  global.CommandRuntimeHandlersPreview = { handlePreviewCommands };
})(window);
