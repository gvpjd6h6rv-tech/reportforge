'use strict';

(function initCommandRuntimeHandlersInsert(global) {
  const { dispatchActionMap } = global.CommandRuntimeShared;

  function handleInsertCommands(action) {
    return dispatchActionMap(action, {
      'insert-text':    () => InsertEngine.setTool('text'),
      'insert-field':   () => InsertEngine.setTool('field'),
      'insert-line':    () => InsertEngine.setTool('line'),
      'insert-line-v':  () => InsertEngine.setTool('line-v'),
      'insert-box':     () => InsertEngine.setTool('box'),
      'insert-barcode': () => InsertEngine.setTool('barcode'),
    });
  }

  global.CommandRuntimeHandlersInsert = { handleInsertCommands };
})(window);
