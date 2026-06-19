'use strict';

const SelectionEnginePreviewBridge = (() => {
  function _previewMode() {
    if (typeof globalThis !== 'undefined' && globalThis.PreviewEngineMode) return globalThis.PreviewEngineMode;
    if (typeof window !== 'undefined' && window.PreviewEngineMode) return window.PreviewEngineMode;
    return typeof PreviewEngineMode !== 'undefined' ? PreviewEngineMode : null;
  }

  function isSelectionOverlayVisible() {
    const mode = _previewMode();
    return typeof DS === 'undefined' || !DS.previewMode ||
      !mode ||
      typeof mode.isSelectionOverlayVisible !== 'function' ||
      mode.isSelectionOverlayVisible();
  }

  function isSelectionOverlayFrozen() {
    const mode = _previewMode();
    return !!(typeof DS !== 'undefined' && DS.previewMode && mode && typeof mode.isSelectionOverlayFrozen === 'function' && mode.isSelectionOverlayFrozen());
  }

  function enableSelectionOverlay() {
    const mode = _previewMode();
    if (typeof DS !== 'undefined' && DS.previewMode &&
        mode &&
        typeof mode.enableSelectionOverlay === 'function') {
      mode.enableSelectionOverlay();
    }
  }

  function resetSelectionOverlay() {
    const mode = _previewMode();
    if (typeof DS !== 'undefined' && DS.previewMode &&
        mode &&
        typeof mode.resetSelectionOverlay === 'function') {
      mode.resetSelectionOverlay();
    }
  }

  function installSelectionEngineBridge(engine) {
    if (!engine) return engine;
    if (typeof engine.isSelectionOverlayVisible !== 'function') engine.isSelectionOverlayVisible = isSelectionOverlayVisible;
    if (typeof engine.isSelectionOverlayFrozen !== 'function') engine.isSelectionOverlayFrozen = isSelectionOverlayFrozen;
    if (typeof engine.enableSelectionOverlay !== 'function') engine.enableSelectionOverlay = enableSelectionOverlay;
    if (typeof engine.resetSelectionOverlay !== 'function') engine.resetSelectionOverlay = resetSelectionOverlay;
    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function' && !engine.__previewRenderedBridgeInstalled) {
      engine.__previewRenderedBridgeInstalled = true;
      document.addEventListener('rf-preview-rendered', () => {
        if (typeof DS !== 'undefined' && DS.previewMode &&
            typeof engine.isSelectionOverlayVisible === 'function' &&
            engine.isSelectionOverlayVisible() &&
            typeof engine.renderHandles === 'function') {
          engine.renderHandles();
        }
      });
    }
    return engine;
  }

  return {
    isSelectionOverlayVisible,
    isSelectionOverlayFrozen,
    enableSelectionOverlay,
    resetSelectionOverlay,
    installSelectionEngineBridge,
  };
})();

if (typeof module !== 'undefined') {
  module.exports = SelectionEnginePreviewBridge;
}

if (typeof globalThis !== 'undefined') {
  globalThis.SelectionEnginePreviewBridge = SelectionEnginePreviewBridge;
}
