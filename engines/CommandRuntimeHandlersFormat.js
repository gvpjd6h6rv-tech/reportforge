'use strict';

(function initCommandRuntimeHandlersFormat(global) {
  const { dispatchActionMap } = global.CommandRuntimeShared;

  function runFormatField() {
    if (!DS.selection.size) return;
    const el = DS.getSelectedElements()[0];
    if (!el) return;
    FormatEditorEngine.open(el);
  }

  function runOpenProperties() {
    if (!DS.selection.size) return;
    PropertiesEngine.render();
    PropertiesEngine.focusSection('general');
  }

  function runColorPicker(id, value, format, swatchVar) {
    const cp = document.getElementById(id);
    cp.value = value;
    cp.click();
    cp.oninput = (e) => {
      FormatEngine.applyFormat(format, e.target.value);
      document.documentElement.style.setProperty(swatchVar, e.target.value);
    };
  }

  function runColorFont() {
    const sel = DS.getSelectedElements();
    runColorPicker('color-picker-font', sel.length ? sel[0].color : '#000000', 'color', '--swatch-font');
  }

  function applyTextAlign(v)  { FormatEngine.applyFormat('align',  v); }
  function applyTextValign(v) { FormatEngine.applyFormat('valign', v); }

  function handleFormatCommands(action) {
    return dispatchActionMap(action, {
      'format-field':        runFormatField,
      'open-properties':     runOpenProperties,
      'color-font':          runColorFont,
      'color-bg':            () => runColorPicker('color-picker-bg', '#ffffff', 'bgColor', '--swatch-bg'),
      'color-border':        () => runColorPicker('color-picker-border', '#000000', 'borderColor', '--swatch-border'),
      'text-align-left':     () => applyTextAlign('left'),
      'text-align-center':   () => applyTextAlign('center'),
      'text-align-right':    () => applyTextAlign('right'),
      'text-valign-top':     () => applyTextValign('top'),
      'text-valign-middle':  () => applyTextValign('middle'),
      'text-valign-bottom':  () => applyTextValign('bottom'),
    });
  }

  global.CommandRuntimeHandlersFormat = { handleFormatCommands };
})(window);
