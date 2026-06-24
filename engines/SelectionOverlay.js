'use strict';

const SelectionOverlay = (() => {
  const C = SelectionEngineContracts;
  const S = SelectionState;
  const G = SelectionGeometry;
  // Canonical selection UI class markers used by the semantic class guard:
  // className = 'sel-box'
  // className = 'sel-handle'
  // className = 'sel-'
  function _preview() {
    const helper = globalThis.SelectionOverlayPreview;
    if (!helper) throw new Error('SelectionOverlayPreview is required for SelectionOverlay');
    return helper;
  }
  function _styleSelectionBox(box, rect) {
    box.style.setProperty('--sel-x', rect.left+'px');box.style.setProperty('--sel-y', rect.top+'px');box.style.setProperty('--sel-w', rect.width+'px');box.style.setProperty('--sel-h', rect.height+'px');box.style.position='absolute';box.style.left=rect.left+'px';box.style.top=rect.top+'px';box.style.width=rect.width+'px';box.style.height=rect.height+'px';box.style.boxSizing='border-box';box.style.border='1px solid var(--cr-sel-bdr, #0066CC)';box.style.background='transparent';box.style.pointerEvents='none';box.style.zIndex='40';
  }
  function _uiSnapshot(focus = null) { return typeof window.RF_UI_TRACE?.snapshot === 'function' ? window.RF_UI_TRACE.snapshot({ focus }) : null; }
  function _uiTrace(event, detail = {}) { return typeof window.RF_UI_TRACE === 'function' ? window.RF_UI_TRACE(event, detail) : null; }
  function _clearLayerChildren(layer) { if (!layer) return; while (layer.firstChild) layer.removeChild(layer.firstChild); }
  function _resolveSelectionLayer() { return typeof DS !== 'undefined' && DS.previewMode ? (_preview().ensurePreviewSelectionLayer() || null) : document.getElementById('handles-layer'); }
  function _clearInactiveSelectionLayers(activeLayer) {
    if (typeof document === 'undefined') return;
    const designLayer = document.getElementById('handles-layer');
    if (designLayer && designLayer !== activeLayer) _clearLayerChildren(designLayer);
    document.querySelectorAll('#preview-content > .preview-selection-layer, #preview-content .preview-hit-layer .preview-selection-layer').forEach((pl) => { if (pl && pl !== activeLayer) _clearLayerChildren(pl); });
  }
  function _syncSelectionDomClasses() { document.querySelectorAll('.cr-element').forEach(d => d.classList.toggle('selected', S.isSelected(d.dataset.id))); if (typeof PreviewHoverOutline !== 'undefined') PreviewHoverOutline.refresh(); }
  function _syncActiveSectionChrome(selectedElements) { const activeSectionIds = new Set(selectedElements.map((el) => el.sectionId)); document.querySelectorAll('.cr-section').forEach((section) => { section.style.boxShadow = activeSectionIds.has(section.dataset.sectionId) ? 'inset 0 0 0 2px rgba(11, 98, 214, 0.6)' : ''; }); }
  function _ensurePreviewOverlay(engine, renderSelectionIds) { const previewOverlayFrozen = DS.previewMode && typeof engine.isSelectionOverlayFrozen === 'function' && engine.isSelectionOverlayFrozen(); const previewOverlayVisible = !DS.previewMode || (typeof engine.isSelectionOverlayVisible === 'function' && engine.isSelectionOverlayVisible() !== false); const hasPreviewSelection = DS.previewMode && renderSelectionIds.length > 0; if (previewOverlayFrozen) return { previewOverlayVisible: false, hasPreviewSelection, previewOverlayFrozen }; if (hasPreviewSelection && !previewOverlayVisible && engine.enableSelectionOverlay) engine.enableSelectionOverlay(); return { previewOverlayVisible, hasPreviewSelection, previewOverlayFrozen: false }; }
  // CR-PARITY-1: Crystal Reports shows the red alignment guides only while
  // a move/resize gesture is actively in progress, in both design and
  // preview — never for a static selection (click/select with no drag),
  // and never after mouseup. Same condition regardless of DS.previewMode.
  function _shouldShowGuides(engine) {
    const drag = engine && engine._drag;
    return !!(drag && (drag.type === 'move' || drag.type === 'resize'));
  }

  function renderHandles(engine) {
    C.assertSelectionState('SelectionEngine.renderHandles.selection');
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
    _syncSelectionDomClasses();
    const selectedIds = [...S.selectedIds()];
    const renderSelectionIds = SelectionHitTest.resolveRenderSelectionIds(engine, selectedIds);
    const selectedElements = S.selectedElementsFromIds(renderSelectionIds);
    _syncActiveSectionChrome(selectedElements);
    const branch = renderSelectionIds.length === 0 ? 'none' : (renderSelectionIds.length === 1 ? 'single' : 'multi');
    if (Array.isArray(window.__rfBranchAudit)) {
      window.__rfBranchAudit.push({ branch, selectedIds, renderSelectionIds: [...renderSelectionIds] });
    }
    if (branch === 'none') {
      _uiTrace('select', { phase: 'after', before: beforeUI, after: _uiSnapshot('#handles-layer'), event: DS.previewMode ? 'preview-select-none' : 'design-select-none', source: 'SelectionOverlay.renderHandles', selection: [], previewMode: !!DS.previewMode, focus: '#handles-layer' });
      return;
    }
    const R = globalThis.SelectionOverlayRender;
    if (!R) throw new Error('SelectionOverlayRender is required for SelectionOverlay.renderHandles');
    const { previewOverlayVisible, hasPreviewSelection, previewOverlayFrozen } = _ensurePreviewOverlay(engine, renderSelectionIds);
    if (previewOverlayFrozen) {
      engine.updateSelectionInfo();
      return;
    }
    if (DS.previewMode && !previewOverlayVisible && !hasPreviewSelection) { engine.updateSelectionInfo(); return; }
    const showGuides = _shouldShowGuides(engine);
    if (branch === 'single') {
      R.renderSingleSelection(engine, layer, renderSelectionIds[0], showGuides);
    } else {
      R.renderMultiSelection(layer, selectedElements, showGuides);
    }
    _uiTrace('select', { phase: 'after', before: beforeUI, after: _uiSnapshot('#handles-layer .sel-box'), event: DS.previewMode ? 'preview-select' : 'design-select', source: 'SelectionOverlay.renderHandles', selection: [...S.selectedIds()], previewMode: !!DS.previewMode, focus: '#handles-layer .sel-box' });
    engine.updateSelectionInfo();
  }

  function clearSelection(engine) {
    S.clearSelectionState();
    if (DS.previewMode && engine.resetSelectionOverlay) engine.resetSelectionOverlay();
    engine.renderHandles();
    PropertiesEngine.render();
    FormatEngine.updateToolbar();
    engine.updateSelectionInfo();
  }

  function updateSelectionInfo() {
    const info = document.getElementById('selection-info');
    if (S.selectedIds().size > 1) { info.style.display = 'block'; info.textContent = `${S.selectedIds().size} objetos seleccionados`; } else info.style.display = 'none';
    SectionEngine.updateSectionsList();
    if (S.selectedIds().size === 1) {
      const el = S.getElementById([...S.selectedIds()][0]);
      if (el) {
        const size = document.getElementById('sb-size');
        size.style.display = 'flex';
        size.textContent = `W: ${el.w}  H: ${el.h}`;
      }
    } else document.getElementById('sb-size').style.display = 'none';
  }

  return { renderHandles, clearSelection, updateSelectionInfo };
})();

if (typeof module !== 'undefined') module.exports = SelectionOverlay;
