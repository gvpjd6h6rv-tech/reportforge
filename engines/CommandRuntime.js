'use strict';

(function initCommandRuntime(global) {
  const CommandEngine = Object.assign(
    {},
    global.CommandRuntimeSelection,
    global.CommandRuntimeView,
    global.CommandRuntimeSections,
  );
  const FileEngine = global.CommandRuntimeFile;
  const handlers = global.CommandRuntimeHandlers;
  const { switchDocType } = global.CommandRuntimeDocType;
  const { initCommandRuntimeState } = global.CommandRuntimeInit;

  global.CommandEngine = CommandEngine;
  global.FileEngine = FileEngine;
  global.handleAction = handlers.handleAction;
  global.switchDocType = switchDocType;
  global.handleToolSelection = handlers.handleToolSelection;
  global.handleViewSelection = handlers.handleViewSelection;
  global.handleZoomSelection = handlers.handleZoomSelection;
  global.handleFormatAction = handlers.handleFormatAction;
  global.handleFontFamilyChange = handlers.handleFontFamilyChange;
  global.handleFontSizeChange = handlers.handleFontSizeChange;
  global.initCommandRuntimeState = initCommandRuntimeState;
})(window);
