'use strict';

(function initCommandRuntimeHandlersInsert(global) {
  const { dispatchActionMap } = global.CommandRuntimeShared;

  function handleInsertCommands(action) {
    return dispatchActionMap(action, {
      'insert-text': () => InsertEngine.setTool('text'),
      'insert-field': () => InsertEngine.setTool('field'),
      'insert-line': () => InsertEngine.setTool('line'),
      'insert-box': () => InsertEngine.setTool('box'),
    });
  }

  global.CommandRuntimeHandlersInsert = { handleInsertCommands };
})(window);
