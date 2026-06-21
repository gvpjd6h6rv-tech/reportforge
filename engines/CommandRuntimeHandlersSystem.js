'use strict';

(function initCommandRuntimeHandlersSystem(global) {
  const { dispatchActionMap, setStatus } = global.CommandRuntimeShared;

  function handleSystemCommands(action) {
    return dispatchActionMap(action, {
      print: () => window.print(),
      refresh: () => setStatus('Datos actualizados'),
    });
  }

  global.CommandRuntimeHandlersSystem = { handleSystemCommands };
})(window);
