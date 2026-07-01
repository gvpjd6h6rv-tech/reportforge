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

  function runColorPicker(currentHex, format, swatchVar, allowTransparent) {
    global.ColorPickerAdapter.open(currentHex, (hex) => {
      FormatEngine.applyFormat(format, hex);
      document.documentElement.style.setProperty(swatchVar, hex === 'transparent' ? 'transparent' : hex);
    }, { allowTransparent: !!allowTransparent });
  }

  function runColorFont() {
    const sel = DS.getSelectedElements();
    const hex = sel.length && sel[0].color ? sel[0].color : '#000000';
    runColorPicker(hex, 'color', '--swatch-font', false);
  }

  function applyTextAlign(v)  { FormatEngine.applyFormat('align',  v); }
  function applyTextValign(v) { FormatEngine.applyFormat('valign', v); }

  function handleFormatCommands(action) {
    return dispatchActionMap(action, {
      'format-field':        runFormatField,
      'open-properties':     runOpenProperties,
      'color-font':          runColorFont,
      'color-bg':            () => { const sel=DS.getSelectedElements(); runColorPicker(sel.length?sel[0].bgColor||'#ffffff':'#ffffff','bgColor','--swatch-bg',true); },
      'color-border':        () => { const sel=DS.getSelectedElements(); runColorPicker(sel.length?sel[0].borderColor||'#000000':'#000000','borderColor','--swatch-border',true); },
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
