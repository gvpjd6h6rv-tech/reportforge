'use strict';

(function initCommandRuntimeHandlers(global) {
  const { handleFileCommands } = global.CommandRuntimeHandlersFile;
  const { handlePreviewCommands } = global.CommandRuntimeHandlersPreview;
  const { handleZoomCommands } = global.CommandRuntimeHandlersZoom;
  const { handleSelectionCommands } = global.CommandRuntimeHandlersSelectionDispatch;
  const { handleFormatCommands } = global.CommandRuntimeHandlersFormat;
  const { handleInsertCommands } = global.CommandRuntimeHandlersInsert;
  const { handleLayoutCommands } = global.CommandRuntimeHandlersLayout;
  const { handleDialogCommands } = global.CommandRuntimeHandlersDialog;
  const { handleSystemCommands } = global.CommandRuntimeHandlersSystem;

  function handleAction(action) {
    if (!action) return;
    if (handleFileCommands(action)) return;
    if (handlePreviewCommands(action)) return;
    if (handleZoomCommands(action)) return;
    if (handleSelectionCommands(action)) return;
    if (handleFormatCommands(action)) return;
    if (handleInsertCommands(action)) return;
    if (handleLayoutCommands(action)) return;
    if (handleDialogCommands(action)) return;
    if (handleSystemCommands(action)) return;
  }

  function handleToolSelection(tool) { InsertEngine.setTool(tool); }
  function handleViewSelection(view) { if (view === 'preview') { _canonicalPreviewWriter().show(); return; } _canonicalPreviewWriter().hide(); }
  function handleZoomSelection(value, source = 'toolbar-select') { ZoomEngine.set(parseFloat(value) / 100, undefined, undefined, { event: source, fn: 'CommandRuntimeHandlers.handleZoomSelection' }); }
  function handleFormatAction(format) { if (format === 'bold' || format === 'italic' || format === 'underline') { FormatEngine.toggleFormat(format); return; } if (format.startsWith('align-')) { FormatEngine.applyFormat('align', format.replace('align-', '')); } }
  function handleFontFamilyChange(value) { FormatEngine.applyFormat('fontFamily', value); }
  function handleFontSizeChange(value) { FormatEngine.applyFormat('fontSize', parseInt(value)); }

  global.CommandRuntimeHandlers = {
    handleAction,
    handleToolSelection,
    handleViewSelection,
    handleZoomSelection,
    handleFormatAction,
    handleFontFamilyChange,
    handleFontSizeChange,
  };
})(window);
