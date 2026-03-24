'use strict';

(function initCommandRuntime(global) {
  function setStatus(message) {
    const status = document.getElementById('sb-msg');
    if (status) status.textContent = message;
  }

  const CommandEngine = {
    copy() {
      const sel = DS.getSelectedElements();
      if (!sel.length) return;
      DS.clipboard = sel.map((el) => JSON.stringify(el));
      setStatus(`${sel.length} elemento(s) copiado(s)`);
    },
    cut() {
      this.copy();
      this.delete();
    },
    paste() {
      if (!DS.clipboard.length) return;
      DS.clearSelectionState();
      DS.clipboard.forEach((json) => {
        const el = JSON.parse(json);
        el.id = newId();
        el.x = DS.snap(el.x + 8);
        el.y = DS.snap(el.y + 8);
        DS.elements.push(el);
        _canonicalCanvasWriter().renderElement(el);
        DS.addSelection(el.id);
      });
      SelectionEngine.renderHandles();
      PropertiesEngine.render();
      FormatEngine.updateToolbar();
      DS.saveHistory();
    },
    delete() {
      const sel = [...DS.selection];
      if (!sel.length) return;
      sel.forEach((id) => {
        DS.elements = DS.elements.filter((e) => e.id !== id);
        const div = document.querySelector(`.cr-element[data-id="${id}"]`);
        if (div) div.remove();
      });
      DS.clearSelectionState();
      SelectionEngine.renderHandles();
      PropertiesEngine.render();
      FormatEngine.updateToolbar();
      DS.saveHistory();
    },
    selectAll() {
      DS.clearSelectionState();
      DS.elements.forEach((e) => DS.addSelection(e.id));
      SelectionEngine.renderHandles();
      PropertiesEngine.render();
      FormatEngine.updateToolbar();
    },
    alignLefts() {
      const sel = DS.getSelectedElements();
      if (sel.length < 2) return;
      const minX = Math.min(...sel.map((e) => e.x));
      sel.forEach((e) => { DS.updateElementLayout(e.id, { x: minX }); _canonicalCanvasWriter().updateElementPosition(e.id); });
      SelectionEngine.renderHandles();
      DS.saveHistory();
    },
    alignCenters() {
      const sel = DS.getSelectedElements();
      if (sel.length < 2) return;
      const c = sel.reduce((a, e) => a + (e.x + e.w / 2), 0) / sel.length;
      sel.forEach((e) => { DS.updateElementLayout(e.id, { x: DS.snap(c - e.w / 2) }); _canonicalCanvasWriter().updateElementPosition(e.id); });
      SelectionEngine.renderHandles();
      DS.saveHistory();
    },
    alignRights() {
      const sel = DS.getSelectedElements();
      if (sel.length < 2) return;
      const maxR = Math.max(...sel.map((e) => e.x + e.w));
      sel.forEach((e) => { DS.updateElementLayout(e.id, { x: maxR - e.w }); _canonicalCanvasWriter().updateElementPosition(e.id); });
      SelectionEngine.renderHandles();
      DS.saveHistory();
    },
    alignTops() {
      const sel = DS.getSelectedElements();
      if (sel.length < 2) return;
      const minY = Math.min(...sel.map((e) => e.y));
      sel.forEach((e) => { DS.updateElementLayout(e.id, { y: minY }); _canonicalCanvasWriter().updateElementPosition(e.id); });
      SelectionEngine.renderHandles();
      DS.saveHistory();
    },
    alignBottoms() {
      const sel = DS.getSelectedElements();
      if (sel.length < 2) return;
      const maxB = Math.max(...sel.map((e) => e.y + e.h));
      sel.forEach((e) => { DS.updateElementLayout(e.id, { y: maxB - e.h }); _canonicalCanvasWriter().updateElementPosition(e.id); });
      SelectionEngine.renderHandles();
      DS.saveHistory();
    },
    sameWidth() {
      const sel = DS.getSelectedElements();
      if (sel.length < 2) return;
      const ref = sel[0];
      sel.slice(1).forEach((e) => { DS.updateElementLayout(e.id, { w: ref.w }); _canonicalCanvasWriter().updateElementPosition(e.id); });
      SelectionEngine.renderHandles();
      DS.saveHistory();
    },
    sameHeight() {
      const sel = DS.getSelectedElements();
      if (sel.length < 2) return;
      const ref = sel[0];
      sel.slice(1).forEach((e) => { DS.updateElementLayout(e.id, { h: ref.h }); _canonicalCanvasWriter().updateElementPosition(e.id); });
      SelectionEngine.renderHandles();
      DS.saveHistory();
    },
    bringFront() {
      const sel = DS.getSelectedElements();
      if (!sel.length) return;
      const maxZ = Math.max(0, ...DS.elements.map((e) => e.zIndex || 0));
      sel.forEach((e) => { e.zIndex = maxZ + 1; _canonicalCanvasWriter().updateElement(e.id); });
      DS.saveHistory();
    },
    sendBack() {
      const sel = DS.getSelectedElements();
      if (!sel.length) return;
      const minZ = Math.min(0, ...DS.elements.map((e) => e.zIndex || 0));
      sel.forEach((e) => { e.zIndex = minZ - 1; _canonicalCanvasWriter().updateElement(e.id); });
      DS.saveHistory();
    },
    bringForward() {
      const sel = DS.getSelectedElements();
      if (!sel.length) return;
      sel.forEach((e) => { e.zIndex = (e.zIndex || 0) + 1; _canonicalCanvasWriter().updateElement(e.id); });
      DS.saveHistory();
      setStatus('Traer adelante');
    },
    sendBackward() {
      const sel = DS.getSelectedElements();
      if (!sel.length) return;
      sel.forEach((e) => { e.zIndex = (e.zIndex || 0) - 1; _canonicalCanvasWriter().updateElement(e.id); });
      DS.saveHistory();
      setStatus('Enviar atrás');
    },
    group() {
      const sel = DS.getSelectedElements();
      if (sel.length < 2) return;
      const gid = `grp-${Date.now()}`;
      sel.forEach((e) => { e.groupId = gid; });
      DS.saveHistory();
      setStatus(`Agrupado (${sel.length} objetos)`);
    },
    ungroup() {
      const sel = DS.getSelectedElements();
      if (!sel.length) return;
      sel.forEach((e) => { delete e.groupId; });
      DS.saveHistory();
      setStatus('Desagrupado');
    },
    invertSelection() {
      const allIds = new Set(DS.elements.map((e) => e.id));
      const curSel = new Set(DS.selection);
      DS.clearSelectionState();
      allIds.forEach((id) => { if (!curSel.has(id)) DS.addSelection(id); });
      SelectionEngine.renderHandles && SelectionEngine.renderHandles();
      setStatus('Selección invertida');
    },
    zoomFitPage() {
      const ws = document.getElementById('workspace');
      if (!ws) return;
      const lay = computeLayout();
      const totalH = DS.getTotalHeight();
      const availW = ws.clientWidth - lay.rulerWidth - 32;
      const availH = ws.clientHeight - lay.rulerHeight - 32;
      const scaleW = availW / CFG.PAGE_W;
      const scaleH = availH / Math.max(totalH, 100);
      DesignZoomEngine.setFree(Math.min(scaleW, scaleH));
      setStatus('Ajustar página');
    },
    zoomFitWidth() {
      const ws = document.getElementById('workspace');
      if (!ws) return;
      const lay = computeLayout();
      const availW = ws.clientWidth - lay.rulerWidth - 32;
      DesignZoomEngine.setFree(availW / CFG.PAGE_W);
      setStatus('Ajustar ancho');
    },
    addHGuide() {
      const ws = document.getElementById('workspace');
      const overlay = document.getElementById('guide-layer');
      if (!overlay || !ws) return;
      const y = (ws.scrollTop + (ws.clientHeight / 2));
      const g = document.createElement('div');
      g.className = 'rf-guide rf-guide-h user-guide';
      g.style.cssText = `position:absolute;top:${Math.round(y)}px;left:0;width:100%;height:1px;background:#0080ff;opacity:0.6;pointer-events:none;`;
      overlay.appendChild(g);
      setStatus('Guía horizontal añadida');
    },
    addVGuide() {
      const ws = document.getElementById('workspace');
      const overlay = document.getElementById('guide-layer');
      if (!overlay || !ws) return;
      const x = (ws.scrollLeft + (ws.clientWidth / 2));
      const g = document.createElement('div');
      g.className = 'rf-guide rf-guide-v user-guide';
      g.style.cssText = `position:absolute;left:${Math.round(x)}px;top:0;width:1px;height:100%;background:#0080ff;opacity:0.6;pointer-events:none;`;
      overlay.appendChild(g);
      setStatus('Guía vertical añadida');
    },
    removeGuide() {
      const guides = document.querySelectorAll('.user-guide');
      if (guides.length > 0) guides[guides.length - 1].remove();
      setStatus('Guía eliminada');
    },
    insertSection() {
      const sel = DS.selection.size > 0 ? [...DS.selection][0] : null;
      const el = sel ? DS.getElementById(sel) : null;
      const afterId = el ? el.sectionId : DS.sections[DS.sections.length - 1]?.id;
      const afterIdx = DS.sections.findIndex((s) => s.id === afterId);
      const newId = `s-det-${Date.now()}`;
      const newSec = { id: newId, stype: 'det', label: 'Detalle', abbr: 'D', height: 20, visible: true };
      DS.sections.splice(afterIdx + 1, 0, newSec);
      DS.saveHistory();
      _canonicalCanvasWriter().renderAll();
      setStatus(`Sección insertada: ${newSec.label}`);
    },
    deleteSection() {
      const sel = DS.selection.size > 0 ? [...DS.selection][0] : null;
      const el = sel ? DS.getElementById(sel) : null;
      const secId = el ? el.sectionId : DS.sections[DS.sections.length - 1]?.id;
      const sec = DS.sections.find((s) => s.id === secId);
      if (!sec || DS.sections.length <= 1) {
        setStatus('No se puede eliminar la última sección');
        return;
      }
      DS.elements = DS.elements.filter((e) => e.sectionId !== secId);
      DS.sections = DS.sections.filter((s) => s.id !== secId);
      DS.saveHistory();
      _canonicalCanvasWriter().renderAll();
      setStatus('Sección eliminada');
    },
    moveSectionUp() {
      const secId = DS.sections[1]?.id;
      if (!secId) return;
      const idx = DS.sections.findIndex((s) => s.id === secId);
      if (idx > 0) [DS.sections[idx - 1], DS.sections[idx]] = [DS.sections[idx], DS.sections[idx - 1]];
      DS.saveHistory();
      _canonicalCanvasWriter().renderAll();
      setStatus('Sección movida arriba');
    },
    moveSectionDown() {
      const idx = 1;
      if (idx < DS.sections.length - 1) [DS.sections[idx], DS.sections[idx + 1]] = [DS.sections[idx + 1], DS.sections[idx]];
      DS.saveHistory();
      _canonicalCanvasWriter().renderAll();
      setStatus('Sección movida abajo');
    },
    renameSection() {
      const sec = DS.sections[0];
      if (!sec) return;
      const name = prompt('Nombre de sección:', sec.label || sec.stype || sec.id);
      if (name) {
        sec.label = name;
        DS.saveHistory();
        _canonicalCanvasWriter().renderAll();
      }
    },
    lockObject() {
      DS.getSelectedElements().forEach((e) => { e.locked = true; });
      DS.saveHistory();
      _canonicalCanvasWriter().renderAll();
      setStatus('Objeto(s) bloqueado(s)');
    },
    unlockObject() {
      DS.getSelectedElements().forEach((e) => { delete e.locked; });
      DS.saveHistory();
      _canonicalCanvasWriter().renderAll();
      setStatus('Objeto(s) desbloqueado(s)');
    },
    hideObject() {
      DS.getSelectedElements().forEach((e) => { e.hidden = true; _canonicalCanvasWriter().updateElement(e.id); });
      DS.saveHistory();
      setStatus('Objeto(s) oculto(s)');
    },
    showObject() {
      DS.getSelectedElements().forEach((e) => { delete e.hidden; _canonicalCanvasWriter().updateElement(e.id); });
      DS.saveHistory();
      setStatus('Objeto(s) visible(s)');
    },
    toggleSectionVisibility(sectionId) {
      const sec = DS.sections.find((s) => s.id === sectionId);
      if (!sec) return;
      sec.visible = !sec.visible;
      DS.saveHistory();
      _canonicalCanvasWriter().renderAll();
      setStatus(`Sección ${sec.label}: ${sec.visible ? 'visible' : 'oculta'}`);
    },
  };

  const FileEngine = {
    toJSON() {
      return JSON.stringify({
        name: 'Factura Electrónica', version: '1.0',
        pageWidth: CFG.PAGE_W,
        sections: DS.sections.map((s) => ({ ...s })),
        elements: DS.elements.map((e) => ({ ...e })),
        savedAt: new Date().toISOString(),
      }, null, 2);
    },
    save() {
      const name = prompt('Nombre del reporte:', 'Factura Electrónica') || 'reporte';
      const safe = name.replace(/[^a-zA-Z0-9-_ ]/g, '').trim() || 'reporte';
      const key = `rfd_${safe}`;
      try {
        localStorage.setItem(key, this.toJSON());
        setStatus(`✓ Guardado: ${safe}`);
      } catch (error) {
        alert('No se pudo guardar en localStorage. Descarga el JSON en su lugar.');
        this.exportJSON();
      }
    },
    load() {
      const keys = Object.keys(localStorage).filter((k) => k.startsWith('rfd_'));
      if (!keys.length) { alert('No hay reportes guardados.'); return; }
      const choice = prompt(`Reportes guardados:\n${keys.map((k) => k.replace('rfd_', '')).join('\n')}\n\nEscribe el nombre:`);
      if (!choice) return;
      const data = localStorage.getItem(`rfd_${choice}`) || localStorage.getItem(choice);
      if (!data) { alert('No encontrado.'); return; }
      try {
        const parsed = JSON.parse(data);
        DS.sections = parsed.sections;
        DS.elements = parsed.elements;
        DS.clearSelectionState();
        SectionEngine.render();
        SelectionEngine.clearSelection();
        setStatus(`✓ Abierto: ${choice}`);
      } catch (error) {
        alert(`Error al cargar: ${error.message}`);
      }
    },
    exportJSON() {
      const blob = new Blob([this.toJSON()], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'factura.rfd.json';
      a.click();
      URL.revokeObjectURL(a.href);
      setStatus('✓ JSON exportado');
    },
    importJSON(file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target.result);
          DS.sections = data.sections;
          DS.elements = data.elements;
          DS.clearSelectionState();
          SectionEngine.render();
          SelectionEngine.clearSelection();
          setStatus('✓ Diseño importado');
        } catch (err) {
          alert(`Error: ${err.message}`);
        }
      };
      reader.readAsText(file);
    },
  };

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
        DS.gridVisible = !DS.gridVisible;
        document.getElementById('grid-overlay').classList.toggle('hidden', !DS.gridVisible);
        document.getElementById('btn-grid').classList.toggle('active', DS.gridVisible);
        break;
      case 'toggle-snap':
        DS.snapToGrid = !DS.snapToGrid;
        document.getElementById('btn-snap').classList.toggle('active', DS.snapToGrid);
        break;
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

  function switchDocType(key) {
    if (!(key in DOC_TYPES)) return;
    const dt = DOC_TYPES[key];
    const prev = DS._docType;
    DS._docType = key;

    document.querySelectorAll('.doc-type-btn').forEach((btn) =>
      btn.classList.toggle('active', btn.dataset.doctype === key));

    const tb = document.getElementById('titlebar');
    if (tb) tb.style.background = `linear-gradient(180deg,${shadeColor(dt.color, 20)} 0%,${dt.color} 60%,${shadeColor(dt.color, -10)} 100%)`;

    const pt = document.getElementById('props-title');
    if (pt) pt.style.background = `linear-gradient(180deg,${shadeColor(dt.color, 30)},${dt.color})`;

    FieldExplorerEngine._activeTree = dt.fieldTree || FIELD_TREE;
    FieldExplorerEngine.render = function() {
      const tree = this._activeTree || FIELD_TREE;
      const treeEl = document.getElementById('field-tree');
      treeEl.innerHTML = '';
      Object.entries(tree).forEach(([k, node]) => treeEl.appendChild(this._buildNode(k, node, 0)));
    };
    FieldExplorerEngine.render();

    DS._sampleData = dt.sampleData || SAMPLE_DATA;

    if (prev !== key) {
      if (DS.elements.length > 0 &&
        !confirm(`¿Cambiar a "${dt.label}"?\nSe cargará el layout de secciones para este tipo.\n(Los elementos del canvas se borrarán)`)) {
        DS._docType = prev;
        document.querySelectorAll('.doc-type-btn').forEach((btn) =>
          btn.classList.toggle('active', btn.dataset.doctype === prev));
        return;
      }
      DS.sections = dt.defaultSections.map((s) => ({ ...s }));
      DS.elements = [];
      DS.clearSelectionState();
      SectionEngine.render();
      SelectionEngine.clearSelection();
      DS.saveHistory();
    }

    const tt = document.getElementById('titlebar-text');
    if (tt) tt.textContent = `SAP Crystal Reports — [${dt.label} — Nuevo reporte (SRI ${dt.sriCode})]`;

    const items = DS._sampleData?.items || [];
    setStatus(`Tipo "${dt.label}" activado — SRI ${dt.sriCode} — Arrastra campos del Explorador al canvas`);
    document.getElementById('sb-records').textContent = `Items: ${items.length}`;

    console.log(`[ReportForge] Doc type → ${key} (${dt.label}) SRI:${dt.sriCode}`);
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

  function initCommandRuntimeState() {
    DS._sampleData = SAMPLE_DATA;
    const items = SAMPLE_DATA.items || [];
    document.getElementById('sb-records').textContent = `Items: ${items.length}`;
    console.log('[ReportForge] Multi-doc engine listo — 5 tipos: factura, remision, nota_credito, retencion, liquidacion');
  }

  (function patchSaveHistoryForPreview() {
    const origSave = DS.saveHistory.bind(DS);
    DS.saveHistory = function() {
      origSave();
      if (DS.previewMode) _canonicalPreviewWriter().refresh();
    };
  })();

  global.CommandEngine = CommandEngine;
  global.FileEngine = FileEngine;
  global.handleAction = handleAction;
  global.switchDocType = switchDocType;
  global.handleToolSelection = handleToolSelection;
  global.handleViewSelection = handleViewSelection;
  global.handleZoomSelection = handleZoomSelection;
  global.handleFormatAction = handleFormatAction;
  global.handleFontFamilyChange = handleFontFamilyChange;
  global.handleFontSizeChange = handleFontSizeChange;
  global.initCommandRuntimeState = initCommandRuntimeState;
})(window);
