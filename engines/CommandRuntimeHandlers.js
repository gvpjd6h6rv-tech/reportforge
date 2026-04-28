'use strict';

(function initCommandRuntimeHandlers(global) {
  const { setStatus } = global.CommandRuntimeShared;

  function handleAction(action) {
    if (!action) return;
    switch (action) {
      case 'new':
        if (confirm('¿Nuevo reporte? Se perderán los cambios no guardados.')) {
          DS.elements = [];
          DS.sections.forEach((s) => { if (s.stype === 'det') s.height = 14; else s.height = 60; });
          DS.clearSelectionState();
          SectionEngine.render();
          SelectionEngine.clearSelection();
          DS.saveHistory();
        }
        break;
      case 'open': FileEngine.load(); break;
      case 'save': FileEngine.save(); break;
      case 'save-as': FileEngine.exportJSON(); break;
      case 'export-json': FileEngine.exportJSON(); break;
      case 'export-pdf': setStatus('PDF: instala WeasyPrint y usa el CLI: python -m core.render.cli generate -d 20482'); break;
      case 'quit': if (confirm('¿Cerrar ReportForge?')) window.close(); break;
      case 'undo': DS.undo(); SectionEngine.render(); SelectionEngine.clearSelection(); break;
      case 'redo': DS.redo(); SectionEngine.render(); SelectionEngine.clearSelection(); break;
      case 'cut': CommandEngine.cut(); break;
      case 'copy': CommandEngine.copy(); break;
      case 'paste': CommandEngine.paste(); break;
      case 'delete': CommandEngine.delete(); break;
      case 'select-all': CommandEngine.selectAll(); break;
      case 'align-lefts': CommandEngine.alignLefts(); break;
      case 'align-centers': CommandEngine.alignCenters(); break;
      case 'align-rights': CommandEngine.alignRights(); break;
      case 'align-tops': CommandEngine.alignTops(); break;
      case 'align-middles': CommandEngine.alignMiddles(); break;
      case 'align-bottoms': CommandEngine.alignBottoms(); break;
      case 'same-width': CommandEngine.sameWidth(); break;
      case 'same-height': CommandEngine.sameHeight(); break;
      case 'bring-front': CommandEngine.bringFront(); break;
      case 'send-back': CommandEngine.sendBack(); break;
      case 'zoom-in': ZoomEngine.step(1); break;
      case 'zoom-out': ZoomEngine.step(-1); break;
      case 'zoom-100': ZoomEngine.set(1.0); break;
      case 'preview': _canonicalPreviewWriter().toggle(); break;
      case 'bring-forward': CommandEngine.bringForward && CommandEngine.bringForward(); break;
      case 'send-backward': CommandEngine.sendBackward && CommandEngine.sendBackward(); break;
      case 'group': CommandEngine.group && CommandEngine.group(); break;
      case 'ungroup': CommandEngine.ungroup && CommandEngine.ungroup(); break;
      case 'invert-selection': CommandEngine.invertSelection && CommandEngine.invertSelection(); break;
      case 'deselect-all': DS.clearSelectionState(); SelectionEngine.renderHandles && SelectionEngine.renderHandles(); break;
      case 'zoom-fit-page': CommandEngine.zoomFitPage && CommandEngine.zoomFitPage(); break;
      case 'zoom-fit-width': CommandEngine.zoomFitWidth && CommandEngine.zoomFitWidth(); break;
      case 'add-horizontal-guide': CommandEngine.addHGuide && CommandEngine.addHGuide(); break;
      case 'add-vertical-guide': CommandEngine.addVGuide && CommandEngine.addVGuide(); break;
      case 'remove-guide': CommandEngine.removeGuide && CommandEngine.removeGuide(); break;
      case 'clear-guides': AlignmentGuides && AlignmentGuides.clear(); break;
      case 'set-margin-left': {
        const v = parseInt(prompt('Margen izquierdo (px):', DS.pageMarginLeft || 0));
        if (!isNaN(v)) { DS.pageMarginLeft = Math.max(0, v); applyLayout && applyLayout(); DS.saveHistory(); }
        break;
      }
      case 'set-margin-right': setStatus('Margen derecho: use Configurar página'); break;
      case 'set-margin-top': {
        const v = parseInt(prompt('Margen superior (px):', DS.pageMarginTop || 0));
        if (!isNaN(v)) { DS.pageMarginTop = Math.max(0, v); applyLayout && applyLayout(); DS.saveHistory(); }
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
        DS.snapToGrid = !DS.snapToGrid;
        document.getElementById('btn-snap').classList.toggle('active', DS.snapToGrid);
        break;
      case 'toggle-rulers': RulerEngine.toggle(); break;
      case 'print': window.print(); break;
      case 'page-first': PreviewEngineRenderer.pageFirst(); break;
      case 'page-prev':  PreviewEngineRenderer.pagePrev();  break;
      case 'page-next':  PreviewEngineRenderer.pageNext();  break;
      case 'page-last':  PreviewEngineRenderer.pageLast();  break;
      case 'insert-text': InsertEngine.setTool('text'); break;
      case 'insert-field': InsertEngine.setTool('field'); break;
      case 'insert-line': InsertEngine.setTool('line'); break;
      case 'insert-box': InsertEngine.setTool('box'); break;
      case 'format-field':
        if (DS.selection.size > 0) PropertiesEngine.render();
        document.getElementById('panel-right').scrollTop = 9999;
        break;
      case 'refresh': setStatus('Datos actualizados'); break;
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

  function handleZoomSelection(value) {
    ZoomEngine.set(parseFloat(value) / 100);
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
  async function runRepoTests(kind) {
    const btn = document.getElementById(kind === 'quick' ? 'rf-test-quick' : 'rf-test-full');
    btn?.classList.remove('is-pass', 'is-fail');
    btn?.classList.add('is-running');
    setStatus(`Running ${kind} tests...`);
    try {
      const res = await fetch(`/tests/${kind}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const data = await res.json();
      console.log(`[RF tests:${kind}]`, data);
      btn?.classList.remove('is-running');
      btn?.classList.add(data.ok ? 'is-pass' : 'is-fail');
      setStatus(`${kind} tests ${data.ok ? 'PASSED' : 'FAILED'} (${data.durationMs}ms)`);
      alert(`${kind.toUpperCase()} TESTS ${data.ok ? 'PASSED' : 'FAILED'}\n\n${data.cmd}\n\n${(data.stdout || data.stderr || '').slice(-3000)}`);
    } catch (err) {
      btn?.classList.remove('is-running');
      btn?.classList.add('is-fail');
      setStatus(`${kind} tests crashed`);
      alert(`Tests crashed: ${err}`);
    }
  }


