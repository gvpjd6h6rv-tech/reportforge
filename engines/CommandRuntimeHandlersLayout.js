'use strict';

(function initCommandRuntimeHandlersLayout(global) {
  const { dispatchActionMap, setStatus } = global.CommandRuntimeShared;

  function runMarginChange(promptText, getter, setter, source) {
    const v = parseInt(prompt(promptText, getter() || 0));
    if (!isNaN(v)) { setter(v, source); applyLayout && applyLayout(); DS.saveHistory(); }
  }

  async function openPageFormat() {
    try {
      const command = await import('/engines/PageFormatCommand.js');
      command.openPageFormatCommand({
        file: global.CommandRuntimeFile,
        apply: global.CommandRuntimeFileApply,
        setStatus,
      });
    } catch (error) {
      setStatus(`No se pudo abrir el selector: ${error.message || error}`);
    }
  }

  function handleLayoutCommands(action) {
    return dispatchActionMap(action, {
      'toggle-rulers': () => RulerEngine.toggle(),
      'add-horizontal-guide': () => CommandEngine.addHGuide && CommandEngine.addHGuide(),
      'add-vertical-guide': () => CommandEngine.addVGuide && CommandEngine.addVGuide(),
      'remove-guide': () => CommandEngine.removeGuide && CommandEngine.removeGuide(),
      'clear-guides': () => AlignmentGuides && AlignmentGuides.clear(),
      'set-margin-left': () => runMarginChange('Margen izquierdo (px):', () => DS.pageMarginLeft, (value, source) => DS.setPageMarginLeft(value, source), 'CommandRuntimeHandlers.setMarginLeft'),
      'set-margin-right': () => setStatus('Margen derecho: use Configurar página'),
      'set-margin-top': () => runMarginChange('Margen superior (px):', () => DS.pageMarginTop, (value, source) => DS.setPageMarginTop(value, source), 'CommandRuntimeHandlers.setMarginTop'),
      'set-margin-bottom': () => setStatus('Margen inferior: use Configurar página'),
      'page-format': openPageFormat,
      'page-margins': () => { global.PageMarginsEngine && global.PageMarginsEngine.openEditor(); },
      'insert-section': () => CommandEngine.insertSection && CommandEngine.insertSection(),
      'delete-section': () => CommandEngine.deleteSection && CommandEngine.deleteSection(),
      'move-section-up': () => CommandEngine.moveSectionUp && CommandEngine.moveSectionUp(),
      'move-section-down': () => CommandEngine.moveSectionDown && CommandEngine.moveSectionDown(),
      'rename-section': () => CommandEngine.renameSection && CommandEngine.renameSection(),
      'toggle-grid': () => { GridEngine.setVisible(!DS.gridVisible); document.getElementById('btn-grid').classList.toggle('active', DS.gridVisible); },
      'toggle-snap': () => { DS.setSnapToGrid(!DS.snapToGrid, 'CommandRuntimeHandlers.toggleSnap'); document.getElementById('btn-snap').classList.toggle('active', DS.snapToGrid); },
    });
  }

  global.CommandRuntimeHandlersLayout = { handleLayoutCommands };
})(window);
