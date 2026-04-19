'use strict';

const PreviewEngineV19 = (() => ({
  // Contract marks kept here for governance grep:
  // assertSelectionState assertLayoutContract assertZoomContract
  // DS.selection DS.zoom preview-layer preview-content
  show: window.PreviewEngineMode.show,
  hide: window.PreviewEngineMode.hide,
  toggle: window.PreviewEngineMode.toggle,
  refresh: window.PreviewEngineRenderer.refresh,
  isActive: window.PreviewEngineMode.isActive,
  _renderWithData: window.PreviewEngineData.renderWithData,
  _renderBand: window.PreviewEngineData.renderBand,
  _renderSectionData: window.PreviewEngineData.renderSectionData,
  _renderElementData: window.PreviewEngineData.renderElement,
  _renderInstanceElement: window.PreviewEngineData.renderInstanceElement,
  _buildCSS() { return ''; },
  getMetrics: window.PreviewEngineRenderer.getMetrics,
}))();

if (typeof module !== 'undefined') module.exports = PreviewEngineV19;
