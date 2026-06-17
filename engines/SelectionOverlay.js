'use strict';

const SelectionOverlay = (() => {
  function _uiSnapshot(focus = null) {
    if (typeof window.RF_UI_TRACE?.snapshot !== 'function') return null;
    return window.RF_UI_TRACE.snapshot({ focus });
  }
  function _uiTrace(event, detail = {}) {
    if (typeof window.RF_UI_TRACE !== 'function') return null;
    return window.RF_UI_TRACE(event, detail);
  }
  function _clearLayerChildren(layer) {
    if (!layer) return;
    while (layer.firstChild) layer.removeChild(layer.firstChild);
  }

  function _resolveSelectionLayer() {
    if (typeof DS !== 'undefined' && DS.previewMode) {
      return SelectionOverlayPreview.ensurePreviewSelectionLayer() || null;
    }
    return document.getElementById('handles-layer');
  }

  function _clearInactiveSelectionLayers(activeLayer) {
    if (typeof document === 'undefined') return;
    const designLayer = document.getElementById('handles-layer');
    if (designLayer && designLayer !== activeLayer) _clearLayerChildren(designLayer);
    const previewLayers = document.querySelectorAll(
      '#preview-content > .preview-selection-layer, #preview-content .preview-hit-layer .preview-selection-layer'
    );
    previewLayers.forEach((pl) => { if (pl && pl !== activeLayer) _clearLayerChildren(pl); });
  }

  function selectionRect(el, layer) {
    if (DS.previewMode) return SelectionOverlayPreview.previewRect(el, layer);
    return { left: el.x, top: SelectionState.getSectionTop(el.sectionId) + el.y, width: el.w, height: el.h };
  }

  function _styleSelectionBox(box, rect) {
    box.style.setProperty('--sel-x', rect.left + 'px');
    box.style.setProperty('--sel-y', rect.top + 'px');
    box.style.setProperty('--sel-w', rect.width + 'px');
    box.style.setProperty('--sel-h', rect.height + 'px');
    box.style.position = 'absolute';
    box.style.left = rect.left + 'px';
    box.style.top = rect.top + 'px';
    box.style.width = rect.width + 'px';
    box.style.height = rect.height + 'px';
    box.style.boxSizing = 'border-box';
    box.style.border = '1px solid var(--cr-sel-bdr, #0066CC)';
    box.style.background = 'transparent';
    box.style.pointerEvents = 'none';
    box.style.zIndex = '40';
  }

  function renderHandles(engine) {
    SelectionEngineContracts.assertSelectionState('SelectionEngine.renderHandles.selection');
    const beforeUI = _uiSnapshot('#handles-layer');
    if (typeof RenderScheduler !== 'undefined' && !RenderScheduler.allowsDomWrite()) {
      RenderScheduler.handles(() => engine.renderHandles(), 'SelectionEngine.renderHandles');
      return;
    }
    if (typeof RenderScheduler !== 'undefined') RenderScheduler.assertDomWriteAllowed('SelectionEngine.renderHandles');
    RF.Geometry.invalidate();
    const layer = _resolveSelectionLayer();
    if (!layer) return;
    _clearInactiveSelectionLayers(layer);
    _clearLayerChildren(layer);
    document.querySelectorAll('.cr-element').forEach(d => {
      d.classList.toggle('selected', SelectionState.isSelected(d.dataset.id));
    });
    const selectedIds = [...SelectionState.selectedIds()];
    const renderSelectionIds = SelectionHitTest.resolveRenderSelectionIds(engine, selectedIds);
    const selectedElements = SelectionState.selectedElementsFromIds(renderSelectionIds);
    const activeSectionIds = new Set(selectedElements.map((el) => el.sectionId));
    document.querySelectorAll('.cr-section').forEach((section) => {
      section.style.boxShadow = activeSectionIds.has(section.dataset.sectionId)
        ? 'inset 0 0 0 2px rgba(11, 98, 214, 0.6)' : '';
    });
    const branch = renderSelectionIds.length === 0 ? 'none' : (renderSelectionIds.length === 1 ? 'single' : 'multi');
    if (Array.isArray(window.__rfBranchAudit)) {
      window.__rfBranchAudit.push({ branch, selectedIds, renderSelectionIds: [...renderSelectionIds] });
    }
    if (branch === 'none') {
      _uiTrace('select', { phase: 'after', before: beforeUI, after: _uiSnapshot('#handles-layer'), event: DS.previewMode ? 'preview-select-none' : 'design-select-none', source: 'SelectionOverlay.renderHandles', selection: [], previewMode: !!DS.previewMode, focus: '#handles-layer' });
      return;
    }
    const previewOverlayVisible = !DS.previewMode || typeof PreviewEngineMode === 'undefined' || typeof PreviewEngineMode.isSelectionOverlayVisible !== 'function' || PreviewEngineMode.isSelectionOverlayVisible();
    const hasPreviewSelection = DS.previewMode && renderSelectionIds.length > 0;
    if (hasPreviewSelection && !previewOverlayVisible && typeof PreviewEngineMode !== 'undefined' && typeof PreviewEngineMode.enableSelectionOverlay === 'function') PreviewEngineMode.enableSelectionOverlay();
    if (DS.previewMode && !previewOverlayVisible && !hasPreviewSelection) { engine.updateSelectionInfo(); return; }
    const showGuides = !!(engine && engine._drag && (engine._drag.type === 'move' || engine._drag.type === 'resize'));
    if (branch === 'single') {
      const id = renderSelectionIds[0];
      const el = SelectionState.getElementById(id); if (!el) return;
      SelectionEngineContracts.assertLayoutContract(el, 'SelectionEngine.renderHandles.layout');
      const rect = selectionRect(el, layer);
      SelectionEngineContracts.assertRectShape(rect, 'SelectionEngine.renderHandles.rect');
      SelectionEngineContracts.assertZoomContract('SelectionEngine.renderHandles.zoom');
      const positions = SelectionGeometry.selectionHandles(rect);
      const selBox = document.createElement('div');
      selBox.className = 'sel-box';
      _styleSelectionBox(selBox, rect);
      layer.appendChild(selBox);
      if (showGuides) SelectionOverlayPreview.renderSelectionGuides(layer, [rect]);
      positions.forEach(({ pos, cx, cy }) => {
        const h = document.createElement('div');
        h.className = 'sel-handle';
        h.dataset.pos = pos;
        h.style.left = cx + 'px';
        h.style.top = cy + 'px';
        engine.attachHandleEvent(h, pos);
        layer.appendChild(h);
      });
    } else {
      const viewRects = selectedElements.map((item) => selectionRect(item, layer)).filter(Boolean);
      const bounds = SelectionGeometry.selectionBoundsFromRects(viewRects);
      if (!bounds) return;
      const outline = document.createElement('div');
      outline.className = 'sel-box sel-box-multi';
      Object.assign(outline.style, { position: 'absolute', left: bounds.left + 'px', top: bounds.top + 'px', width: bounds.width + 'px', height: bounds.height + 'px', background: 'none', backgroundImage: 'none', border: 'none', outline: 'none', boxShadow: 'none', pointerEvents: 'none' });
      layer.appendChild(outline);
      SelectionOverlayPreview.renderSelectionGuides(layer, viewRects);
      viewRects.forEach((rect) => {
        const item = document.createElement('div');
        item.className = 'sel-box-multi-item';
        Object.assign(item.style, { position: 'absolute', left: (rect.left - bounds.left) + 'px', top: (rect.top - bounds.top) + 'px', width: rect.width + 'px', height: rect.height + 'px', boxSizing: 'border-box', border: '1px solid #000', background: 'transparent', pointerEvents: 'none' });
        outline.appendChild(item);
      });
    }
    _uiTrace('select', { phase: 'after', before: beforeUI, after: _uiSnapshot('#handles-layer .sel-box'), event: DS.previewMode ? 'preview-select' : 'design-select', source: 'SelectionOverlay.renderHandles', selection: [...SelectionState.selectedIds()], previewMode: !!DS.previewMode, focus: '#handles-layer .sel-box' });
    engine.updateSelectionInfo();
  }

  function clearSelection(engine) {
    SelectionState.clearSelectionState();
    if (DS.previewMode && typeof PreviewEngineMode !== 'undefined' && typeof PreviewEngineMode.resetSelectionOverlay === 'function') PreviewEngineMode.resetSelectionOverlay();
    engine.renderHandles();
    PropertiesEngine.render();
    FormatEngine.updateToolbar();
    engine.updateSelectionInfo();
  }

  function updateSelectionInfo() {
    const info = document.getElementById('selection-info');
    if (SelectionState.selectedIds().size > 1) {
      info.style.display = 'block';
      info.textContent = `${SelectionState.selectedIds().size} objetos seleccionados`;
    } else {
      info.style.display = 'none';
    }
    SectionEngine.updateSectionsList();
    if (SelectionState.selectedIds().size === 1) {
      const el = SelectionState.getElementById([...SelectionState.selectedIds()][0]);
      if (el) {
        document.getElementById('sb-size').style.display = 'flex';
        document.getElementById('sb-size').textContent = `W: ${el.w}  H: ${el.h}`;
      }
    } else {
      document.getElementById('sb-size').style.display = 'none';
    }
  }

  return { renderHandles, clearSelection, updateSelectionInfo };
})();

if (typeof module !== 'undefined') module.exports = SelectionOverlay;
