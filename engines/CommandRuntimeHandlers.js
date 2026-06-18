'use strict';

(function initCommandRuntimeHandlers(global) {
  const { setStatus } = global.CommandRuntimeShared;

  function _handleSimpleAction(action) {
    const handlers = {
      open() { FileEngine.load(); },
      save() { FileEngine.save(); },
      'save-as': () => FileEngine.exportJSON(),
      'export-json': () => FileEngine.exportJSON(),
      undo() { DS.undo(); SectionEngine.render(); SelectionEngine.clearSelection(); },
      redo() { DS.redo(); SectionEngine.render(); SelectionEngine.clearSelection(); },
      cut() { CommandEngine.cut(); },
      copy() { CommandEngine.copy(); },
      paste() { CommandEngine.paste(); },
      delete() { CommandEngine.delete(); },
      'select-all': () => CommandEngine.selectAll(),
      'align-lefts': () => CommandEngine.alignLefts(),
      'align-centers': () => CommandEngine.alignCenters(),
      'align-rights': () => CommandEngine.alignRights(),
      'align-tops': () => CommandEngine.alignTops(),
      'align-middles': () => CommandEngine.alignMiddles(),
      'align-bottoms': () => CommandEngine.alignBottoms(),
      'same-width': () => CommandEngine.sameWidth(),
      'same-height': () => CommandEngine.sameHeight(),
      'bring-front': () => CommandEngine.bringFront(),
      'send-back': () => CommandEngine.sendBack(),
      'zoom-in': () => ZoomEngine.step(1, 'plus'),
      'zoom-out': () => ZoomEngine.step(-1, 'minus'),
      'zoom-100': () => ZoomEngine.set(1.0),
      preview: () => _canonicalPreviewWriter().toggle(),
      'toggle-rulers': () => RulerEngine.toggle(),
      print: () => window.print(),
      'page-first': () => PreviewEngineRenderer.pageFirst(),
      'page-prev': () => PreviewEngineRenderer.pagePrev(),
      'page-next': () => PreviewEngineRenderer.pageNext(),
      'page-last': () => PreviewEngineRenderer.pageLast(),
      'insert-text': () => InsertEngine.setTool('text'),
      'insert-field': () => InsertEngine.setTool('field'),
      'insert-line': () => InsertEngine.setTool('line'),
      'insert-box': () => InsertEngine.setTool('box'),
      refresh: () => setStatus('Datos actualizados'),
    };
    const fn = handlers[action];
    if (!fn) return false;
    fn();
    return true;
  }

  function handleAction(action) {
    if (!action) return;
    if (_handleSimpleAction(action)) return;
    switch (action) {
      case 'new':
        if (confirm('¿Nuevo reporte? Se perderán los cambios no guardados.')) {
          DS.setElements([], 'CommandRuntimeHandlers.new');
          DS.sections.forEach((s) => { if (s.stype === 'det') s.height = 14; else s.height = 60; });
          DS.clearSelectionState('CommandRuntimeHandlers.new');
          SectionEngine.render();
          SelectionEngine.clearSelection();
          DS.saveHistory();
        }
        break;
      case 'export-pdf':
        FileEngine.exportPDF()
          .catch((error) => alert(`Error al exportar PDF: ${error.message}`));
        break;
      case 'quit': if (confirm('¿Cerrar ReportForge?')) window.close(); break;
      case 'bring-forward': CommandEngine.bringForward && CommandEngine.bringForward(); break;
      case 'send-backward': CommandEngine.sendBackward && CommandEngine.sendBackward(); break;
      case 'group': CommandEngine.group && CommandEngine.group(); break;
      case 'ungroup': CommandEngine.ungroup && CommandEngine.ungroup(); break;
      case 'invert-selection': CommandEngine.invertSelection && CommandEngine.invertSelection(); break;
      case 'deselect-all': DS.clearSelectionState('CommandRuntimeHandlers.deselectAll'); SelectionEngine.renderHandles && SelectionEngine.renderHandles(); break;
      case 'zoom-fit-page': CommandEngine.zoomFitPage && CommandEngine.zoomFitPage(); break;
      case 'zoom-fit-width': CommandEngine.zoomFitWidth && CommandEngine.zoomFitWidth(); break;
      case 'add-horizontal-guide': CommandEngine.addHGuide && CommandEngine.addHGuide(); break;
      case 'add-vertical-guide': CommandEngine.addVGuide && CommandEngine.addVGuide(); break;
      case 'remove-guide': CommandEngine.removeGuide && CommandEngine.removeGuide(); break;
      case 'clear-guides': AlignmentGuides && AlignmentGuides.clear(); break;
      case 'set-margin-left': {
        const v = parseInt(prompt('Margen izquierdo (px):', DS.pageMarginLeft || 0));
        if (!isNaN(v)) { DS.setPageMarginLeft(v, 'CommandRuntimeHandlers.setMarginLeft'); applyLayout && applyLayout(); DS.saveHistory(); }
        break;
      }
      case 'set-margin-right': setStatus('Margen derecho: use Configurar página'); break;
      case 'set-margin-top': {
        const v = parseInt(prompt('Margen superior (px):', DS.pageMarginTop || 0));
        if (!isNaN(v)) { DS.setPageMarginTop(v, 'CommandRuntimeHandlers.setMarginTop'); applyLayout && applyLayout(); DS.saveHistory(); }
        break;
      }
      case 'set-margin-bottom': setStatus('Margen inferior: use Configurar página'); break;
      case 'insert-section': CommandEngine.insertSection && CommandEngine.insertSection(); break;
      case 'delete-section': CommandEngine.deleteSection && CommandEngine.deleteSection(); break;
      case 'move-section-up': CommandEngine.moveSectionUp && CommandEngine.moveSectionUp(); break;
      case 'move-section-down': CommandEngine.moveSectionDown && CommandEngine.moveSectionDown(); break;
      case 'rename-section': CommandEngine.renameSection && CommandEngine.renameSection(); break;
      case 'lock-object': CommandEngine.lockObject && CommandEngine.lockObject(); break;
      case 'unlock-object': CommandEngine.unlockObject && CommandEngine.unlockObject(); break;
      case 'hide-object': CommandEngine.hideObject && CommandEngine.hideObject(); break;
      case 'show-object': CommandEngine.showObject && CommandEngine.showObject(); break;
      case 'toggle-grid':
        GridEngine.setVisible(!DS.gridVisible);
        document.getElementById('btn-grid').classList.toggle('active', DS.gridVisible);
        break;
      case 'toggle-snap':
        DS.setSnapToGrid(!DS.snapToGrid, 'CommandRuntimeHandlers.toggleSnap');
        document.getElementById('btn-snap').classList.toggle('active', DS.snapToGrid);
        break;
      case 'format-field':
        if (DS.selection.size > 0) PropertiesEngine.render();
        document.getElementById('panel-right').scrollTop = 9999;
        break;
      case 'color-font': {
        const cp = document.getElementById('color-picker-font');
        const sel = DS.getSelectedElements();
        cp.value = sel.length ? sel[0].color : '#000000';
        cp.click();
        cp.oninput = (e) => {
          FormatEngine.applyFormat('color', e.target.value);
          document.documentElement.style.setProperty('--swatch-font', e.target.value);
        };
        break;
      }
      case 'color-bg': {
        const cp = document.getElementById('color-picker-bg');
        cp.value = '#ffffff';
        cp.click();
        cp.oninput = (e) => {
          FormatEngine.applyFormat('bgColor', e.target.value);
          document.documentElement.style.setProperty('--swatch-bg', e.target.value);
        };
        break;
      }
      case 'color-border': {
        const cp = document.getElementById('color-picker-border');
        cp.value = '#000000';
        cp.click();
        cp.oninput = (e) => {
          FormatEngine.applyFormat('borderColor', e.target.value);
          document.documentElement.style.setProperty('--swatch-border', e.target.value);
        };
        break;
      }
    }
  }

  function handleToolSelection(tool) {
    InsertEngine.setTool(tool);
  }

  function handleViewSelection(view) {
    if (view === 'preview') {
      _canonicalPreviewWriter().show();
      return;
    }
    _canonicalPreviewWriter().hide();
  }

  function handleZoomSelection(value, source = 'toolbar-select') {
    ZoomEngine.set(parseFloat(value) / 100, undefined, undefined, { event: source, fn: 'CommandRuntimeHandlers.handleZoomSelection' });
  }

  function handleFormatAction(format) {
    if (format === 'bold' || format === 'italic' || format === 'underline') {
      FormatEngine.toggleFormat(format);
      return;
    }
    if (format.startsWith('align-')) {
      FormatEngine.applyFormat('align', format.replace('align-', ''));
    }
  }

  function handleFontFamilyChange(value) {
    FormatEngine.applyFormat('fontFamily', value);
  }

  function handleFontSizeChange(value) {
    FormatEngine.applyFormat('fontSize', parseInt(value));
  }

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
