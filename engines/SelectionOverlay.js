'use strict';

const SelectionOverlay = (() => {
  function previewRect(el) {
    const pvEl = document.querySelector(`.pv-el[data-origin-id="${el.id}"]`);
    if (!pvEl) return null;
    const pR = pvEl.getBoundingClientRect();
    const cR = RF.Geometry.canvasRect();
    return {
      left: pR.left - cR.left,
      top: pR.top - cR.top,
      width: pR.width,
      height: pR.height,
    };
  }

  function selectionRect(el) {
    if (DS.previewMode) {
      const pvRect = previewRect(el);
      if (pvRect) return pvRect;
    }
    return CanvasGeometry.elementViewRect(el, SelectionState.getSectionTop(el.sectionId), RF.Geometry.zoom());
  }

  function renderHandles(engine) {
    SelectionEngineContracts.assertSelectionState('SelectionEngine.renderHandles.selection');
    if (typeof RenderScheduler !== 'undefined' && !RenderScheduler.allowsDomWrite()) {
      RenderScheduler.handles(() => engine.renderHandles(), 'SelectionEngine.renderHandles');
      return;
    }
    if (typeof RenderScheduler !== 'undefined') {
      RenderScheduler.assertDomWriteAllowed('SelectionEngine.renderHandles');
    }

    RF.Geometry.invalidate();
    const layer = document.getElementById('handles-layer');
    while (layer.firstChild) layer.removeChild(layer.firstChild);
    document.querySelectorAll('.cr-element').forEach(d => {
      d.classList.toggle('selected', SelectionState.isSelected(d.dataset.id));
    });

    const selectedIds = [...SelectionState.selectedIds()];
    const renderSelectionIds = SelectionHitTest.resolveRenderSelectionIds(engine, selectedIds);
    const selectedElements = SelectionState.selectedElementsFromIds(renderSelectionIds);
    const branch = renderSelectionIds.length === 0 ? 'none' : (renderSelectionIds.length === 1 ? 'single' : 'multi');
    if (Array.isArray(window.__rfBranchAudit)) {
      window.__rfBranchAudit.push({
        branch,
        selectedIds,
        renderSelectionIds: [...renderSelectionIds],
      });
    }
    if (branch === 'none') return;
    if (branch === 'single') {
      const id = renderSelectionIds[0];
      const el = SelectionState.getElementById(id); if (!el) return;
      SelectionEngineContracts.assertLayoutContract(el, 'SelectionEngine.renderHandles.layout');
      const rect = selectionRect(el);
      SelectionEngineContracts.assertRectShape(rect, 'SelectionEngine.renderHandles.rect');
      SelectionEngineContracts.assertZoomContract('SelectionEngine.renderHandles.zoom');
      const absX = rect.left, absY = rect.top, absW = rect.width, absH = rect.height;
      const positions = SelectionGeometry.selectionHandles(rect);
      const selBox = document.createElement('div');
      selBox.className = 'sel-box';
      selBox.style.setProperty('--sel-x', absX + 'px');
      selBox.style.setProperty('--sel-y', absY + 'px');
      selBox.style.setProperty('--sel-w', absW + 'px');
      selBox.style.setProperty('--sel-h', absH + 'px');
      layer.appendChild(selBox);
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
        .map(selectionRect)
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
      outline.style.pointerEvents = 'none';
      layer.appendChild(outline);
    }
    engine.updateSelectionInfo();
  }

  function clearSelection(engine) {
    SelectionState.clearSelectionState();
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
