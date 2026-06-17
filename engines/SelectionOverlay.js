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

  function _ensurePreviewSelectionLayer() {
    if (typeof document === 'undefined') return null;

    const content = document.querySelector('#preview-content');
    const hitLayer = document.querySelector('#preview-content .preview-hit-layer');
    if (!content || !hitLayer) return null;

    // The hit layer is intentionally transparent for hit-testing.
    // Selection chrome must be a visible sibling, not a child, otherwise
    // it inherits opacity:0 and disappears in Preview.
    let layer = content.querySelector(':scope > .preview-selection-layer');
    if (!layer) {
      layer = document.createElement('div');
      layer.className = 'preview-selection-layer';
      layer.dataset.selectionLayer = 'preview';
      content.appendChild(layer);
    }

    content.style.position = 'relative';

    layer.style.position = 'absolute';
    layer.style.left = '0px';
    layer.style.top = '0px';
    layer.style.width = '100%';
    layer.style.height = '0px';
    layer.style.overflow = 'visible';
    layer.style.pointerEvents = 'none';
    layer.style.zIndex = '9999';
    layer.style.opacity = '1';
    layer.style.visibility = 'visible';
    layer.style.display = 'block';
    layer.style.transform = hitLayer.style.transform || getComputedStyle(hitLayer).transform || 'none';
    layer.style.transformOrigin = hitLayer.style.transformOrigin || 'top left';

    return layer;
  }

  function _resolveSelectionLayer() {
    if (typeof DS !== 'undefined' && DS.previewMode) {
      return _ensurePreviewSelectionLayer() || document.getElementById('handles-layer');
    }
    return document.getElementById('handles-layer');
  }

  function _clearInactiveSelectionLayers(activeLayer) {
    if (typeof document === 'undefined') return;

    const designLayer = document.getElementById('handles-layer');
    if (designLayer && designLayer !== activeLayer) {
      _clearLayerChildren(designLayer);
    }

    const previewLayers = document.querySelectorAll(
      '#preview-content > .preview-selection-layer, #preview-content .preview-hit-layer .preview-selection-layer'
    );
    previewLayers.forEach((previewLayer) => {
      if (previewLayer && previewLayer !== activeLayer) {
        _clearLayerChildren(previewLayer);
      }
    });
  }

  function _findPreviewHitElement(el) {
    if (!el || typeof document === 'undefined') return null;
    const id = String(el.id || '');
    const nodes = document.querySelectorAll(
      '#preview-content .preview-hit-layer .pv-el, #preview-content .preview-hit-layer .cr-element'
    );
    return [...nodes].find((node) => {
      const ds = node && node.dataset ? node.dataset : {};
      return ds.originId === id || ds.id === id;
    }) || null;
  }

  function _selectionOverlayZoom() {
    if (typeof RF !== 'undefined' && RF.Geometry && typeof RF.Geometry.zoom === 'function') {
      const z = Number(RF.Geometry.zoom());
      if (Number.isFinite(z) && z > 0) return z;
    }
    if (typeof DS !== 'undefined') {
      const z = Number(DS.zoom);
      if (Number.isFinite(z) && z > 0) return z;
    }
    return 1;
  }

  function _domRectRelativeToLayer(node, layer) {
    if (!node || !layer) return null;
    if (typeof node.getBoundingClientRect !== 'function') return null;
    if (typeof layer.getBoundingClientRect !== 'function') return null;

    const nodeRect = node.getBoundingClientRect();
    const layerRect = layer.getBoundingClientRect();
    const zoom = _selectionOverlayZoom();

    return {
      left: (nodeRect.left - layerRect.left) / zoom,
      top: (nodeRect.top - layerRect.top) / zoom,
      width: nodeRect.width / zoom,
      height: nodeRect.height / zoom,
    };
  }

  function previewRect(el, layer = null) {
    const previewNode = _findPreviewHitElement(el);
    const domRect = _domRectRelativeToLayer(previewNode, layer);
    if (domRect) return domRect;

    const secTop = SelectionState.getSectionTop(el.sectionId);
    return {
      left: el.x,
      top: secTop + el.y,
      width: el.w,
      height: el.h,
    };
  }

  function selectionRect(el, layer = null) {
    if (DS.previewMode) return previewRect(el, layer);
    return {
      left: el.x,
      top: SelectionState.getSectionTop(el.sectionId) + el.y,
      width: el.w,
      height: el.h,
    };
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

  function selectionGuideThickness() {
    const zoom = _selectionOverlayZoom();
    return Math.max(0.25, 1 / zoom);
  }

  function appendSelectionGuide(layer, rect, axis, edge) {
    const guide = document.createElement('div');
    const thickness = selectionGuideThickness();
    guide.className = `selection-guide selection-guide-${axis}`;
    guide.dataset.edge = edge;
    guide.style.position = 'absolute';
    guide.style.pointerEvents = 'none';
    guide.style.zIndex = '27';
    guide.style.background = 'rgba(255, 32, 32, 0.9)';
    if (axis === 'h') {
      guide.style.left = '0px';
      guide.style.width = '100%';
      guide.style.top = `${edge}px`;
      guide.style.height = `${thickness}px`;
    } else {
      guide.style.top = '0px';
      guide.style.height = '100%';
      guide.style.left = `${edge}px`;
      guide.style.width = `${thickness}px`;
    }
    layer.appendChild(guide);
  }

  function selectionBoxBorderWidth() {
    return 1;
  }

  function renderSelectionGuides(layer, rects) {
    const borderWidth = selectionBoxBorderWidth();
    rects.forEach(rect => {
      if (!rect) return;
      appendSelectionGuide(layer, rect, 'h', rect.top);
      appendSelectionGuide(layer, rect, 'h', rect.top + rect.height - borderWidth);
      appendSelectionGuide(layer, rect, 'v', rect.left);
      appendSelectionGuide(layer, rect, 'v', rect.left + rect.width - borderWidth);
    });
  }

  function renderHandles(engine) {
    SelectionEngineContracts.assertSelectionState('SelectionEngine.renderHandles.selection');
    const beforeUI = _uiSnapshot('#handles-layer');
    if (typeof RenderScheduler !== 'undefined' && !RenderScheduler.allowsDomWrite()) {
      RenderScheduler.handles(() => engine.renderHandles(), 'SelectionEngine.renderHandles');
      return;
    }
    if (typeof RenderScheduler !== 'undefined') {
      RenderScheduler.assertDomWriteAllowed('SelectionEngine.renderHandles');
    }

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
        ? 'inset 0 0 0 2px rgba(11, 98, 214, 0.6)'
        : '';
    });
    const branch = renderSelectionIds.length === 0 ? 'none' : (renderSelectionIds.length === 1 ? 'single' : 'multi');
    if (Array.isArray(window.__rfBranchAudit)) {
      window.__rfBranchAudit.push({
        branch,
        selectedIds,
        renderSelectionIds: [...renderSelectionIds],
      });
    }
    if (branch === 'none') {
      _uiTrace('select', {
        phase: 'after',
        before: beforeUI,
        after: _uiSnapshot('#handles-layer'),
        event: DS.previewMode ? 'preview-select-none' : 'design-select-none',
        source: 'SelectionOverlay.renderHandles',
        selection: [],
        previewMode: !!DS.previewMode,
        focus: '#handles-layer',
      });
      return;
    }
    const previewOverlayVisible = !DS.previewMode
      || typeof PreviewEngineMode === 'undefined'
      || typeof PreviewEngineMode.isSelectionOverlayVisible !== 'function'
      || PreviewEngineMode.isSelectionOverlayVisible();
    const hasPreviewSelection = DS.previewMode && renderSelectionIds.length > 0;
    if (hasPreviewSelection
        && !previewOverlayVisible
        && typeof PreviewEngineMode !== 'undefined'
        && typeof PreviewEngineMode.enableSelectionOverlay === 'function') {
      PreviewEngineMode.enableSelectionOverlay();
    }
    if (DS.previewMode && !previewOverlayVisible && !hasPreviewSelection) {
      engine.updateSelectionInfo();
      return;
    }
    const showGuides = !DS.previewMode
      || !!(engine && engine._drag && (engine._drag.type === 'move' || engine._drag.type === 'resize'));
    if (branch === 'single') {
      const id = renderSelectionIds[0];
      const el = SelectionState.getElementById(id); if (!el) return;
      SelectionEngineContracts.assertLayoutContract(el, 'SelectionEngine.renderHandles.layout');
      const rect = selectionRect(el, layer);
      SelectionEngineContracts.assertRectShape(rect, 'SelectionEngine.renderHandles.rect');
      SelectionEngineContracts.assertZoomContract('SelectionEngine.renderHandles.zoom');
      const absX = rect.left, absY = rect.top, absW = rect.width, absH = rect.height;
      const positions = SelectionGeometry.selectionHandles(rect);
      const selBox = document.createElement('div');
      selBox.className = 'sel-box';
      _styleSelectionBox(selBox, { left: absX, top: absY, width: absW, height: absH });
      layer.appendChild(selBox);
      if (showGuides) renderSelectionGuides(layer, [rect]);
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
      const viewRects = selectedElements
        .map((item) => selectionRect(item, layer))
        .filter(Boolean);
      const bounds = SelectionGeometry.selectionBoundsFromRects(viewRects);
      if (!bounds) return;
      const outline = document.createElement('div');
      outline.className = 'sel-box sel-box-multi';
      outline.style.position = 'absolute';
      outline.style.left = bounds.left + 'px';
      outline.style.top = bounds.top + 'px';
      outline.style.width = bounds.width + 'px';
      outline.style.height = bounds.height + 'px';
      outline.style.background = 'none';
      outline.style.backgroundImage = 'none';
      outline.style.border = 'none';
      outline.style.outline = 'none';
      outline.style.boxShadow = 'none';
      outline.style.pointerEvents = 'none';
      layer.appendChild(outline);
      renderSelectionGuides(layer, viewRects);
      viewRects.forEach((rect) => {
        const item = document.createElement('div');
        item.className = 'sel-box-multi-item';
        item.style.position = 'absolute';
        item.style.left = (rect.left - bounds.left) + 'px';
        item.style.top = (rect.top - bounds.top) + 'px';
        item.style.width = rect.width + 'px';
        item.style.height = rect.height + 'px';
        item.style.boxSizing = 'border-box';
        item.style.border = '1px solid #000';
        item.style.background = 'transparent';
        item.style.pointerEvents = 'none';
        outline.appendChild(item);
      });
    }
    _uiTrace('select', {
      phase: 'after',
      before: beforeUI,
      after: _uiSnapshot('#handles-layer .sel-box'),
      event: DS.previewMode ? 'preview-select' : 'design-select',
      source: 'SelectionOverlay.renderHandles',
      selection: [...SelectionState.selectedIds()],
      previewMode: !!DS.previewMode,
      focus: '#handles-layer .sel-box',
    });
    engine.updateSelectionInfo();
  }

  function clearSelection(engine) {
    SelectionState.clearSelectionState();
    if (DS.previewMode && typeof PreviewEngineMode !== 'undefined' && typeof PreviewEngineMode.resetSelectionOverlay === 'function') {
      PreviewEngineMode.resetSelectionOverlay();
    }
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

  return {
    renderHandles,
    clearSelection,
    updateSelectionInfo,
  };
})();

if (typeof module !== 'undefined') module.exports = SelectionOverlay;
