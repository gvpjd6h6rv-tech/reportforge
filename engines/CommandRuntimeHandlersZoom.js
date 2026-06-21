'use strict';

(function initCommandRuntimeHandlersZoom(global) {
  const { dispatchActionMap } = global.CommandRuntimeShared;

  function handleZoomCommands(action) {
    return dispatchActionMap(action, {
      'zoom-in': () => ZoomEngine.step(1, 'plus'),
      'zoom-out': () => ZoomEngine.step(-1, 'minus'),
      'zoom-100': () => ZoomEngine.set(1.0),
      'zoom-fit-page': () => CommandEngine.zoomFitPage && CommandEngine.zoomFitPage(),
      'zoom-fit-width': () => CommandEngine.zoomFitWidth && CommandEngine.zoomFitWidth(),
    });
  }

  global.CommandRuntimeHandlersZoom = { handleZoomCommands };
})(window);
